import type { Exchange, LayerInstance, Source, Step } from '../../shared/schema';
import { networkLsa, ospfDd, ospfHello, ospfLsAck, ospfLsr, ospfLsu, routerLsa } from '../../shared/headers/ospf';
import { ethIpv4 } from '../../shared/headers/stacks';

// Addresses: IPv4 RFC 5737, MAC RFC 9542. Router IDs are taken from 198.51.100.0/24 so they are
// easy to tell apart from interface addresses; they are not advertised as routes here.
const R1 = { mac: '00:00:5e:00:53:01', ip: '192.0.2.1', rid: '198.51.100.1' };
const R2 = { mac: '00:00:5e:00:53:02', ip: '192.0.2.2', rid: '198.51.100.2' };
const MASK = '255.255.255.0';
const ALL_SPF = { ip: '224.0.0.5', mac: '01:00:5e:00:00:05' };
const MTU = 1500;
const COST = 10;

const S = (section: string): Source => ({ rfc: 2328, section });

// ---- LSAs

/** R1's Router-LSA from when its interface came up: still Waiting, so the LAN is a stub network. */
const r1Lsa = routerLsa({ age: 4, advRouter: R1.rid, seq: 0x80000001, links: [{ type: 3, id: '192.0.2.0', data: MASK, metric: COST }] });
const r2LsaLinks = [{ type: 3 as const, id: '192.0.2.0', data: MASK, metric: COST }, { type: 3 as const, id: '203.0.113.0', data: MASK, metric: COST }];
/** R2's Router-LSA from before R1 appeared, as it sits in R2's database. */
const r2Lsa = routerLsa({ age: 60, advRouter: R2.rid, seq: 0x80000001, links: r2LsaLinks });
/** The same instance one second later, with InfTransDelay added as it is sent. */
const r2LsaSent = routerLsa({ age: 61, advRouter: R2.rid, seq: 0x80000001, links: r2LsaLinks });
/** R2's new Router-LSA once it is fully adjacent as DR: the LAN is now a transit network. */
const r2LsaNew = routerLsa({
  age: 1,
  advRouter: R2.rid,
  seq: 0x80000002,
  links: [{ type: 2, id: R2.ip, data: R2.ip, metric: COST }, { type: 3, id: '203.0.113.0', data: MASK, metric: COST }],
});
const netLsa = networkLsa({ age: 1, advRouter: R2.rid, seq: 0x80000001, drIp: R2.ip, mask: MASK, attached: [R2.rid, R1.rid] });

const DD_R1 = 0x5a3c;
const DD_R2 = 0x7e21;

// ---- frames

let ipId = 0x4100;
function frame(from: typeof R1, to: 'multicast' | typeof R1, ospf: LayerInstance) {
  const dst = to === 'multicast' ? ALL_SPF : to;
  return ethIpv4({
    link: 'lan',
    note: `As sent by ${from === R1 ? 'R1' : 'R2'}.`,
    eth: { src: from.mac, dst: dst.mac },
    ip: {
      src: from.ip,
      dst: dst.ip,
      ttl: 1,
      id: ipId++,
      protocol: 89,
      dscp: 48,
      notes: {
        ttl: to === 'multicast' ? 'RFC 2328 section A.1 requires TTL 1 for packets to the OSPF multicast addresses: they travel one hop only.' : 'This packet goes to a neighbor on the same link.',
        dscp: 'Class Selector 6 (binary 110000), the old IP precedence Internetwork Control that RFC 2328 section A.1 asks for.',
      },
      unverified: {
        df: 'Whether DF is set on OSPF packets depends on the implementation.',
        ...(to === 'multicast' ? {} : { ttl: 'RFC 2328 fixes TTL 1 only for multicast packets; for unicast ones the value is an assumption.' }),
      },
    },
    inner: [ospf],
  });
}

