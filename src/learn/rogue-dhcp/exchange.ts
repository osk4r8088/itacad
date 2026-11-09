import type { Capture, Exchange, LayerInstance, Source } from '../../shared/schema';
import { dhcp, type DhcpOption } from '../../shared/headers/dhcp';
import { dns, dnsInfo, type DnsParams } from '../../shared/headers/dns';
import { ethIpv4Udp } from '../../shared/headers/stacks';
import { buildStep, type Spec } from '../spec';

// Rogue DHCP server: a host in the LAN answers DHCP faster than the real server and hands out
// itself as gateway and DNS resolver. DHCP snooping on the switch blocks server messages from
// untrusted ports. Same addresses as the DHCP exchange; the attacker is new.

const LAPTOP_MAC = '00:00:5e:00:53:0a';
const ROUTER = { mac: '00:00:5e:00:53:01', ip: '192.0.2.1' };
const ROGUE = { mac: '00:00:5e:00:53:66', ip: '192.0.2.66' };
const RESOLVER = '192.0.2.53';
const REAL_ADDR = '192.0.2.50';
const ROGUE_ADDR = '192.0.2.150';
const FAKE_WEB = '198.51.100.80';
const BROADCAST_MAC = 'ff:ff:ff:ff:ff:ff';
const ZERO = '0.0.0.0';
const BCAST = '255.255.255.255';
const PRL = [1, 3, 6, 15];
const XID = 0x5f2c9a41;
const XID2 = 0x1e7b3c05;

const C = 'client';
const R = 'router';
const A = 'attacker';

const CLIENT_TTL = 'The TTL a client uses for its DHCP messages depends on the implementation.';

interface Server {
  ip: string;
  lease: number;
  gateway: string;
  dns: string;
}
const REAL: Server = { ip: ROUTER.ip, lease: 86400, gateway: ROUTER.ip, dns: RESOLVER };
const FAKE: Server = { ip: ROGUE.ip, lease: 3600, gateway: ROGUE.ip, dns: ROGUE.ip };

const serverOptions = (type: number, s: Server): DhcpOption[] => [
  { code: 53, type },
  { code: 54, addr: [s.ip] },
  { code: 51, seconds: s.lease },
  { code: 1, addr: ['255.255.255.0'] },
  { code: 3, addr: [s.gateway] },
  { code: 6, addr: [s.dns] },
  { code: 255 },
];

const clientMsg = (xid: number, type: 1 | 3, server?: { id: string; requested: string }) =>
  dhcp({
    op: 1,
    xid,
    broadcast: false,
    ciaddr: ZERO,
    yiaddr: ZERO,
    siaddr: ZERO,
    giaddr: ZERO,
    chaddr: LAPTOP_MAC,
    options: [{ code: 53, type }, ...(server ? [{ code: 50 as const, addr: [server.requested] }, { code: 54 as const, addr: [server.id] }] : []), { code: 55, codes: PRL }, { code: 255 }],
    unverified: { options: 'Which options a client puts in its Parameter Request List depends on the implementation; this list is an example.' },
  });

const serverMsg = (xid: number, type: 2 | 5, s: Server, yiaddr: string, notes?: Record<string, string>) =>
  dhcp({ op: 2, xid, broadcast: false, ciaddr: ZERO, yiaddr, siaddr: ZERO, giaddr: ZERO, chaddr: LAPTOP_MAC, options: serverOptions(type, s), ...(notes ? { notes } : {}) });

function fromClient(app: LayerInstance, id: number): Capture {
  return ethIpv4Udp({
    link: 'p1',
    note: 'As sent by the laptop.',
    eth: { src: LAPTOP_MAC, dst: BROADCAST_MAC },
    ip: { src: ZERO, dst: BCAST, ttl: 64, id, unverified: { ttl: CLIENT_TTL } },
    udp: { srcPort: 68, dstPort: 67 },
    app,
  });
}

function fromServer(link: 'p1' | 'p-att', s: { mac: string; ip: string }, to: string, app: LayerInstance, id: number, note: string): Capture {
  return ethIpv4Udp({
    link,
    note,
    eth: { src: s.mac, dst: LAPTOP_MAC },
    ip: { src: s.ip, dst: to, ttl: 64, id },
    udp: { srcPort: 67, dstPort: 68 },
    app,
  });
}

