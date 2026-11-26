import type { FieldDef, LayerDef, LayerInstance, Source, StructDef, StructInstance } from '../schema';
import { buildStruct, type Annotations, type FieldInputs } from '../lib/build';
import { concat, hex, internetChecksum, pack, parseIpv4 } from '../lib/encode';

// OSPF version 2, RFC 2328. Each packet type is its own LayerDef so the header diagram shows its fields.
// LSAs are sub-structures (items) of the packet fields that carry them.

const S = (section: string): Source => ({ rfc: 2328, section });

const OSI_NOTE =
  'OSPF is carried directly in IP as protocol 89, without TCP or UDP. It exists to fill the routing tables that IP forwarding uses, so it is shown at the network layer, like ICMP. Its own packets are still payload of IP.';

const ABOUT =
  'Open Shortest Path First is a link-state routing protocol for use inside one organization (an autonomous system). Every router describes its links in link-state advertisements (LSAs), all routers of an area keep the same database of LSAs, and each one computes its routes from that database with a shortest-path algorithm.';

/** A 32-bit field holding an IPv4 address or a Router ID. */
const addr = (id: string, name: string, about: string, section: string): FieldDef => ({ id, name, bits: 32, about, source: S(section) });

const header = (type: number, name: string): FieldDef[] => [
  { id: 'version', name: 'Version #', bits: 8, about: 'OSPF version, 2 for OSPF over IPv4. OSPF for IPv6 is version 3 (RFC 5340).', source: S('A.3.1') },
  { id: 'type', name: 'Type', bits: 8, about: `Packet type: 1 Hello, 2 Database Description, 3 Link State Request, 4 Link State Update, 5 Link State Acknowledgment. This packet is ${type} (${name}).`, source: S('A.3.1') },
  { id: 'length', name: 'Packet length', bits: 16, about: 'Length of the OSPF packet in octets, including this 24-octet header.', source: S('A.3.1') },
  addr('routerId', 'Router ID', 'Router ID of the sender. It is a 32-bit number written like an IPv4 address; it is often, but need not be, one of the router\'s addresses.', 'A.3.1'),
  addr('areaId', 'Area ID', 'Area the packet belongs to. 0.0.0.0 is the backbone area. A router drops packets whose Area ID differs from the area of the receiving interface (virtual links aside).', '8.2'),
  { id: 'checksum', name: 'Checksum', bits: 16, about: 'Internet checksum over the whole OSPF packet, excluding the 64-bit Authentication field. The value shown is computed for this example.', source: S('A.3.1') },
  { id: 'auType', name: 'AuType', bits: 16, about: 'Authentication procedure: 0 none (Null), 1 simple password, 2 cryptographic. All routers on a network must use the same one.', source: S('D') },
  { id: 'auth', name: 'Authentication', bits: 64, about: 'Data for the authentication procedure. With Null authentication it is not examined; here it is zero.', source: S('D.4.1') },
];

const optionsField: FieldDef = {
  id: 'options',
  name: 'Options',
  bits: 8,
  about: 'Optional capabilities. Only the E-bit (0x02) is defined by RFC 2328: set when the area is not a stub area, so AS-external routes are flooded into it. A router drops Hellos whose E-bit does not match its own area.',
  source: S('A.2'),
};

const def = (id: string, type: number, name: string, about: string, fields: FieldDef[], sources: Source[]): LayerDef => ({
  id,
  name: `OSPF ${name} packet`,
  short: 'OSPF',
  osi: [3],
  tcpip: 'internet',
  osiNote: OSI_NOTE,
  about: `${ABOUT}\n\n${about}`,
  fields: [...header(type, name), ...fields],
  sources: [S('A.3.1'), ...sources],
});