const hello1 = ospfHello({ routerId: R1.rid, mask: MASK, dr: '0.0.0.0', bdr: '0.0.0.0', neighbors: [] });
const hello2 = ospfHello({
  routerId: R2.rid,
  mask: MASK,
  dr: R2.ip,
  bdr: '0.0.0.0',
  neighbors: [R1.rid],
  notes: { neighbors: 'R1 appears here: R2 has heard R1\'s Hello.', dr: 'R2 is DR since it was alone on the network.' },
});
const ddR1Init = ospfDd({ routerId: R1.rid, mtu: MTU, i: true, m: true, ms: true, seq: DD_R1, lsas: [] });
const ddR2Init = ospfDd({ routerId: R2.rid, mtu: MTU, i: true, m: true, ms: true, seq: DD_R2, lsas: [] });
const ddR1Ack = ospfDd({ routerId: R1.rid, mtu: MTU, i: false, m: false, ms: false, seq: DD_R2, lsas: [r1Lsa], notes: { ddSeq: 'R2\'s number: the slave adopts the master\'s sequence.' } });
const ddR2Poll = ospfDd({ routerId: R2.rid, mtu: MTU, i: false, m: false, ms: true, seq: DD_R2 + 1, lsas: [r2Lsa] });
const ddR1Last = ospfDd({ routerId: R1.rid, mtu: MTU, i: false, m: false, ms: false, seq: DD_R2 + 1, lsas: [] });
const lsr = ospfLsr({ routerId: R1.rid, lsas: [r2Lsa] });
const lsu = ospfLsu({ routerId: R2.rid, lsas: [r2LsaSent] });
const ack = ospfLsAck({ routerId: R1.rid, lsas: [r2LsaSent] });
const flood = ospfLsu({ routerId: R2.rid, lsas: [netLsa, r2LsaNew] });

const hdr = (field: string) => ({ layer: 'ospf-hello', field });
const dd = (field: string) => ({ layer: 'ospf-dd', field });