function dnsFrame(fromLaptop: boolean, msg: DnsParams, id: number): Capture {
  return ethIpv4Udp({
    link: 'p1',
    note: fromLaptop ? 'As sent by the laptop.' : 'As delivered to the laptop.',
    eth: fromLaptop ? { src: LAPTOP_MAC, dst: ROGUE.mac } : { src: ROGUE.mac, dst: LAPTOP_MAC },
    ip: { src: fromLaptop ? ROGUE_ADDR : ROGUE.ip, dst: fromLaptop ? ROGUE.ip : ROGUE_ADDR, ttl: 64, id, df: true },
    udp: fromLaptop ? { srcPort: 51734, dstPort: 53 } : { srcPort: 53, dstPort: 51734 },
    app: dns(msg),
  });
}

const config = (label: string, value: string) => ({ label: `Laptop: ${label}`, value });

const RFC2131: Source = { rfc: 2131, section: '3.1' };
const SNOOPING: Source = { spec: 'DHCP snooping, a switch feature (for example Cisco IOS, Juniper, Aruba)', note: 'trusted and untrusted ports, binding table' };

const www = { name: 'www.example.com', type: 'A' as const };
const query: DnsParams = { id: 0x44e1, response: false, rd: true, question: www };
const fakeAnswer: DnsParams = { id: 0x44e1, response: true, aa: false, rd: true, ra: true, question: www, answer: [{ name: 'www.example.com', type: 'A', ttl: 86400, data: FAKE_WEB }] };

const toRouter = [C, 'switch', R];
const toRogue = [C, 'switch', A];