export const ospfHelloDef = def(
  'ospf-hello',
  1,
  'Hello',
  'Hello packets are sent every HelloInterval to the multicast address AllSPFRouters (224.0.0.5). They discover neighbors, check that both sides agree on the network\'s parameters, and carry each router\'s view of the Designated Router.',
  [
    addr('mask', 'Network Mask', 'Mask of the network the interface is on. Must match on all routers of a broadcast network.', 'A.3.2'),
    { id: 'helloInterval', name: 'HelloInterval', bits: 16, about: 'Seconds between this router\'s Hellos. Must match on all routers of the network; RFC 2328 gives 10 seconds as a sample value for a LAN.', source: S('C.3') },
    optionsField,
    { id: 'priority', name: 'Rtr Pri', bits: 8, about: 'Router Priority for the election of the Designated Router. The highest priority wins, then the highest Router ID. 0 means the router never becomes DR or BDR.', source: S('A.3.2') },
    { id: 'deadInterval', name: 'RouterDeadInterval', bits: 32, about: 'Seconds without a Hello before the neighbor is declared down. Must match on all routers; RFC 2328 suggests about four times HelloInterval.', source: S('C.3') },
    addr('dr', 'Designated Router', 'The Designated Router of this network as the sender sees it, by its interface address. 0.0.0.0 if there is none yet.', 'A.3.2'),
    addr('bdr', 'Backup Designated Router', 'The Backup Designated Router as the sender sees it, by its interface address. 0.0.0.0 if there is none.', 'A.3.2'),
    { id: 'neighbors', name: 'Neighbor', bits: 'variable', about: 'Router IDs of every router the sender has heard a Hello from within RouterDeadInterval. A router that finds its own Router ID here knows that communication works in both directions.', source: S('A.3.2') },
  ],
  [S('9.5'), S('10.5')],
);

export const ospfDdDef = def(
  'ospf-dd',
  2,
  'Database Description',
  'Database Description packets are exchanged when an adjacency comes up. They list the headers of all LSAs in the sender\'s database, so the other side can see which ones it lacks. One router is master and sends polls, the other is slave and answers each poll with the same DD sequence number.',
  [
    { id: 'mtu', name: 'Interface MTU', bits: 16, about: 'Largest IP datagram the sender can send on this interface without fragmentation. A router rejects Database Description packets whose MTU is larger than it can receive, so an MTU mismatch keeps an adjacency stuck before Exchange.', source: S('10.6') },
    optionsField,
    { id: 'zero', name: 'Reserved', bits: 5, about: 'Zero.', source: S('A.3.3') },
    { id: 'i', name: 'I-bit', short: 'I', bits: 1, about: 'Init: set in the first packet of the sequence.', source: S('A.3.3') },
    { id: 'm', name: 'M-bit', short: 'M', bits: 1, about: 'More: set when more Database Description packets follow from this sender.', source: S('A.3.3') },
    { id: 'ms', name: 'MS-bit', short: 'MS', bits: 1, about: 'Master/Slave: 1 if the sender is master. Both routers start by claiming master; the one with the higher Router ID keeps it.', source: S('A.3.3') },
    { id: 'ddSeq', name: 'DD sequence number', bits: 32, about: 'Numbers the polls of the master. The master increments it with each new packet, and the slave echoes the number of the packet it answers.', source: S('A.3.3') },
    { id: 'lsas', name: 'LSA headers', bits: 'variable', compact: true, about: 'Headers of LSAs in the sender\'s database, 20 octets each. A header identifies an LSA and its instance (sequence number, checksum, age) without its contents.', source: S('A.3.3') },
  ],
  [S('10.6'), S('10.8')],
);

export const ospfLsrDef = def(
  'ospf-lsr',
  3,
  'Link State Request',
  'After the database description, a router requests the LSAs it is missing or has only in an older instance.',
  [{ id: 'requests', name: 'Requested LSAs', bits: 'variable', compact: true, about: 'One 12-octet entry per LSA: LS type, Link State ID and Advertising Router. That identifies the LSA but not an instance; the neighbor sends its current one.', source: S('A.3.4') }],
  [S('10.7'), S('10.9')],
);

export const ospfLsuDef = def(
  'ospf-lsu',
  4,
  'Link State Update',
  'Link State Updates carry complete LSAs, both in answer to requests and when routers flood new LSAs. Every LSA received in an update must be acknowledged, which makes flooding reliable.',
  [
    { id: 'count', name: '# LSAs', bits: 32, about: 'Number of LSAs in this packet.', source: S('A.3.5') },
    { id: 'lsas', name: 'LSAs', bits: 'variable', compact: true, about: 'The LSAs, each with its 20-octet header followed by the type-specific contents.', source: S('A.3.5') },
  ],
  [S('13')],
);

export const ospfLsAckDef = def(
  'ospf-lsack',
  5,
  'Link State Acknowledgment',
  'Link State Acknowledgments confirm received LSAs, by repeating their headers. Several LSAs can be acknowledged in one packet.',
  [{ id: 'lsas', name: 'LSA headers', bits: 'variable', compact: true, about: 'Headers of the acknowledged LSAs, 20 octets each.', source: S('A.3.6') }],
  [S('13.5')],
);

// ---- LSAs (sub-structures)