const steps: Step[] = [
  {
    id: 'hello-r1',
    from: 'r1',
    to: 'r2',
    path: ['r1', 'r2'],
    label: 'Hello (no neighbors)',
    states: { r2: 'Init' },
    time: 0,
    category: 'hello',
    protocol: 'OSPF',
    info: hello1.summary!,
    captures: [frame(R1, 'multicast', hello1)],
    sources: [S('9.5'), S('10.5'), S('A.3.2')],
    details: {
      what: 'R1\'s interface has just come up. It multicasts a Hello to AllSPFRouters (224.0.0.5) with its network mask, timers and priority. It has not heard anybody yet, so the neighbor list is empty and it names no Designated Router.',
      why: 'Hellos are how OSPF routers find each other on a LAN. R2 checks that mask, HelloInterval, RouterDeadInterval and the E-bit match its own; then it creates a neighbor entry for R1 in state Init: heard, but not yet sure that R1 hears R2.',
      keyFields: [hdr('neighbors'), hdr('helloInterval'), hdr('deadInterval'), hdr('mask'), hdr('dr'), { layer: 'ipv4', field: 'dst' }],
      typical: 'HelloInterval 10 s and RouterDeadInterval 40 s on a LAN: RFC 2328 appendix C gives 10 seconds as the sample HelloInterval and suggests about four times that for RouterDeadInterval. The IP TTL is 1: Hellos never leave the link.',
      wrong: 'A mismatch in mask, HelloInterval, RouterDeadInterval, area or E-bit makes the receiver drop the Hello silently, so the routers never become neighbors. It is a frequent reason why an OSPF neighbor does not show up.',
    },
  },
  {
    id: 'hello-r2',
    from: 'r2',
    to: 'r1',
    path: ['r2', 'r1'],
    label: 'Hello (DR R2, sees R1)',
    states: { r1: 'ExStart' },
    time: 4200,
    category: 'hello',
    protocol: 'OSPF',
    info: hello2.summary!,
    captures: [frame(R2, 'multicast', hello2)],
    sources: [S('7.3'), S('9.4'), S('10.4'), S('10.5')],
    details: {
      what: 'R2\'s next periodic Hello lists R1\'s Router ID as a neighbor and names R2 itself as Designated Router, with no Backup. R1 finds its own Router ID in the list: communication works both ways (2-Way). Because R2 declares itself DR with no Backup while R1 is still waiting, R1 runs the election at once: R2 stays DR, and R1 becomes Backup Designated Router.',
      why: 'On a LAN, every router forms a full adjacency only with the DR and the BDR, not with every other router. R2 is DR, so R1 starts synchronizing its database with R2 and moves its neighbor R2 to ExStart.',
      keyFields: [hdr('neighbors'), hdr('dr'), hdr('bdr'), hdr('priority')],
      insight: 'The election prefers the highest priority, then the highest Router ID, but a router that comes up on a network with a DR accepts that DR regardless of its own priority (section 7.3). A router with a higher priority that joins later does not take over. That keeps the network stable, since a new DR means new adjacencies and new LSAs for everyone.',
      typical: 'With ten routers on one LAN, full adjacencies between all of them would be 45; with a DR and a BDR, every other router has only two. The DR also speaks for the LAN in the database with one Network-LSA.',
    },
  },
  {
    id: 'dd-r1-init',
    from: 'r1',
    to: 'r2',
    path: ['r1', 'r2'],
    label: 'DB Description (I, M, MS)',
    states: { r2: 'ExStart' },
    time: 4201,
    category: 'dd',
    protocol: 'OSPF',
    info: ddR1Init.summary!,
    captures: [frame(R1, R2, ddR1Init)],
    sources: [S('10.6'), S('10.8'), S('A.3.3')],
    details: {
      what: 'R1 sends an empty Database Description packet to R2\'s own address with the Init, More and Master bits set and a sequence number of its own choice. R2 still had R1 in state Init; a Database Description packet counts as proof of two-way communication, so R2 moves R1 to ExStart as well. Then it ignores the packet: R1\'s Router ID is lower than R2\'s, so R1 cannot be master.',
      why: 'Both routers start by claiming master. The rule is simple: the higher Router ID wins. R2 will answer with its own claim.',
      keyFields: [dd('i'), dd('m'), dd('ms'), dd('ddSeq'), dd('mtu'), { layer: 'ipv4', field: 'dst' }],
      wrong: 'If the two routers have different MTUs on the link, the one with the smaller MTU rejects the other\'s Database Description packets, because it could not receive its largest datagrams. The adjacency then never gets past the database exchange.',
    },
  },
  {
    id: 'dd-r2-init',
    from: 'r2',
    to: 'r1',
    path: ['r2', 'r1'],
    label: 'DB Description (I, M, MS)',
    states: { r1: 'Exchange' },
    time: 4202,
    category: 'dd',
    protocol: 'OSPF',
    info: ddR2Init.summary!,
    captures: [frame(R2, R1, ddR2Init)],
    sources: [S('10.6')],
    details: {
      what: 'R2 sends its own empty Database Description packet with I, M and MS set. R1 sees a higher Router ID with all three bits set: it becomes slave, adopts R2\'s DD sequence number and moves to Exchange.',
      why: 'From now on only the master starts a new round, and the slave answers each packet with the same sequence number. That makes every packet an implicit acknowledgment and keeps the two lists in step.',
      keyFields: [dd('ms'), dd('ddSeq'), { layer: 'ospf-dd', field: 'routerId' }],
    },
  },
  {
    id: 'dd-r1-ack',
    from: 'r1',
    to: 'r2',
    path: ['r1', 'r2'],
    label: 'DB Description (slave, 1 header)',
    states: { r2: 'Exchange' },
    time: 4203,
    category: 'dd',
    protocol: 'OSPF',
    info: ddR1Ack.summary!,
    captures: [frame(R1, R2, ddR1Ack)],
    sources: [S('10.6'), S('10.8')],
    details: {
      what: 'R1 answers as slave: MS off, I off, and R2\'s sequence number. It already lists its database, which holds one LSA: its own Router-LSA. More is off, because R1 has nothing else to describe. R2 recognizes the acknowledgment, becomes master and moves to Exchange. R2 does not have R1\'s Router-LSA, so it puts it on its request list.',
      why: 'Only LSA headers are exchanged here, 20 octets each, not the LSAs themselves. A header identifies an LSA and its instance, so each router can compare it with its own database cheaply.',
      keyFields: [dd('lsas'), dd('ddSeq'), dd('ms'), dd('m')],
    },
  },
  {
    id: 'dd-r2-poll',
    from: 'r2',
    to: 'r1',
    path: ['r2', 'r1'],
    label: 'DB Description (master, 1 header)',
    states: { r1: 'Loading' },
    time: 4204,
    category: 'dd',
    protocol: 'OSPF',
    info: ddR2Poll.summary!,
    captures: [frame(R2, R1, ddR2Poll)],
    sources: [S('10.6'), S('10.8')],
    learned: [{ label: 'R1 request list', value: `Router-LSA ${R2.rid}` }],
    details: {
      what: 'R2, as master, sends the next sequence number with the header of its own Router-LSA. More is off: this is R2\'s whole database. R1 does not have this LSA and puts it on its request list. R1 will answer with More off too, so for R1 the exchange is done, and with a non-empty request list it moves to Loading.',
      why: 'The exchange ends when the master has sent everything and the slave\'s answer has More off. The slave notices this first.',
      keyFields: [dd('lsas'), dd('ddSeq'), dd('m')],
    },
  },
  {
    id: 'dd-r1-last',
    from: 'r1',
    to: 'r2',
    path: ['r1', 'r2'],
    label: 'DB Description (slave, empty)',
    states: { r2: 'Loading' },
    time: 4205,
    category: 'dd',
    protocol: 'OSPF',
    info: ddR1Last.summary!,
    captures: [frame(R1, R2, ddR1Last)],
    sources: [S('10.6')],
    details: {
      what: 'R1 acknowledges R2\'s packet by echoing its sequence number; it has no more headers to send. R2 has sent its whole list and this answer has More off: the exchange is done for R2 too. R2 still wants R1\'s Router-LSA, so it moves to Loading as well.',
      why: 'Both routers now know exactly which LSAs they are missing, without having sent a single complete LSA.',
      keyFields: [dd('ddSeq'), dd('m'), dd('lsas')],
    },
  },
  {
    id: 'lsr',
    from: 'r1',
    to: 'r2',
    path: ['r1', 'r2'],
    label: 'LS Request',
    time: 4206,
    category: 'sync',
    protocol: 'OSPF',
    info: lsr.summary!,
    captures: [frame(R1, R2, lsr)],
    sources: [S('10.9'), S('A.3.4')],
    details: {
      what: 'R1 requests the LSA on its request list: type 1 (Router-LSA), Link State ID and Advertising Router 198.51.100.2. The request is sent to R2\'s own address.',
      why: 'The request names an LSA but not an instance; R2 sends whatever is current. In the same way R2 requests R1\'s Router-LSA and R1 sends it; that direction is not shown here.',
      keyFields: [{ layer: 'ospf-lsr', field: 'requests' }],
    },
  },
  {
    id: 'lsu',
    from: 'r2',
    to: 'r1',
    path: ['r2', 'r1'],
    label: 'LS Update',
    states: { r1: 'Full' },
    time: 4207,
    category: 'sync',
    protocol: 'OSPF',
    info: lsu.summary!,
    captures: [frame(R2, 'multicast', lsu)],
    sources: [S('8.1'), S('10.1'), S('10.7'), S('13'), S('A.3.5'), S('A.4.2'), S('C.3')],
    learned: [{ label: 'R1 request list', value: 'empty' }],
    details: {
      what: 'R2 sends the complete Router-LSA in a Link State Update. It describes R2\'s two links: the shared LAN 192.0.2.0/24 and R2\'s other network 203.0.113.0/24, both as stub networks with cost 10. R1 stores it; its request list is now empty, so its neighbor R2 is Full.',
      why: 'Full means the two routers have the same database. Only Full adjacencies are listed in Router-LSAs and Network-LSAs (section 10.1), so only now can routes go through this neighbor.',
      keyFields: [{ layer: 'ospf-lsu', field: 'lsas' }, { layer: 'ospf-lsu', field: 'count' }, { layer: 'ipv4', field: 'dst' }],
      typical: 'The LS age is one second higher than in the Database Description: a router adds InfTransDelay (sample value for a LAN: 1 second) to every LSA it sends in an update. As DR, R2 sends Link State Updates to the multicast address AllSPFRouters (section 8.1).',
      insight: 'R2 still describes the LAN as a stub network: when it originated this LSA it was alone. So far R1 knows R2\'s networks but cannot reach them in its calculation; that needs the LSAs of the next steps.',
    },
  },
  {
    id: 'ack',
    from: 'r1',
    to: 'r2',
    path: ['r1', 'r2'],
    label: 'LS Acknowledgment',
    states: { r2: 'Full' },
    time: 4900,
    category: 'sync',
    protocol: 'OSPF',
    info: ack.summary!,
    captures: [frame(R1, 'multicast', ack)],
    sources: [S('10.7'), S('10.9'), S('13.5'), S('A.3.6')],
    details: {
      what: 'R1 acknowledges the LSA by repeating its header. Meanwhile R2 has received R1\'s Router-LSA the same way, so R2 is Full too: the adjacency is complete.',
      why: 'Every newly received LSA must be acknowledged. A router keeps each LSA it floods on a retransmission list and resends it every RxmtInterval until it is acknowledged; that makes flooding reliable without TCP. An LSA sent in answer to a request is not kept on that list: if it is lost, the requester repeats its request.',
      keyFields: [{ layer: 'ospf-lsack', field: 'lsas' }, { layer: 'ipv4', field: 'dst' }],
      typical: 'This is a delayed acknowledgment: routers collect acknowledgments for a short time and send them together. As BDR, R1 sends it to AllSPFRouters; a router that is neither DR nor BDR would send it to AllDRouters, 224.0.0.6.',
    },
  },
  {
    id: 'flood',
    from: 'r2',
    to: 'r1',
    path: ['r2', 'r1'],
    label: 'LS Update (new LSAs)',
    time: 5000,
    category: 'flood',
    protocol: 'OSPF',
    info: flood.summary!,
    captures: [frame(R2, 'multicast', flood)],
    sources: [S('12.4'), S('12.4.1.2'), S('12.4.2'), S('16.1'), S('A.4.3')],
    learned: [{ label: 'R1 routing table', value: `203.0.113.0/24 via ${R2.ip}, cost ${2 * COST}` }],
    details: {
      what: 'Now that R2 is DR with a full adjacency, it originates a Network-LSA for the LAN that lists both routers, and a new instance of its Router-LSA (sequence number 0x80000002) that describes the LAN as a transit network. R1 has done the same for its own Router-LSA. R1 acknowledges as before, then runs the shortest-path calculation over its database and installs a route to 203.0.113.0/24 via 192.0.2.2.',
      why: 'The shortest-path tree goes from R1 through its transit link to the LAN, from the LAN (Network-LSA) to R2 at cost 0, and from R2 to its stub network. Cost: 10 for R1\'s link to the LAN plus 10 for R2\'s link to 203.0.113.0/24, so 20. The next hop is R2\'s address on the LAN, taken from R2\'s Router-LSA.',
      keyFields: [{ layer: 'ospf-lsu', field: 'lsas' }, { layer: 'ospf-lsu', field: 'count' }],
      insight: 'A link-state router never receives routes from its neighbors, only descriptions of links. Every router computes its own routes from the same database. That is why OSPF reacts quickly and has no counting to infinity, unlike distance-vector protocols such as RIP.',
      typical: 'A Network-LSA exists only for a LAN whose DR is fully adjacent to at least one other router. On a point-to-point link OSPF elects no DR and originates no Network-LSA.',
    },
  },
];

