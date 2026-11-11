import type { LayerDef, LayerInstance, StructDef, StructInstance } from '../../shared/schema';
import { describeDhcpOption, dhcpDef, dhcpOptionDef, DHCP_TYPES } from '../../shared/headers/dhcp';
import { type Display, forInput, hex, hexBytes, instance, ip4, mac, num, type Report, slice } from './fields';

// DHCP messages: RFC 2131 section 2, options: RFC 2132.

const DHCP = forInput(dhcpDef);
const FIXED = 236;
const COOKIE = [99, 130, 83, 99];

/** A message without the magic cookie: BOOTP with a vendor area that is not a list of options. */
const BOOTP: LayerDef = {
  ...DHCP,
  id: 'bootp',
  name: 'BOOTP message',
  short: 'BOOTP',
  about: 'BOOTP is the predecessor of DHCP and has the same fixed fields. This message does not carry the magic cookie that starts the DHCP options, so what follows the fixed part is not read as options.',
  fields: [...DHCP.fields.filter((f) => f.id !== 'cookie' && f.id !== 'options'), { id: 'vend', name: 'vend', bits: 'variable', compact: true, about: 'Vendor-specific area. Without the magic cookie its format is not known.', source: { rfc: 951, section: '3' } }],
  sources: [{ rfc: 951 }, { rfc: 2131, section: '2' }],
};

const PADDING: StructDef = {
  id: 'dhcp-padding',
  name: 'Padding',
  about: 'Zero octets after the End option. Senders fill the message this way to reach the 300 octets of a BOOTP message: receivers of BOOTP discard shorter messages.',
  fields: [{ id: 'pad', name: 'Padding', bits: 'variable', about: 'Zero octets, ignored by the receiver.' }],
  sources: [{ rfc: 1542, section: '2.1' }, { rfc: 951, section: '3' }],
};

const forOption = (code: number) => forInput(dhcpOptionDef(code));

/** A null-terminated string field: sname or file. */
function text(b: Uint8Array, overloaded: boolean): Display[string] {
  if (overloaded) return { display: `${b.length} octets holding options`, note: 'Option 52 (Option Overload) says that this field carries options. They are not decoded here.' };
  if (b.every((x) => x === 0)) return `${b.length} zero octets (not used)`;
  const end = b.indexOf(0) < 0 ? b.length : b.indexOf(0);
  const printable = b.subarray(0, end).every((c) => c >= 0x20 && c < 0x7f);
  return printable ? `"${String.fromCharCode(...b.subarray(0, end))}"` : hexBytes(b);
}

function options(bytes: Uint8Array, report: Report): { items: StructInstance[]; type?: number; overload: number } {
  const items: StructInstance[] = [];
  let type: number | undefined;
  let overload = 0;
  let ended = false;
  let i = 0;
  while (i < bytes.length) {
    const code = bytes[i];
    if (code === 0 || code === 255) {
      const def = forOption(code);
      const b = bytes.subarray(i, i + 1);
      items.push(instance(def, b, slice(def.fields, b), { code: String(code) }, code ? 'End' : 'Pad'));
      i += 1;
      if (code === 255) {
        ended = true;
        break;
      }
      continue;
    }
    const len = bytes[i + 1];
    if (len === undefined || i + 2 + len > bytes.length) {
      report('error', `DHCP option ${code} at octet ${i} of the options is cut off: ${len === undefined ? 'its length octet is missing' : `it says ${len} octets, but only ${bytes.length - i - 2} are left`}. The options after it are not decoded.`);
      return { items, type, overload };
    }
    const b = bytes.subarray(i, i + 2 + len);
    const value = b.subarray(2);
    const def = forOption(code);
    const d = describeDhcpOption(code, value);
    if (d.problem) report('warning', d.problem);
    else if (code === 53) type = value[0];
    else if (code === 52) overload = value[0];
    items.push(instance(def, b, slice(def.fields, b, { value: len }), { code: String(code), len: String(len), value: d.display }, d.summary));
    i += 2 + len;
  }
  if (!ended) report('warning', "The DHCP options do not end with the End option (255). RFC 2131 section 4.1 requires it as the last option.");
  else if (i < bytes.length) {
    const rest = bytes.subarray(i);
    if (rest.every((x) => x === 0)) items.push(instance(PADDING, rest, slice(PADDING.fields, rest), { pad: `${rest.length} zero octets` }, `${rest.length} octets of padding`));
    else report('warning', `${rest.length} octets follow the End option of DHCP and are not all zero.`);
  }
  return { items, type, overload };
}