const lsaHeaderFields: FieldDef[] = [
  { id: 'age', name: 'LS age', bits: 16, about: 'Seconds since the LSA was originated. Each router adds InfTransDelay when it sends the LSA on; an LSA that reaches MaxAge (one hour) is flooded once more to flush it from all databases.', source: S('A.4.1') },
  optionsField,
  { id: 'lsType', name: 'LS type', bits: 8, about: '1 Router-LSA, 2 Network-LSA, 3 and 4 Summary-LSAs, 5 AS-external-LSA.', source: S('A.4.1') },
  addr('lsId', 'Link State ID', 'What the LSA describes: for a Router-LSA the originating router\'s Router ID, for a Network-LSA the Designated Router\'s interface address.', 'A.4.1'),
  addr('advRouter', 'Advertising Router', 'Router ID of the router that originated the LSA.', 'A.4.1'),
  { id: 'seq', name: 'LS sequence number', bits: 32, about: 'Instance number. The first instance uses InitialSequenceNumber 0x80000001; each new instance counts up, and the higher number is the more recent one.', source: S('12.1.6') },
  { id: 'lsChecksum', name: 'LS checksum', bits: 16, about: 'Fletcher checksum of the whole LSA except LS age, so the age can change without recomputing it. The value shown is computed for this example.', source: S('12.1.7') },
  { id: 'lsLength', name: 'length', bits: 16, about: 'Length of the LSA in octets, including the 20-octet header.', source: S('A.4.1') },
];

const lsaHeaderDef: StructDef = { id: 'ospf-lsa-header', name: 'LSA header', about: 'Identifies one instance of an LSA.', fields: lsaHeaderFields, sources: [S('A.4.1')] };

const routerLsaDef: StructDef = {
  id: 'ospf-router-lsa',
  name: 'Router-LSA (type 1)',
  about: 'Every router originates one Router-LSA per area, listing its links into the area and their costs.',
  fields: [
    ...lsaHeaderFields,
    { id: 'flags', name: 'V, E, B', bits: 16, about: 'Bits for virtual-link endpoint (V), AS boundary router (E) and area border router (B), surrounded by zero bits.', source: S('A.4.2') },
    { id: 'numLinks', name: '# links', bits: 16, about: 'Number of links described.', source: S('A.4.2') },
    { id: 'links', name: 'Links', bits: 'variable', about: 'Per link: Link ID, Link Data, Type (1 point-to-point, 2 transit network, 3 stub network, 4 virtual link), number of TOS metrics, and the metric (cost). For a stub network the Link ID is the network address and Link Data the mask; for a transit network the Link ID is the DR\'s interface address and Link Data the router\'s own.', source: S('A.4.2') },
  ],
  sources: [S('A.4.2'), S('12.4.1')],
};

const networkLsaDef: StructDef = {
  id: 'ospf-network-lsa',
  name: 'Network-LSA (type 2)',
  about: 'The Designated Router of a broadcast network originates a Network-LSA that lists all routers fully adjacent to it, including itself.',
  fields: [
    ...lsaHeaderFields,
    addr('mask', 'Network Mask', 'Mask of the network.', 'A.4.3'),
    { id: 'attached', name: 'Attached Router', bits: 'variable', about: 'Router IDs of the routers on the network that are fully adjacent to the DR, and the DR itself.', source: S('A.4.3') },
  ],
  sources: [S('A.4.3'), S('12.4.2')],
};

const lsrEntryDef: StructDef = {
  id: 'ospf-lsr-entry',
  name: 'Requested LSA',
  about: 'Identifies one LSA, not an instance of it.',
  fields: [
    { id: 'lsType', name: 'LS type', bits: 32, about: 'Type of the requested LSA, here in a 32-bit field.', source: S('A.3.4') },
    addr('lsId', 'Link State ID', 'Link State ID of the requested LSA.', 'A.3.4'),
    addr('advRouter', 'Advertising Router', 'Advertising Router of the requested LSA.', 'A.3.4'),
  ],
  sources: [S('A.3.4')],
};

/**
 * Fletcher checksum of an LSA as used by OSPF, RFC 2328 section 12.1.7 (ISO 8473 Annex B).
 * Covers the LSA from octet 2 (LS age excluded); the checksum field is at LSA octet 16.
 * Check octets are chosen so that both running sums over the covered data are 0 mod 255.
 */
