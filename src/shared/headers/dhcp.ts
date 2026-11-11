import type { LayerDef, LayerInstance, StructDef, StructInstance } from '../schema';
import { buildStruct, type Annotations } from '../lib/build';
import { concat, hex, hexBytes, parseIpv4, parseMac } from '../lib/encode';

// DHCP message format: RFC 2131 section 2 (Figure 1), options: RFC 2132.

const addrField = (id: string, name: string, about: string) => ({ id, name, bits: 32, about, source: { rfc: 2131, section: '2' } });

export const dhcpDef: LayerDef = {
  id: 'dhcp',
  name: 'DHCP message',
  short: 'DHCP',
  osi: [7],
  tcpip: 'application',
  about:
    'DHCP reuses the message format of BOOTP (RFC 951): a fixed part of 236 octets followed by options. Everything DHCP adds to BOOTP lives in the options, including the message type (Discover, Offer, Request, Ack, ...). Clients send from UDP port 68 to port 67, servers answer from 67 to 68.',
  fields: [
    { id: 'op', name: 'op', bits: 8, about: 'Message op code: 1 = BOOTREQUEST (client to server), 2 = BOOTREPLY (server to client). The DHCP message type is in option 53.', source: { rfc: 2131, section: '2' } },
    { id: 'htype', name: 'htype', bits: 8, about: 'Hardware address type, from the ARP hardware type registry: 1 = Ethernet.', source: { rfc: 2131, section: '2' } },
    { id: 'hlen', name: 'hlen', bits: 8, about: 'Hardware address length in octets: 6 for Ethernet.', source: { rfc: 2131, section: '2' } },
    {
      id: 'hops',
      name: 'hops',
      bits: 8,
      about: 'Set to 0 by the client. Each relay agent that forwards the message to a server on another subnet increases it by one.',
      source: { rfc: 2131, section: '2' },
    },
    {
      id: 'xid',
      name: 'xid',
      bits: 32,
      about: 'Transaction ID, a random number chosen by the client. The server copies it into its replies, so the client can match replies to its requests.',
      source: { rfc: 2131, section: '2' },
    },
    { id: 'secs', name: 'secs', bits: 16, about: 'Seconds elapsed since the client began acquiring or renewing an address. Servers may use it to decide which client to serve first.', source: { rfc: 2131, section: '2' } },
    {
      id: 'flagB',
      name: 'Broadcast flag',
      short: 'B',
      bits: 1,
      about:
        'Set by a client that cannot receive unicast IP datagrams before it has an address. Then the server broadcasts its replies. If it is 0, the server sends the replies to the client hardware address and the offered IP address.',
      source: { rfc: 2131, section: '4.1' },
    },
    { id: 'flagsMbz', name: 'MBZ', bits: 15, about: 'Reserved flag bits, must be zero.', source: { rfc: 2131, section: '2' } },
    addrField('ciaddr', 'ciaddr', 'Client IP address. Only filled in when the client already has an address and can answer ARP requests for it (BOUND, RENEWING, REBINDING). Zero during the first address acquisition.'),
    addrField('yiaddr', 'yiaddr', '"Your" IP address: the address the server offers or assigns to the client.'),
    addrField('siaddr', 'siaddr', 'IP address of the next server in the boot process (for example a TFTP server for network boot). Zero when there is none.'),
    addrField('giaddr', 'giaddr', 'Relay agent IP address. Zero when client and server are on the same link; a relay agent puts its own address here so the server knows which subnet the client is on.'),
    {
      id: 'chaddr',
      name: 'chaddr',
      bits: 128,
      compact: true,
      about: 'Client hardware address. 16 octets; for Ethernet the 6-octet MAC address followed by 10 zero octets.',
      source: { rfc: 2131, section: '2' },
    },
    { id: 'sname', name: 'sname', bits: 512, compact: true, about: 'Optional server host name, a null-terminated string. 64 octets, usually all zero.', source: { rfc: 2131, section: '2' } },
    {
      id: 'file',
      name: 'file',
      bits: 1024,
      compact: true,
      about: 'Boot file name for network boot, a null-terminated string. 128 octets, all zero when not used.',
      source: { rfc: 2131, section: '2' },
    },
    {
      id: 'cookie',
      name: 'magic cookie',
      bits: 32,
      about:
        'The first four octets of the options field: 99, 130, 83, 99 (0x63825363). They tell the receiver that the rest is a list of options in the format of RFC 2132, and not the BOOTP vendor area.',
      source: { rfc: 2131, section: '3' },
    },
    {
      id: 'options',
      name: 'options',
      bits: 'variable',
      compact: true,
      about: 'Options as code, length, value. Option 53 is required and says which DHCP message this is. The list ends with the End option (255).',
      source: { rfc: 2132 },
    },
  ],
  sources: [{ rfc: 2131 }, { rfc: 2132 }, { rfc: 951, note: 'BOOTP, origin of the fixed fields' }],
};