export function decodeDhcp(msg: Uint8Array, report: Report): LayerInstance | undefined {
  if (msg.length < FIXED) {
    report('error', `The fixed part of a DHCP message is ${FIXED} octets, but only ${msg.length} are left. The input is cut off.`);
    return undefined;
  }
  const hasCookie = msg.length >= FIXED + 4 && COOKIE.every((c, i) => msg[FIXED + i] === c);
  const def = hasCookie ? DHCP : BOOTP;
  const s = slice(def.fields, msg);
  const opts = hasCookie ? options(s.bin.options, report) : { items: [], type: undefined, overload: 0 };
  const op = num(s.raw.op);
  const htype = num(s.raw.htype);
  const hlen = num(s.raw.hlen);
  const xid = hex(num(s.raw.xid), 8);
  const chaddr = s.bin.chaddr;
  const addr = (b: Uint8Array) => (b.every((x) => x === 0) ? '0.0.0.0 (none)' : ip4(b));
  const display: Display = {
    op: op === 1 ? '1 (BOOTREQUEST)' : op === 2 ? '2 (BOOTREPLY)' : { display: String(op), note: 'Not a defined op code: only 1 and 2 exist.' },
    htype: htype === 1 ? '1 (Ethernet)' : String(htype),
    hlen: String(hlen),
    hops: String(num(s.raw.hops)),
    xid,
    secs: String(num(s.raw.secs)),
    flagB: num(s.raw.flagB) ? '1 (broadcast)' : '0 (unicast is fine)',
    flagsMbz: num(s.raw.flagsMbz) ? { display: hex(num(s.raw.flagsMbz), 4), note: 'Must be zero.' } : '0',
    ciaddr: addr(s.bin.ciaddr),
    yiaddr: addr(s.bin.yiaddr),
    siaddr: addr(s.bin.siaddr),
    giaddr: addr(s.bin.giaddr),
    chaddr: htype === 1 && hlen === 6 && chaddr.subarray(6).every((x) => x === 0) ? `${mac(chaddr.subarray(0, 6))} + 10 zero octets` : hexBytes(chaddr),
    sname: text(s.bin.sname, (opts.overload & 2) !== 0),
    file: text(s.bin.file, (opts.overload & 1) !== 0),
  };
  if (hasCookie) {
    display.cookie = '0x63825363 (99.130.83.99)';
    display.options = opts.items.length ? { display: opts.items.map((o) => o.summary).join(', '), items: opts.items } : 'none';
    if (opts.type === undefined) report('info', 'There is no valid DHCP Message Type option (53). Every DHCP message must have one (RFC 2131 section 3); without it this is a BOOTP message with options.');
  } else {
    const vend = s.bin.vend;
    display.vend = vend.length ? (vend.every((x) => x === 0) ? `${vend.length} zero octets` : `${vend.length} octets: ${hexBytes(vend)}`) : 'none';
    report('info', 'The message does not have the DHCP magic cookie (99.130.83.99) after the fixed fields, so it is shown as BOOTP without options.');
  }
  const kind = opts.type !== undefined ? (DHCP_TYPES[opts.type] ?? `DHCP message type ${opts.type}`) : `BOOTP ${op === 2 ? 'reply' : 'request'}`;
  return instance(def, msg, s, display, `${kind}, xid ${xid}`);
}