const SPECS: Spec[] = [
  // ---- 1 attack
  {
    id: 'discover',
    phase: 'attack',
    from: C,
    to: R,
    path: toRouter,
    extraPaths: [toRogue],
    label: 'DHCPDISCOVER',
    time: 0,
    category: 'client',
    captures: [fromClient(clientMsg(XID, 1), 0x0000)],
    protocol: 'DHCP',
    info: `DHCP Discover - Transaction ID 0x${XID.toString(16)}`,
    sources: [RFC2131],
    details: {
      what: 'A laptop joins the network and broadcasts a Discover. The switch floods the broadcast to every port: the router gets it, and so does every other host in the LAN.',
      why: 'The client does not know which server to ask, so it asks everybody. Nothing in DHCP lets it tell a real server from any other host that answers.',
      keyFields: [{ layer: 'ethernet', field: 'dst' }, { layer: 'dhcp', field: 'xid' }],
    },
  },
  {
    id: 'rogue-offer',
    phase: 'attack',
    from: A,
    to: C,
    path: [A, 'switch', C],
    label: 'DHCPOFFER (rogue)',
    time: 1.2,
    category: 'attack',
    captures: [
      fromServer('p1', ROGUE, ROGUE_ADDR, serverMsg(XID, 2, FAKE, ROGUE_ADDR, { yiaddr: 'An address the attacker picked from the LAN\'s range.' }), 0x2101, 'As delivered to the laptop.'),
    ],
    protocol: 'DHCP',
    info: `DHCP Offer - Transaction ID 0x${XID.toString(16)}, from ${ROGUE.ip}`,
    sources: [RFC2131, { rfc: 2132, section: '3.5' }, { rfc: 2132, section: '3.8' }],
    details: {
      what: 'A host in the LAN runs its own DHCP server and answers first. It offers a valid address, and names itself, 192.0.2.66, as router (option 3) and as DNS server (option 6).',
      why: 'The rogue only needs the transaction ID and the client\'s MAC address, both in the broadcast it just received. It answers from software on the same switch, so it easily beats the real server.',
      wrong: 'Rogue DHCP servers are not always attacks: a home router plugged in the wrong way round causes the same outage. The defense is the same.',
      keyFields: [{ layer: 'dhcp', field: 'options' }, { layer: 'ipv4', field: 'src' }],
    },
  },
  {
    id: 'real-offer',
    phase: 'attack',
    from: R,
    to: C,
    path: [R, 'switch', C],
    label: 'DHCPOFFER (ignored)',
    time: 4,
    category: 'normal',
    captures: [fromServer('p1', ROUTER, REAL_ADDR, serverMsg(XID, 2, REAL, REAL_ADDR), 0x7a01, 'As delivered to the laptop.')],
    protocol: 'DHCP',
    info: `DHCP Offer - Transaction ID 0x${XID.toString(16)}, from ${ROUTER.ip}`,
    sources: [RFC2131],
    details: {
      what: 'The real server answers a few milliseconds later. The laptop has already chosen.',
      why: 'RFC 2131 lets a client collect several offers, but most clients take the first one. Being fastest is all the rogue needs.',
      keyFields: [{ layer: 'dhcp', field: 'options' }],
    },
  },
  {
    id: 'request',
    phase: 'attack',
    from: C,
    to: A,
    path: toRogue,
    extraPaths: [toRouter],
    label: 'DHCPREQUEST',
    time: 5,
    category: 'client',
    captures: [fromClient(clientMsg(XID, 3, { id: ROGUE.ip, requested: ROGUE_ADDR }), 0x0001)],
    protocol: 'DHCP',
    info: `DHCP Request - Transaction ID 0x${XID.toString(16)}`,
    sources: [RFC2131, { rfc: 2131, section: '4.3.2' }],
    details: {
      what: 'The laptop broadcasts its Request for the rogue\'s offer: option 54 names 192.0.2.66 as the chosen server.',
      why: 'The Request is broadcast so every server learns the decision. The real server sees another server identifier and withdraws its offer, exactly as for any legitimate second server.',
      keyFields: [{ layer: 'dhcp', field: 'options' }],
    },
  },
  {
    id: 'rogue-ack',
    phase: 'attack',
    from: A,
    to: C,
    path: [A, 'switch', C],
    label: 'DHCPACK (rogue)',
    time: 6.2,
    category: 'attack',
    captures: [fromServer('p1', ROGUE, ROGUE_ADDR, serverMsg(XID, 5, FAKE, ROGUE_ADDR), 0x2102, 'As delivered to the laptop.')],
    protocol: 'DHCP',
    info: `DHCP ACK - Transaction ID 0x${XID.toString(16)}, from ${ROGUE.ip}`,
    sources: [RFC2131, { rfc: 2132, section: '3.5' }, { rfc: 2132, section: '3.8' }],
    learned: [config('address', ROGUE_ADDR), config('gateway', `${ROGUE.ip} (attacker)`), config('DNS server', `${ROGUE.ip} (attacker)`)],
    details: {
      what: 'The rogue confirms. The laptop configures 192.0.2.150, and the attacker as its gateway and its DNS server.',
      why: 'With one DHCP exchange the attacker gets what ARP spoofing achieves with a stream of forged packets: the laptop sends its Internet traffic and its name lookups to the attacker of its own accord.',
      insight: 'DHCP configures more than an address. Whoever controls the gateway and DNS options controls where the client\'s traffic goes.',
      keyFields: [{ layer: 'dhcp', field: 'options' }, { layer: 'dhcp', field: 'yiaddr' }],
    },
  },
  // ---- 2 effect
  {
    id: 'dns-query',
    phase: 'effect',
    from: C,
    to: A,
    path: toRogue,
    label: 'DNS query to the attacker',
    time: 2000,
    category: 'mitm',
    captures: [dnsFrame(true, query, 0x5c01)],
    protocol: 'DNS',
    info: dnsInfo(query),
    sources: [{ rfc: 1034, section: '5.3.1' }],
    details: {
      what: 'The laptop looks up www.example.com and asks its DNS server, which is now the attacker.',
      why: 'The laptop does exactly what it was configured to do. Every packet to the Internet likewise goes to 192.0.2.66 as the gateway.',
      keyFields: [{ layer: 'ipv4', field: 'dst' }, { layer: 'ethernet', field: 'dst' }],
    },
  },
  {
    id: 'dns-answer',
    phase: 'effect',
    from: A,
    to: C,
    path: [A, 'switch', C],
    label: 'False answer',
    time: 2000.3,
    category: 'mitm',
    captures: [dnsFrame(false, fakeAnswer, 0x2103)],
    protocol: 'DNS',
    info: dnsInfo(fakeAnswer),
    sources: [{ rfc: 1035 }],
    learned: [{ label: 'Laptop: www.example.com is', value: `${FAKE_WEB} (attacker)` }],
    details: {
      what: 'The attacker answers with any address it likes, here its own server 198.51.100.80.',
      why: 'No forgery is needed: the laptop asked the attacker directly, and the answer is a perfectly normal DNS response.',
      insight: 'As with ARP spoofing and DNS poisoning, TLS is the last line: a fake www.example.com has no valid certificate.',
      keyFields: [{ layer: 'dns', field: 'answer' }],
    },
  },
  // ---- 3 defense
  {
    id: 'snoop-discover',
    phase: 'defense',
    from: C,
    to: R,
    path: toRouter,
    label: 'DHCPDISCOVER',
    time: 600000,
    category: 'client',
    captures: [fromClient(clientMsg(XID2, 1), 0x0002)],
    protocol: 'DHCP',
    info: `DHCP Discover - Transaction ID 0x${XID2.toString(16)}`,
    sources: [RFC2131, SNOOPING],
    details: {
      what: 'The same LAN with DHCP snooping on the switch. Only the router\'s port is configured as trusted. The laptop joins again and broadcasts a Discover.',
      why: 'On Cisco switches, for example, a client message from an untrusted port is forwarded only to trusted ports, so the rogue does not even see the Discover. Other switches may still flood it; either way, the next step shows why its answer cannot get through.',
      keyFields: [{ layer: 'dhcp', field: 'xid' }],
    },
  },
  {
    id: 'snoop-drop',
    phase: 'defense',
    from: A,
    to: C,
    path: [A, 'switch', C],
    label: 'DHCPOFFER dropped',
    time: 600001.2,
    category: 'defense',
    lost: true,
    captures: [fromServer('p-att', ROGUE, ROGUE_ADDR, serverMsg(XID2, 2, FAKE, ROGUE_ADDR), 0x2104, 'As sent by the rogue, before the switch checks it.')],
    protocol: 'DHCP',
    info: `DHCP Offer - Transaction ID 0x${XID2.toString(16)}, from ${ROGUE.ip}, dropped by the switch`,
    sources: [SNOOPING],
    details: {
      what: 'Suppose the rogue sees the Discover anyway and answers. The switch drops the Offer at the attacker\'s port.',
      why: 'DHCP snooping divides ports into trusted and untrusted. Server messages (Offer, Ack, Nak) are accepted only on trusted ports; on an untrusted port the switch drops them and usually logs the event.',
      keyFields: [{ layer: 'udp', field: 'srcPort' }, { layer: 'dhcp', field: 'op' }],
    },
  },
  {
    id: 'snoop-offer',
    phase: 'defense',
    from: R,
    to: C,
    path: [R, 'switch', C],
    label: 'DHCPOFFER',
    time: 600004,
    category: 'normal',
    captures: [fromServer('p1', ROUTER, REAL_ADDR, serverMsg(XID2, 2, REAL, REAL_ADDR), 0x7a02, 'As delivered to the laptop.')],
    protocol: 'DHCP',
    info: `DHCP Offer - Transaction ID 0x${XID2.toString(16)}, from ${ROUTER.ip}`,
    sources: [RFC2131, SNOOPING],
    details: {
      what: 'The only offer that reaches the laptop comes from the real server through the trusted port.',
      why: 'Being fastest no longer helps the rogue: its answers never arrive.',
      keyFields: [{ layer: 'dhcp', field: 'options' }],
    },
  },
  {
    id: 'snoop-request',
    phase: 'defense',
    from: C,
    to: R,
    path: toRouter,
    label: 'DHCPREQUEST',
    time: 600005,
    category: 'client',
    captures: [fromClient(clientMsg(XID2, 3, { id: ROUTER.ip, requested: REAL_ADDR }), 0x0003)],
    protocol: 'DHCP',
    info: `DHCP Request - Transaction ID 0x${XID2.toString(16)}`,
    sources: [RFC2131],
    details: {
      what: 'The laptop requests the real offer, naming 192.0.2.1 as server.',
      why: 'The exchange is the normal DORA of the DHCP page; snooping is invisible to the client.',
      keyFields: [{ layer: 'dhcp', field: 'options' }],
    },
  },
  {
    id: 'snoop-ack',
    phase: 'defense',
    from: R,
    to: C,
    path: [R, 'switch', C],
    label: 'DHCPACK',
    time: 600006,
    category: 'normal',
    captures: [fromServer('p1', ROUTER, REAL_ADDR, serverMsg(XID2, 5, REAL, REAL_ADDR), 0x7a03, 'As delivered to the laptop.')],
    protocol: 'DHCP',
    info: `DHCP ACK - Transaction ID 0x${XID2.toString(16)}, from ${ROUTER.ip}`,
    sources: [RFC2131, SNOOPING],
    learned: [
      config('address', REAL_ADDR),
      config('gateway', `${ROUTER.ip} (router)`),
      config('DNS server', `${RESOLVER} (resolver)`),
      { label: 'Switch: binding', value: `${REAL_ADDR} = ${LAPTOP_MAC}, laptop port` },
    ],
    details: {
      what: 'The real server confirms. The switch reads the Ack as it passes and records a binding: 192.0.2.50 belongs to this MAC address on this port.',
      why: 'The binding table is the second half of DHCP snooping. Dynamic ARP Inspection checks ARP against it (see the ARP spoofing lesson), and IP Source Guard uses it to drop packets with addresses a port was never given.',
      typical: 'Further protection: 802.1X, so unknown devices get no port at all, and rate limits on DHCP messages per port against floods of Discovers that exhaust the address pool (DHCP starvation).',
      keyFields: [{ layer: 'dhcp', field: 'yiaddr' }, { layer: 'dhcp', field: 'chaddr' }],
    },
  },
];