// ---- options

const optionDefs = new Map<number, StructDef>();

function optionDef(code: number, name: string, about: string, section: string, value?: string): StructDef {
  const def: StructDef = {
    id: `dhcp-opt-${code}`,
    name: `${name} (${code})`,
    about,
    fields:
      code === 255 || code === 0
        ? [{ id: 'code', name: 'Code', bits: 8, about: `${code}.` }]
        : [
            { id: 'code', name: 'Code', bits: 8, about: `${code}.` },
            { id: 'len', name: 'Len', bits: 8, about: 'Length of the value in octets, without Code and Len.' },
            { id: 'value', name: value ?? 'Value', bits: 'variable', about },
          ],
    sources: [{ rfc: 2132, section }],
  };
  optionDefs.set(code, def);
  return def;
}

optionDef(0, 'Pad', 'A single zero octet without length, used to align the options that follow or to fill the message.', '3.1');
optionDef(1, 'Subnet Mask', 'Subnet mask of the client network.', '3.3');
optionDef(3, 'Router', 'Default gateway(s) for the client, in order of preference.', '3.5');
optionDef(6, 'Domain Name Server', 'DNS resolvers the client should use, in order of preference.', '3.8');
optionDef(12, 'Host Name', 'Name of the client. Clients send it so the server can register or log it.', '3.14');
optionDef(15, 'Domain Name', 'Domain name the client should use when resolving host names.', '3.17');
optionDef(28, 'Broadcast Address', 'Broadcast address of the client subnet.', '5.3');
optionDef(42, 'Network Time Protocol Servers', 'NTP servers the client can use, in order of preference.', '8.3');
optionDef(50, 'Requested IP Address', 'The address the client asks for: in a Request after an Offer, the offered address.', '9.1');
optionDef(51, 'IP Address Lease Time', 'Lease time in seconds. The client must renew before it runs out.', '9.2');
optionDef(52, 'Option Overload', 'Says that the sname or file field holds further options instead of a name: 1 = file, 2 = sname, 3 = both.', '9.3');
optionDef(
  53,
  'DHCP Message Type',
  'Which DHCP message this is: 1 Discover, 2 Offer, 3 Request, 4 Decline, 5 Ack, 6 Nak, 7 Release, 8 Inform.',
  '9.6',
  'Type',
);
optionDef(
  54,
  'Server Identifier',
  'IP address of the server. In a Request it tells all servers which offer the client accepted; the others withdraw theirs.',
  '9.7',
);
optionDef(55, 'Parameter Request List', 'Option codes the client would like the server to send, one octet each.', '9.8');
optionDef(56, 'Message', 'An error message as text, from a server in a Nak or from a client in a Decline.', '9.9');
optionDef(57, 'Maximum DHCP Message Size', 'The largest DHCP message the client accepts, in octets. The smallest legal value is 576.', '9.10');
optionDef(58, 'Renewal (T1) Time Value', 'Seconds from the assignment until the client starts to renew the lease with the server that gave it.', '9.11');
optionDef(59, 'Rebinding (T2) Time Value', 'Seconds from the assignment until the client asks any server to extend the lease.', '9.12');
optionDef(60, 'Vendor class identifier', 'Identifies the vendor and type of the client, so a server can send matching settings.', '9.13');
optionDef(61, 'Client-identifier', 'A unique identifier of the client that the server uses as the key of the lease: a type octet (hardware type, or 0) followed by the identifier.', '9.14');
optionDef(255, 'End', 'Marks the end of the options.', '3.2');

const otherOptionDef: StructDef = {
  id: 'dhcp-opt-other',
  name: 'DHCP option',
  about: 'An option that is not described in detail here. Every option other than Pad and End has Code, Len and a value, so a receiver can skip options it does not know.',
  fields: [
    { id: 'code', name: 'Code', bits: 8, about: 'Option code, assigned by IANA.' },
    { id: 'len', name: 'Len', bits: 8, about: 'Length of the value in octets, without Code and Len.' },
    { id: 'value', name: 'Value', bits: 'variable', about: 'Option data.' },
  ],
  sources: [{ rfc: 2132, section: '2' }, { spec: 'IANA BOOTP Vendor Extensions and DHCP Options', url: 'https://www.iana.org/assignments/bootp-dhcp-parameters/' }],
};