export const ospfExchange: Exchange = {
  id: 'ospf',
  title: 'OSPF',
  summary: 'Two routers on a LAN become OSPF neighbors: Hello, DR election, database exchange, Full, and the first route.',
  group: 'Internet',
  scenario:
    'Router R2 runs OSPF alone on the LAN 192.0.2.0/24 and also connects the network 203.0.113.0/24. Router R1 is connected to the same LAN and starts OSPF. Both are in the backbone area 0.0.0.0, with cost 10 on every link.',
  intro:
    'OSPF is a widely used routing protocol inside organizations. Routers do not exchange routes; each describes its own links in link-state advertisements (LSAs), all routers of an area keep the same database of LSAs, and every router computes its routes from it with Dijkstra\'s shortest-path algorithm.\n\nThis exchange follows the example of RFC 2328 figure 14: a router comes up on a LAN where a Designated Router already exists, and the two bring their databases in line. The state shown for each router is its state for the neighbor. Authentication is off (Null) to keep the packets readable; real networks should use cryptographic authentication.',
  sources: [
    { rfc: 2328, note: 'OSPF version 2' },
    { rfc: 2328, section: '10.10', note: 'adjacency bring-up example, figure 14' },
    { rfc: 1112, section: '6.4', note: 'IPv4 multicast to Ethernet address mapping' },
    { rfc: 2474, section: '4.2.2', note: 'Class Selector code points' },
    { rfc: 5737, note: 'Documentation IPv4 addresses used here' },
    { rfc: 9542, section: '2.1.4', note: 'Documentation MAC addresses used here' },
  ],
  participants: [
    { id: 'r1', label: 'R1', kind: 'router', addr: { mac: R1.mac, ipv4: R1.ip }, pos: { x: 0, y: 0 }, lifeline: true, note: `Router ID ${R1.rid}` },
    { id: 'r2', label: 'R2', kind: 'router', addr: { mac: R2.mac, ipv4: R2.ip }, pos: { x: 4, y: 0 }, lifeline: true, note: `Router ID ${R2.rid}, DR; also on 203.0.113.0/24` },
  ],
  links: [{ id: 'lan', a: 'r1', b: 'r2', label: 'LAN 192.0.2.0/24' }],
  initialStates: { r1: 'Down', r2: 'Down' },
  categories: [
    { id: 'hello', label: 'Hello', color: 'blue' },
    { id: 'dd', label: 'Database description', color: 'purple' },
    { id: 'sync', label: 'Request, update, acknowledgment', color: 'green' },
    { id: 'flood', label: 'Flooding new LSAs', color: 'yellow' },
  ],
  steps,
};