export function lsaChecksum(lsa: Uint8Array): number {
  const data = lsa.subarray(2);
  const at = 14;
  let c0 = 0;
  let c1 = 0;
  for (let i = 0; i < data.length; i++) {
    c0 = (c0 + (i === at || i === at + 1 ? 0 : data[i])) % 255;
    c1 = (c1 + c0) % 255;
  }
  let x = ((data.length - at - 1) * c0 - c1) % 255;
  if (x <= 0) x += 255;
  let y = 510 - c0 - x;
  if (y > 255) y -= 255;
  return (x << 8) | y;
}

export interface Lsa {
  /** The complete LSA, shown in Link State Updates. */
  full: StructInstance;
  /** Its header alone, shown in Database Description packets and acknowledgments. */
  header: StructInstance;
  type: number;
  lsId: string;
  advRouter: string;
}

interface LsaBase {
  age: number;
  advRouter: string;
  seq: number;
}

const TYPE_NAMES: Record<number, string> = { 1: 'Router-LSA', 2: 'Network-LSA' };

function lsa(d: StructDef, type: number, lsId: string, p: LsaBase, body: (len: number) => FieldInputs, bodyOctets: number, summary: string): Lsa {
  const len = 20 + bodyOctets;
  const head = (c: number): FieldInputs => ({
    age: { raw: p.age, display: `${p.age} s` },
    options: { raw: 0x02, display: '0x02 (E)' },
    lsType: { raw: type, display: `${type} (${TYPE_NAMES[type]})` },
    lsId: { raw: parseIpv4(lsId), display: lsId },
    advRouter: { raw: parseIpv4(p.advRouter), display: p.advRouter },
    seq: { raw: p.seq, display: hex(p.seq, 8) },
    lsChecksum: { raw: c, display: hex(c, 4) },
    lsLength: { raw: len, display: String(len) },
  });
  const c = lsaChecksum(buildStruct(d, { ...head(0), ...body(len) }).bytes);
  const id = `${TYPE_NAMES[type]} ${lsId}, seq ${hex(p.seq, 8)}`;
  return {
    full: buildStruct(d, { ...head(c), ...body(len) }, {}, `${id}: ${summary}`),
    header: buildStruct(lsaHeaderDef, head(c), {}, id),
    type,
    lsId,
    advRouter: p.advRouter,
  };
}

export interface RouterLink {
  /** 2 transit network, 3 stub network. */
  type: 2 | 3;
  id: string;
  data: string;
  metric: number;
}

const LINK_TYPES: Record<number, string> = { 2: 'transit', 3: 'stub' };

export function routerLsa(p: LsaBase & { links: RouterLink[] }): Lsa {
  const bytes = concat(...p.links.map((l) => pack([
    { bits: 32, raw: parseIpv4(l.id) },
    { bits: 32, raw: parseIpv4(l.data) },
    { bits: 8, raw: l.type },
    { bits: 8, raw: 0 },
    { bits: 16, raw: l.metric },
  ])));
  const text = p.links.map((l) => `${LINK_TYPES[l.type]} ${l.type === 3 ? `${l.id} mask ${l.data}` : `DR ${l.id}, own address ${l.data}`}, metric ${l.metric}`).join('; ');
  return lsa(routerLsaDef, 1, p.advRouter, p, () => ({
    flags: { raw: 0, display: 'none set' },
    numLinks: { raw: p.links.length, display: String(p.links.length) },
    links: { raw: bytes, display: text },
  }), 4 + bytes.length, text);
}

export function networkLsa(p: LsaBase & { drIp: string; mask: string; attached: string[] }): Lsa {
  const bytes = concat(...p.attached.map(parseIpv4));
  return lsa(networkLsaDef, 2, p.drIp, p, () => ({
    mask: { raw: parseIpv4(p.mask), display: p.mask },
    attached: { raw: bytes, display: p.attached.join(', ') },
  }), 4 + bytes.length, `attached ${p.attached.join(', ')}`);
}

// ---- packets

export interface OspfParams extends Annotations {
  routerId: string;
  area?: string;
}

const TYPE_OF: Record<string, number> = { 'ospf-hello': 1, 'ospf-dd': 2, 'ospf-lsr': 3, 'ospf-lsu': 4, 'ospf-lsack': 5 };