/** The definition of an option, or a generic one for codes without a description. */
export const dhcpOptionDef = (code: number): StructDef => optionDefs.get(code) ?? otherOptionDef;

export const DHCP_TYPES: Record<number, string> = { 1: 'DHCPDISCOVER', 2: 'DHCPOFFER', 3: 'DHCPREQUEST', 4: 'DHCPDECLINE', 5: 'DHCPACK', 6: 'DHCPNAK', 7: 'DHCPRELEASE', 8: 'DHCPINFORM' };

/** Short names for the Parameter Request List. */
const OPTION_NAMES: Record<number, string> = {
  1: 'Subnet Mask',
  3: 'Router',
  6: 'DNS',
  12: 'Host Name',
  15: 'Domain Name',
  28: 'Broadcast Address',
  42: 'NTP Servers',
  51: 'Lease Time',
  58: 'T1',
  59: 'T2',
};

const ADDRESS_OPTIONS = new Set([1, 3, 6, 28, 42, 50, 54]);
const TIME_OPTIONS: Record<number, string> = { 51: 'Lease', 58: 'T1', 59: 'T2' };
const TEXT_OPTIONS: Record<number, string> = { 12: 'Host name', 15: 'Domain', 56: 'Message', 60: 'Vendor class' };

const duration = (s: number) => (s >= 3600 ? `${+(s / 3600).toFixed(2)} h` : s >= 60 ? `${+(s / 60).toFixed(2)} min` : `${s} s`);
const u32 = (b: Uint8Array) => ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
const isText = (b: Uint8Array) => b.every((c) => c >= 0x20 && c < 0x7f);

/**
 * Reads the value of an option. Builders and the header decoder both use it, so both show the same text.
 * `problem` is set when the value does not have the form the option requires.
 */
export function describeDhcpOption(code: number, value: Uint8Array): { display: string; summary: string; problem?: string } {
  const raw = value.length ? hexBytes(value) : 'empty';
  const bad = (problem: string) => ({ display: raw, summary: `Option ${code}`, problem });
  const name = dhcpOptionDef(code).name.replace(/ \(\d+\)$/, '');
  if (code === 53) {
    if (value.length !== 1) return bad('DHCP Message Type (53) must be one octet long.');
    const type = DHCP_TYPES[value[0]] ?? 'unknown';
    return { display: `${value[0]} (${type})`, summary: `Type ${type}` };
  }
  if (ADDRESS_OPTIONS.has(code)) {
    const single = code === 1 || code === 28 || code === 50 || code === 54;
    if (value.length === 0 || value.length % 4 !== 0 || (single && value.length !== 4)) return bad(`${name} (${code}) must hold ${single ? 'one IPv4 address (4 octets)' : 'IPv4 addresses of 4 octets each'}, but is ${value.length} octets long.`);
    const addrs: string[] = [];
    for (let i = 0; i < value.length; i += 4) addrs.push(Array.from(value.subarray(i, i + 4)).join('.'));
    return { display: addrs.join(', '), summary: `${name} ${addrs.join(', ')}` };
  }
  if (TIME_OPTIONS[code]) {
    if (value.length !== 4) return bad(`${name} (${code}) must be 4 octets long.`);
    const s = u32(value);
    // RFC 2131 section 3.3: 0xffffffff stands for infinity.
    if (s === 0xffffffff) return { display: '0xffffffff (infinite)', summary: `${TIME_OPTIONS[code]} infinite` };
    return { display: s >= 60 ? `${s} s (${duration(s)})` : `${s} s`, summary: `${TIME_OPTIONS[code]} ${duration(s)}` };
  }
  if (TEXT_OPTIONS[code]) {
    // Some senders end the text with a zero octet, which RFC 2132 section 2 tolerates.
    const text = value.length && value[value.length - 1] === 0 ? value.subarray(0, -1) : value;
    if (!text.length || !isText(text)) return { display: raw, summary: TEXT_OPTIONS[code] };
    const t = new TextDecoder().decode(text);
    return { display: t, summary: `${TEXT_OPTIONS[code]} ${t}` };
  }
  if (code === 55) {
    const codes = Array.from(value);
    return { display: codes.map((c) => `${c}${OPTION_NAMES[c] ? ` ${OPTION_NAMES[c]}` : ''}`).join(', '), summary: `Requests ${codes.join(', ')}` };
  }
  if (code === 57) {
    if (value.length !== 2) return bad('Maximum DHCP Message Size (57) must be 2 octets long.');
    const size = (value[0] << 8) | value[1];
    return { display: `${size} octets`, summary: `Max size ${size}` };
  }
  if (code === 52) {
    const where = value.length === 1 ? ['', 'file', 'sname', 'file and sname'][value[0]] : undefined;
    if (!where) return bad('Option Overload (52) must be one octet with the value 1, 2 or 3.');
    return { display: `${value[0]} (${where} ${value[0] === 3 ? 'hold' : 'holds'} options)`, summary: `Overload ${where}` };
  }
  if (code === 61) {
    if (value.length < 2) return bad('Client-identifier (61) must be at least 2 octets long.');
    const id = Array.from(value.subarray(1), (x) => x.toString(16).padStart(2, '0')).join(':');
    const display = value[0] === 1 && value.length === 7 ? `type 1 (Ethernet), ${id}` : `type ${value[0]}, ${hexBytes(value.subarray(1))}`;
    return { display, summary: value[0] === 1 && value.length === 7 ? `Client ID ${id}` : 'Client ID' };
  }
  return { display: raw, summary: `Option ${code}` };
}