export const rogueDhcpExchange: Exchange = {
  id: 'rogue-dhcp',
  title: 'Attack: rogue DHCP server',
  summary: 'A host in the LAN answers DHCP first and makes itself gateway and DNS server; DHCP snooping stops it.',
  group: 'Learn',
  scenario:
    'A laptop joins a LAN. A second host answers its Discover before the real server, configures itself as the laptop\'s gateway and DNS server, and answers its lookups. Then the switch gets DHCP snooping.',
  intro:
    'DHCP clients accept configuration from whoever answers first, and DHCP has no way to authenticate a server. A rogue server in the LAN can hand out its own address as gateway and DNS server and so receive the client\'s traffic without forging a single packet. This scenario shows the exchange and how DHCP snooping on the switch prevents it.\n\nThe frames illustrate how the attack works; they are built with the same header builders as the protocol pages.',
  sources: [
    { rfc: 2131, note: 'DHCP' },
    { rfc: 2132, note: 'DHCP options' },
    { rfc: 7610, note: 'DHCPv6-Shield: the same defense for IPv6' },
    SNOOPING,
  ],
  participants: [
    { id: C, label: 'Laptop', kind: 'host', addr: { mac: LAPTOP_MAC }, pos: { x: 0, y: 0 }, lifeline: true, note: 'No IP address yet' },
    { id: 'switch', label: 'Switch', kind: 'switch', pos: { x: 2, y: 0 }, lifeline: false },
    { id: A, label: 'Rogue server', kind: 'attacker', addr: { mac: ROGUE.mac, ipv4: ROGUE.ip }, pos: { x: 2, y: 1 }, lifeline: true, note: 'Another host in the same LAN' },
    { id: R, label: 'Router', kind: 'router', addr: { mac: ROUTER.mac, ipv4: ROUTER.ip }, pos: { x: 4, y: 0 }, lifeline: true, note: 'Default gateway and DHCP server' },
  ],
  links: [
    { id: 'p1', a: C, b: 'switch', label: 'Laptop port' },
    { id: 'p-att', a: 'switch', b: A, label: 'Attacker port (untrusted)' },
    { id: 'p-router', a: 'switch', b: R, label: 'Router port (trusted)' },
  ],
  categories: [
    { id: 'client', label: 'From the laptop', color: 'purple' },
    { id: 'normal', label: 'Real server', color: 'green' },
    { id: 'attack', label: 'Rogue server', color: 'red' },
    { id: 'mitm', label: 'Traffic to the attacker', color: 'yellow' },
    { id: 'defense', label: 'Blocked by the switch', color: 'blue' },
  ],
  phases: [
    { id: 'attack', label: 'Attack', about: 'The rogue answers first and configures the laptop.', deepDive: 'dhcp' },
    { id: 'effect', label: 'Effect', about: 'Lookups and Internet traffic go to the attacker.', deepDive: 'dns' },
    { id: 'defense', label: 'Defense', about: 'DHCP snooping accepts server messages only on trusted ports.', deepDive: 'dhcp' },
  ],
  steps: SPECS.map(buildStep),
};
