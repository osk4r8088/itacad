import type { LayerDef, LayerInstance, StructDef, StructInstance } from '../schema';
import { buildStruct, type Annotations } from '../lib/build';
import { concat, hex, parseIpv4, parseMac } from '../lib/encode';

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

optionDef(1, 'Subnet Mask', 'Subnet mask of the client network.', '3.3');
optionDef(3, 'Router', 'Default gateway(s) for the client, in order of preference.', '3.5');
optionDef(6, 'Domain Name Server', 'DNS resolvers the client should use, in order of preference.', '3.8');
optionDef(15, 'Domain Name', 'Domain name the client should use when resolving host names.', '3.17');
optionDef(50, 'Requested IP Address', 'The address the client asks for: in a Request after an Offer, the offered address.', '9.1');
optionDef(51, 'IP Address Lease Time', 'Lease time in seconds. The client must renew before it runs out.', '9.2');
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
optionDef(255, 'End', 'Marks the end of the options.', '3.2');

export const DHCP_TYPES: Record<number, string> = { 1: 'DHCPDISCOVER', 2: 'DHCPOFFER', 3: 'DHCPREQUEST', 4: 'DHCPDECLINE', 5: 'DHCPACK', 6: 'DHCPNAK', 7: 'DHCPRELEASE', 8: 'DHCPINFORM' };

const OPTION_NAMES: Record<number, string> = { 1: 'Subnet Mask', 3: 'Router', 6: 'DNS', 15: 'Domain Name', 51: 'Lease Time' };

export type DhcpOption =
  | { code: 53; type: number }
  | { code: 1 | 3 | 6 | 50 | 54; addr: string[] }
  | { code: 51; seconds: number }
  | { code: 15; text: string }
  | { code: 55; codes: number[] }
  | { code: 255 };

function buildOption(o: DhcpOption): StructInstance {
  const def = optionDefs.get(o.code)!;
  if (o.code === 255) return buildStruct(def, { code: { raw: 255, display: '255' } }, {}, 'End');
  let value: Uint8Array;
  let display: string;
  let summary: string;
  switch (o.code) {
    case 53:
      value = Uint8Array.of(o.type);
      display = `${o.type} (${DHCP_TYPES[o.type]})`;
      summary = `Type ${DHCP_TYPES[o.type]}`;
      break;
    case 51:
      value = Uint8Array.of(o.seconds >>> 24, (o.seconds >> 16) & 0xff, (o.seconds >> 8) & 0xff, o.seconds & 0xff);
      display = `${o.seconds} s (${o.seconds / 3600} h)`;
      summary = `Lease ${o.seconds / 3600} h`;
      break;
    case 15:
      value = new TextEncoder().encode(o.text);
      display = o.text;
      summary = `Domain ${o.text}`;
      break;
    case 55:
      value = Uint8Array.from(o.codes);
      display = o.codes.map((c) => `${c}${OPTION_NAMES[c] ? ` ${OPTION_NAMES[c]}` : ''}`).join(', ');
      summary = `Requests ${o.codes.join(', ')}`;
      break;
    default:
      value = concat(...o.addr.map(parseIpv4));
      display = o.addr.join(', ');
      summary = `${def.name.replace(/ \(\d+\)$/, '')} ${o.addr.join(', ')}`;
  }
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