export type DhcpOption =
  | { code: 53; type: number }
  | { code: 1 | 3 | 6 | 50 | 54; addr: string[] }
  | { code: 51; seconds: number }
  | { code: 15; text: string }
  | { code: 55; codes: number[] }
  | { code: 255 };

function optionValue(o: Exclude<DhcpOption, { code: 255 }>): Uint8Array {
  switch (o.code) {
    case 53:
      return Uint8Array.of(o.type);
    case 51:
      return Uint8Array.of(o.seconds >>> 24, (o.seconds >> 16) & 0xff, (o.seconds >> 8) & 0xff, o.seconds & 0xff);
    case 15:
      return new TextEncoder().encode(o.text);
    case 55:
      return Uint8Array.from(o.codes);
    default:
      return concat(...o.addr.map(parseIpv4));
  }
}

function buildOption(o: DhcpOption): StructInstance {
  const def = optionDefs.get(o.code)!;
  if (o.code === 255) return buildStruct(def, { code: { raw: 255, display: '255' } }, {}, 'End');
  const value = optionValue(o);
  const { display, summary, problem } = describeDhcpOption(o.code, value);
  if (problem) throw new Error(problem);
  return buildStruct(
    def,
    {
      code: { raw: o.code, display: String(o.code) },
      len: { raw: value.length, display: String(value.length) },
      value: { raw: value, display },
    },
    {},
    summary,
  );
}

// ---- message builder

export interface DhcpParams extends Annotations {
  op: 1 | 2;
  xid: number;
  broadcast: boolean;
  ciaddr: string;
  yiaddr: string;
  siaddr: string;
  giaddr: string;
  chaddr: string;
  options: DhcpOption[];
}

const ZERO = (n: number) => new Uint8Array(n);

export function dhcp(p: DhcpParams): LayerInstance {
  const opts = p.options.map(buildOption);
  const optBytes = concat(...opts.map((o) => o.bytes));
  const type = p.options.find((o): o is { code: 53; type: number } => o.code === 53)!.type;
  const addr = (a: string) => ({ raw: parseIpv4(a), display: a === '0.0.0.0' ? '0.0.0.0 (none)' : a });
  return buildStruct(
    dhcpDef,
    {
      op: { raw: p.op, display: p.op === 1 ? '1 (BOOTREQUEST)' : '2 (BOOTREPLY)' },
      htype: { raw: 1, display: '1 (Ethernet)' },
      hlen: { raw: 6, display: '6' },
      hops: { raw: 0, display: '0' },
      xid: { raw: p.xid, display: hex(p.xid, 8) },
      secs: { raw: 0, display: '0' },
      flagB: { raw: p.broadcast ? 1 : 0, display: p.broadcast ? '1 (broadcast)' : '0 (unicast is fine)' },
      flagsMbz: { raw: 0, display: '0' },
      ciaddr: addr(p.ciaddr),
      yiaddr: addr(p.yiaddr),
      siaddr: addr(p.siaddr),
      giaddr: addr(p.giaddr),
      chaddr: { raw: concat(parseMac(p.chaddr), ZERO(10)), display: `${p.chaddr} + 10 zero octets` },
      sname: { raw: ZERO(64), display: '64 zero octets (not used)' },
      file: { raw: ZERO(128), display: '128 zero octets (not used)' },
      cookie: { raw: 0x63825363, display: '0x63825363 (99.130.83.99)' },
      options: { raw: optBytes, display: opts.map((o) => o.summary).join(', '), items: opts },
    },
    p,
    `${DHCP_TYPES[type]}, xid ${hex(p.xid, 8)}`,
  );
}