function packet(d: LayerDef, p: OspfParams, body: FieldInputs, summary: string): LayerInstance {
  const area = p.area ?? '0.0.0.0';
  const type = TYPE_OF[d.id];
  const fields = (len: number, c: number): FieldInputs => ({
    version: { raw: 2, display: '2' },
    type: { raw: type, display: `${type} (${d.name.replace(/^OSPF | packet$/g, '')})` },
    length: { raw: len, display: String(len) },
    routerId: { raw: parseIpv4(p.routerId), display: p.routerId },
    areaId: { raw: parseIpv4(area), display: area === '0.0.0.0' ? '0.0.0.0 (backbone)' : area },
    checksum: { raw: c, display: hex(c, 4) },
    auType: { raw: 0, display: '0 (Null)' },
    auth: { raw: new Uint8Array(8), display: '0' },
    ...body,
  });
  const len = buildStruct(d, fields(0, 0)).bytes.length;
  // With Null authentication the Authentication field is zero, so summing it changes nothing.
  const c = internetChecksum(buildStruct(d, fields(len, 0)).bytes);
  return buildStruct(d, fields(len, c), p, summary);
}

const ipList = (ips: string[]) => ({ raw: concat(...ips.map(parseIpv4)), display: ips.length ? ips.join(', ') : 'none' });
const headers = (lsas: Lsa[]) => ({ raw: concat(...lsas.map((l) => l.header.bytes)), display: lsas.length ? lsas.map((l) => l.header.summary).join('; ') : 'none', items: lsas.map((l) => l.header) });

export function ospfHello(p: OspfParams & { mask: string; dr: string; bdr: string; neighbors: string[]; priority?: number }): LayerInstance {
  const pri = p.priority ?? 1;
  return packet(ospfHelloDef, p, {
    mask: { raw: parseIpv4(p.mask), display: p.mask },
    helloInterval: { raw: 10, display: '10 s' },
    options: { raw: 0x02, display: '0x02 (E)' },
    priority: { raw: pri, display: String(pri) },
    deadInterval: { raw: 40, display: '40 s' },
    dr: { raw: parseIpv4(p.dr), display: p.dr },
    bdr: { raw: parseIpv4(p.bdr), display: p.bdr },
    neighbors: ipList(p.neighbors),
  }, `Hello, DR ${p.dr}, BDR ${p.bdr}, neighbors: ${p.neighbors.length ? p.neighbors.join(', ') : 'none'}`);
}

export function ospfDd(p: OspfParams & { mtu: number; i: boolean; m: boolean; ms: boolean; seq: number; lsas: Lsa[] }): LayerInstance {
  const flags = [p.i && 'I', p.m && 'M', p.ms && 'MS'].filter(Boolean).join(', ') || 'none';
  const bit = (b: boolean) => ({ raw: b ? 1 : 0, display: b ? '1' : '0' });
  return packet(ospfDdDef, p, {
    mtu: { raw: p.mtu, display: String(p.mtu) },
    options: { raw: 0x02, display: '0x02 (E)' },
    zero: { raw: 0, display: '0' },
    i: bit(p.i),
    m: bit(p.m),
    ms: bit(p.ms),
    ddSeq: { raw: p.seq, display: `${hex(p.seq, 8)} (${p.seq})` },
    lsas: headers(p.lsas),
  }, `DD seq ${p.seq}, flags ${flags}, ${p.lsas.length} LSA header${p.lsas.length === 1 ? '' : 's'}`);
}

export function ospfLsr(p: OspfParams & { lsas: Lsa[] }): LayerInstance {
  const items = p.lsas.map((l) => buildStruct(lsrEntryDef, {
    lsType: { raw: l.type, display: `${l.type} (${TYPE_NAMES[l.type]})` },
    lsId: { raw: parseIpv4(l.lsId), display: l.lsId },
    advRouter: { raw: parseIpv4(l.advRouter), display: l.advRouter },
  }, {}, `${TYPE_NAMES[l.type]} ${l.lsId}`));
  return packet(ospfLsrDef, p, {
    requests: { raw: concat(...items.map((i) => i.bytes)), display: items.map((i) => i.summary).join('; '), items },
  }, `LS Request: ${items.map((i) => i.summary).join(', ')}`);
}

export function ospfLsu(p: OspfParams & { lsas: Lsa[] }): LayerInstance {
  return packet(ospfLsuDef, p, {
    count: { raw: p.lsas.length, display: String(p.lsas.length) },
    lsas: { raw: concat(...p.lsas.map((l) => l.full.bytes)), display: p.lsas.map((l) => l.header.summary).join('; '), items: p.lsas.map((l) => l.full) },
  }, `LS Update: ${p.lsas.map((l) => l.header.summary).join('; ')}`);
}

export function ospfLsAck(p: OspfParams & { lsas: Lsa[] }): LayerInstance {
  return packet(ospfLsAckDef, p, { lsas: headers(p.lsas) }, `LS Ack: ${p.lsas.map((l) => l.header.summary).join('; ')}`);
}
