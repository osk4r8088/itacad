import type { Capture, Exchange, Learned, Source, Step, StepDetails } from '../../shared/schema';
import { ethIpv4Tcp, ethIpv4Udp } from '../../shared/headers/stacks';
import type { TcpParams } from '../../shared/headers/tcp';
import { dns, dnsInfo, type DnsParams } from '../../shared/headers/dns';

// NAT and PAT on a home router. The LAN uses private addresses (RFC 1918); the router has one
// public address on its uplink. Public addresses are documentation ranges (RFC 5737), MAC
// addresses RFC 7042. Every step has a capture on each side of the router, inside first.

const A = { mac: '00:00:5e:00:53:0a', ip: '192.168.1.10' };
const B = { mac: '00:00:5e:00:53:0b', ip: '192.168.1.11' };
const ROUTER_LAN = { mac: '00:00:5e:00:53:01', ip: '192.168.1.1' };
const ROUTER_WAN = { mac: '00:00:5e:00:53:02', ip: '198.51.100.20' };
const ISP_MAC = '00:00:5e:00:53:03';
const SERVER = { ip: '203.0.113.80', port: 80 };
const RESOLVER = { ip: '198.51.100.53', port: 53 };
const OUTSIDER = '203.0.113.99';

/** TTL of packets from the Internet when they reach the router's uplink; the hop count is illustrative. */
const TTL_IN = 55;

type End = { ip: string; port: number };

interface Flow {
  /** Inside view: the private address and port of the LAN host. */
  inside: End;
  /** The same host as the Internet sees it, after translation. */
  outside: End;
  /** The remote end, the same on both sides. */
  remote: End;
  host: { mac: string };
}

const flowA: Flow = { inside: { ip: A.ip, port: 51000 }, outside: { ip: ROUTER_WAN.ip, port: 51000 }, remote: SERVER, host: A };
const flowB: Flow = { inside: { ip: B.ip, port: 51000 }, outside: { ip: ROUTER_WAN.ip, port: 62210 }, remote: SERVER, host: B };
const flowDns: Flow = { inside: { ip: B.ip, port: 53211 }, outside: { ip: ROUTER_WAN.ip, port: 53211 }, remote: RESOLVER, host: B };
const flowFwd: Flow = { inside: { ip: A.ip, port: 80 }, outside: { ip: ROUTER_WAN.ip, port: 8080 }, remote: { ip: OUTSIDER, port: 44124 }, host: A };

const REWRITTEN = 'Rewritten by the router.';
const CHECKSUM = 'Recomputed by the router: the address and port it changed are covered by this checksum.';

type Dir = 'out' | 'in';

/** Addresses, ports, MACs and TTL of one packet on both sides of the router. */
function sides(f: Flow, dir: Dir, ipId: number) {
  const out = dir === 'out';
  const lan = {
    link: 'lan',
    note: out ? 'Inside, as sent by the LAN host.' : 'Inside, after translation, as delivered to the LAN host.',
    eth: out ? { src: f.host.mac, dst: ROUTER_LAN.mac } : { src: ROUTER_LAN.mac, dst: f.host.mac },
    src: out ? f.inside : f.remote,
    dst: out ? f.remote : f.inside,
    ttl: out ? 64 : TTL_IN - 1,
    rewritten: !out,
  };
  const wan = {
    link: 'wan',
    note: out ? 'Outside, after translation, as sent to the Internet.' : 'Outside, as it arrives from the Internet.',
    eth: out ? { src: ROUTER_WAN.mac, dst: ISP_MAC } : { src: ISP_MAC, dst: ROUTER_WAN.mac },
    src: out ? f.outside : f.remote,
    dst: out ? f.remote : f.outside,
    ttl: out ? 63 : TTL_IN,
    rewritten: out,
  };
  return [lan, wan].map((s) => ({
    ...s,
    ip: {
      src: s.src.ip,
      dst: s.dst.ip,
      ttl: s.ttl,
      id: ipId,
      df: true,
      notes: (s.rewritten ? { [out ? 'src' : 'dst']: REWRITTEN, checksum: CHECKSUM } : {}) as Record<string, string>,
    },
    ports: { srcPort: s.src.port, dstPort: s.dst.port },
    portNote: (s.rewritten ? { [out ? 'srcPort' : 'dstPort']: REWRITTEN, checksum: CHECKSUM } : {}) as Record<string, string>,
  }));
}

function tcp(f: Flow, dir: Dir, ipId: number, t: Omit<TcpParams, 'srcPort' | 'dstPort'>): Capture[] {
  return sides(f, dir, ipId).map((s) =>
    ethIpv4Tcp({ link: s.link, note: s.note, eth: s.eth, ip: s.ip, tcp: { ...t, ...s.ports, notes: { ...(t.notes ?? {}), ...s.portNote } } }),
  );
}

function udp(f: Flow, dir: Dir, ipId: number, msg: DnsParams): Capture[] {
  return sides(f, dir, ipId).map((s) => ethIpv4Udp({ link: s.link, note: s.note, eth: s.eth, ip: s.ip, udp: { ...s.ports, notes: s.portNote }, app: dns(msg) }));
}

const entry = (f: Flow, proto: 'TCP' | 'UDP'): Learned => ({
  label: `NAT ${proto} ${f.inside.ip}:${f.inside.port}`,
  value: `${f.outside.ip}:${f.outside.port} to ${f.remote.ip}:${f.remote.port}`,
});


// ---- sequence numbers
const A_ISN = 2741180012;
const S_ISN_A = 1103920458;
const B_ISN = 330125771;
const S_ISN_B = 3870412690;
const F_ISN = 905531840;
const F2_ISN = 4011263508;
const A_ISN_FWD = 2210047713;
const SYN_OPTS: TcpParams['options'] = [{ kind: 'mss', mss: 1460 }, { kind: 'nop' }, { kind: 'ws', shift: 7 }, { kind: 'nop' }, { kind: 'nop' }, { kind: 'sackPerm' }];

const dnsQuery: DnsParams = { id: 0x2b7e, response: false, rd: true, question: { name: 'www.example.com', type: 'A' } };
const dnsAnswer: DnsParams = { id: 0x2b7e, response: true, aa: false, rd: true, ra: true, question: { name: 'www.example.com', type: 'A' }, answer: [{ name: 'www.example.com', type: 'A', ttl: 3600, data: SERVER.ip }] };

const toServer = (host: string) => [host, 'switch', 'router', 'internet', 'server'];
const fromServer = (host: string) => ['server', 'internet', 'router', 'switch', host];

interface Spec {
  id: string;
  from: string;
  to: string;
  path: string[];
  label: string;
  time: number;
  category: string;
  captures: Capture[];
  protocol: string;
  info: string;
  details: StepDetails;
  sources: Source[];
  learned?: Learned[];
}

const SPECS: Spec[] = [
  {
    id: 'a-syn',
    from: 'laptop-a',
    to: 'server',
    path: toServer('laptop-a'),
    label: 'SYN, A',
    time: 0,
    category: 'out',
    captures: tcp(flowA, 'out', 0x51a1, { seq: A_ISN, ack: 0, flags: ['SYN'], window: 64240, options: SYN_OPTS }),
    protocol: 'TCP',
    info: '51000 → 80 [SYN] Seq=0 Win=64240 Len=0, inside 192.168.1.10, outside 198.51.100.20:51000',
    sources: [{ rfc: 3022, section: '2.2' }, { rfc: 1918 }, { rfc: 4787, section: '4.2' }],
    learned: [entry(flowA, 'TCP')],
    details: {
      what: 'Laptop A opens a connection to the web server from its private address 192.168.1.10, port 51000. The router replaces the source address with its own public address 198.51.100.20 and records the translation in its table. Port 51000 is still free on the outside, so it keeps it.',
      why: '192.168.1.0/24 is a private range (RFC 1918): it can be used in any LAN, and routers on the Internet do not route it. To talk to the Internet, the LAN has to borrow the router\'s public address.',
      typical: 'Compare the two captures: source address and the IPv4 and TCP checksums differ, everything else of the TCP segment is the same. Keeping the port when possible is called port preservation; RFC 4787 and RFC 5382 recommend it but do not require it.',
      insight: 'The TCP checksum changes although the router only touched the IP address: TCP\'s checksum covers a pseudo-header with both IP addresses. Every NAT has to fix transport checksums too.',
      keyFields: [{ layer: 'ipv4', field: 'src' }, { layer: 'tcp', field: 'srcPort' }, { layer: 'tcp', field: 'checksum' }],
    },
  },
  {
    id: 'a-synack',
    from: 'server',
    to: 'laptop-a',
    path: fromServer('laptop-a'),
    label: 'SYN-ACK, A',
    time: 24,
    category: 'in',
    captures: tcp(flowA, 'in', 0x0000, { seq: S_ISN_A, ack: A_ISN + 1, flags: ['SYN', 'ACK'], window: 65160, options: SYN_OPTS }),
    protocol: 'TCP',
    info: '80 → 51000 [SYN, ACK] Seq=0 Ack=1 Win=65160 Len=0, to 198.51.100.20:51000, inside 192.168.1.10',
    sources: [{ rfc: 3022, section: '2.2' }, { rfc: 5382, section: '4.1' }],
    details: {
      what: 'The server answers the address it saw: 198.51.100.20, port 51000. The router looks up that port in its table, finds laptop A, and rewrites the destination back to 192.168.1.10.',
      why: 'The table entry created by the outgoing packet is what lets the reply in. The server never learns the private address.',
      keyFields: [{ layer: 'ipv4', field: 'dst' }, { layer: 'tcp', field: 'dstPort' }],
    },
  },
  {
    id: 'a-ack',
    from: 'laptop-a',
    to: 'server',
    path: toServer('laptop-a'),
    label: 'ACK, A',
    time: 24.3,
    category: 'out',
    captures: tcp(flowA, 'out', 0x51a2, { seq: A_ISN + 1, ack: S_ISN_A + 1, flags: ['ACK'], window: 502 }),
    protocol: 'TCP',
    info: '51000 → 80 [ACK] Seq=1 Ack=1 Win=64256 Len=0',
    sources: [{ rfc: 5382, section: '5' }],
    details: {
      what: 'Laptop A completes the handshake; the router translates it with the same entry.',
      why: 'The router watches the TCP flags. An established connection keeps its entry much longer than a half-open one: RFC 5382 asks for at least 2 hours 4 minutes of idle time for established connections.',
      keyFields: [{ layer: 'tcp', field: 'flagACK' }],
    },
  },
  {
    id: 'b-syn',
    from: 'laptop-b',
    to: 'server',
    path: toServer('laptop-b'),
    label: 'SYN, B',
    time: 1000,
    category: 'out',
    captures: tcp(flowB, 'out', 0x7e01, { seq: B_ISN, ack: 0, flags: ['SYN'], window: 64240, options: SYN_OPTS }),
    protocol: 'TCP',
    info: '51000 → 80 [SYN] Seq=0 Win=64240 Len=0, inside 192.168.1.11, outside 198.51.100.20:62210',
    sources: [{ rfc: 3022, section: '2.2' }, { rfc: 4787, section: '4.2' }],
    learned: [entry(flowB, 'TCP')],
    details: {
      what: 'Laptop B happens to use the same source port, 51000, to the same server. On the outside both would become 198.51.100.20:51000 to 203.0.113.80:80, the same connection. So the router picks another port, 62210, for laptop B.',
      why: 'This is port address translation (PAT, or NAPT in RFC 3022): the router multiplexes many inside hosts onto one public address by giving each connection its own outside port. Without the port, the router could not tell the replies apart.',
      typical: 'One public address offers about 64000 ports per protocol and remote end, so a home router rarely runs out. Large carrier NATs, shared by thousands of customers, have to ration ports.',
      insight: 'The private side and the public side are two different connections as far as addresses go; only the router knows they belong together.',
      keyFields: [{ layer: 'tcp', field: 'srcPort' }, { layer: 'ipv4', field: 'src' }],
    },
  },
  {
    id: 'b-synack',
    from: 'server',
    to: 'laptop-b',
    path: fromServer('laptop-b'),
    label: 'SYN-ACK, B',
    time: 1024,
    category: 'in',
    captures: tcp(flowB, 'in', 0x0000, { seq: S_ISN_B, ack: B_ISN + 1, flags: ['SYN', 'ACK'], window: 65160, options: SYN_OPTS }),
    protocol: 'TCP',
    info: '80 → 62210 [SYN, ACK] Seq=0 Ack=1 Win=65160 Len=0, inside 192.168.1.11:51000',
    sources: [{ rfc: 3022, section: '2.2' }],
    details: {
      what: 'The reply for port 62210 goes to laptop B, port 51000; the reply for port 51000 went to laptop A. The destination port on the outside is what tells them apart.',
      why: 'Both replies come from the same server address and port to the same public address. The translation table is keyed by the outside port.',
      keyFields: [{ layer: 'tcp', field: 'dstPort' }, { layer: 'ipv4', field: 'dst' }],
    },
  },
  {
    id: 'b-dns',
    from: 'laptop-b',
    to: 'resolver',
    path: ['laptop-b', 'switch', 'router', 'internet', 'resolver'],
    label: 'DNS query, B',
    time: 2000,
    category: 'out',
    captures: udp(flowDns, 'out', 0x7e05, dnsQuery),
    protocol: 'DNS',
    info: `${dnsInfo(dnsQuery)}, UDP 53211, inside 192.168.1.11`,
    sources: [{ rfc: 4787, section: '4.1' }, { rfc: 4787, section: '4.3' }],
    learned: [entry(flowDns, 'UDP')],
    details: {
      what: 'Laptop B sends a DNS query over UDP. UDP has no connection and no flags, but the router creates a table entry all the same, from the first outgoing datagram.',
      why: 'For UDP the router cannot see when a "connection" ends, so it simply removes the entry after a period without traffic.',
      typical: 'RFC 4787 asks for a UDP mapping timeout of at least 2 minutes, recommends 5 minutes, and allows shorter values only for well-known ports such as DNS. Many home routers use 30 to 180 seconds.',
      insight: 'The UDP checksum is recomputed as well. It also covers the pseudo-header with the IP addresses.',
      keyFields: [{ layer: 'udp', field: 'srcPort' }, { layer: 'udp', field: 'checksum' }],
    },
  },
  {
    id: 'b-dns-reply',
    from: 'resolver',
    to: 'laptop-b',
    path: ['resolver', 'internet', 'router', 'switch', 'laptop-b'],
    label: 'DNS answer, B',
    time: 2018,
    category: 'in',
    captures: udp(flowDns, 'in', 0x0f31, dnsAnswer),
    protocol: 'DNS',
    info: `${dnsInfo(dnsAnswer)}, to 198.51.100.20:53211`,
    sources: [{ rfc: 4787, section: '5' }],
    details: {
      what: 'The answer comes back to the public address and port 53211, and the router delivers it to laptop B.',
      why: 'The mapping is still there, so the reply passes. If the answer came after the timeout, the router would have forgotten it and drop the datagram.',
      keyFields: [{ layer: 'ipv4', field: 'dst' }, { layer: 'udp', field: 'dstPort' }],
    },
  },
  {
    id: 'unsolicited',
    from: 'outsider',
    to: 'router',
    path: ['outsider', 'internet', 'router'],
    label: 'Unsolicited SYN',
    time: 5000,
    category: 'dropped',
    captures: tcp({ inside: { ip: A.ip, port: 22 }, outside: { ip: ROUTER_WAN.ip, port: 22 }, remote: { ip: OUTSIDER, port: 44123 }, host: A }, 'in', 0x9c10, {
      seq: F_ISN,
      ack: 0,
      flags: ['SYN'],
      window: 64240,
      options: SYN_OPTS,
    }).slice(1),
    protocol: 'TCP',
    info: '44123 → 22 [SYN] Seq=0 Win=64240 Len=0, no table entry, dropped',
    sources: [{ rfc: 5382, section: '4' }, { rfc: 3022, section: '2.2' }],
    details: {
      what: 'A host on the Internet tries to connect to 198.51.100.20, port 22. No inside host ever opened a connection that would match, so the router has no entry and does not know where to send the packet. It drops it.',
      why: 'Translation entries are created only by outgoing traffic. A packet that starts a connection from outside has nothing to match.',
      typical: 'RFC 5382 says a NAT must not answer such a SYN for at least 6 seconds, in case an inside host opens the same connection at that moment, and should then send ICMP Port Unreachable. Many home routers drop it silently instead, so port scanners see the port as filtered.',
      insight: 'This is why NAT is often mistaken for a firewall. The protection is a side effect of not knowing where to deliver; the router\'s actual firewall rules are a separate thing.',
      keyFields: [{ layer: 'ipv4', field: 'dst' }, { layer: 'tcp', field: 'dstPort' }],
    },
  },
  {
    id: 'forward-syn',
    from: 'outsider',
    to: 'laptop-a',
    path: ['outsider', 'internet', 'router', 'switch', 'laptop-a'],
    label: 'SYN to forwarded port',
    time: 60000,
    category: 'forward',
    captures: tcp(flowFwd, 'in', 0x9c20, { seq: F2_ISN, ack: 0, flags: ['SYN'], window: 64240, options: SYN_OPTS }),
    protocol: 'TCP',
    info: '44124 → 8080 [SYN] Seq=0 Win=64240 Len=0, forwarded to 192.168.1.10:80',
    sources: [{ rfc: 3022, section: '2.2' }],
    learned: [{ label: 'NAT TCP forwarding (static)', value: `${ROUTER_WAN.ip}:8080 to ${A.ip}:80` }],
    details: {
      what: 'Laptop A runs a test web server on port 80. The router\'s owner has configured a port forwarding rule: TCP 8080 on the public address goes to 192.168.1.10, port 80. Now a SYN from outside to port 8080 has an entry to match, and the router rewrites the destination address and port.',
      why: 'Port forwarding is a static entry in the translation table, created by configuration instead of by outgoing traffic. It is the explicit exception to "nothing gets in that was not asked for".',
      typical: 'Here the destination is rewritten, not the source; this is sometimes called destination NAT. The outside port does not have to match the inside port.',
      wrong: 'Behind a carrier-grade NAT (shared address space 100.64.0.0/10, RFC 6598) the home router itself has no public address, and port forwarding on it cannot work: the packets never reach it.',
      keyFields: [{ layer: 'ipv4', field: 'dst' }, { layer: 'tcp', field: 'dstPort' }],
    },
  },
  {
    id: 'forward-synack',
    from: 'laptop-a',
    to: 'outsider',
    path: ['laptop-a', 'switch', 'router', 'internet', 'outsider'],
    label: 'SYN-ACK from A',
    time: 60000.4,
    category: 'forward',
    captures: tcp(flowFwd, 'out', 0x51b0, { seq: A_ISN_FWD, ack: F2_ISN + 1, flags: ['SYN', 'ACK'], window: 65160, options: SYN_OPTS }),
    protocol: 'TCP',
    info: '80 → 44124 [SYN, ACK] Seq=0 Ack=1 Win=65160 Len=0, outside 198.51.100.20:8080',
    sources: [{ rfc: 3022, section: '2.2' }],
    details: {
      what: 'Laptop A answers from 192.168.1.10, port 80. On the way out, the router rewrites the source back to 198.51.100.20:8080, the address the client connected to.',
      why: 'The client expects the answer from the address and port it sent its SYN to. An answer from any other address would not match its connection.',
      insight: 'IPv6 normally needs none of this: there are enough addresses for every device to have a public one, and a stateful firewall on the router provides the "nothing gets in unasked" part on purpose.',
      keyFields: [{ layer: 'ipv4', field: 'src' }, { layer: 'tcp', field: 'srcPort' }],
    },
  },
];

const build = (s: Spec): Step => ({
  id: s.id,
  from: s.from,
  to: s.to,
  path: s.path,
  label: s.label,
  details: s.details,
  captures: s.captures,
  sources: s.sources,
  time: s.time,
  category: s.category,
  protocol: s.protocol,
  info: s.info,
  ...(s.learned ? { learned: s.learned } : {}),
});

export const natExchange: Exchange = {
  id: 'nat',
  title: 'NAT and PAT',
  summary: 'Two laptops share one public address: rewritten addresses and ports, a translation table, a dropped packet from outside, port forwarding.',
  group: 'Internet',
  scenario:
    'Two laptops in a home LAN with private addresses use the Internet through a router with one public address. Both connect to the same web server, one also asks DNS, a stranger knocks from outside, and a port forwarding rule lets one connection in.',
  intro:
    'Network address translation lets a whole private network share one public IPv4 address. The router rewrites source addresses and ports on the way out, remembers each rewrite in a table, and uses that table to send replies to the right host. Every step here has two captures, inside and outside the router: compare them to see exactly what changes.\n\nThe "known so far" panel shows the router\'s translation table as it fills up: inside address and port on the left, outside address and port and the remote end on the right.',
  sources: [
    { rfc: 3022, note: 'Traditional NAT and NAPT' },
    { rfc: 5382, note: 'NAT behavior for TCP' },
    { rfc: 4787, note: 'NAT behavior for UDP' },
    { rfc: 1918, note: 'private address ranges' },
    { rfc: 6598, note: 'shared address space 100.64.0.0/10 for carrier-grade NAT' },
    { rfc: 5737, note: 'documentation addresses used here' },
  ],
  participants: [
    { id: 'laptop-a', label: 'Laptop A', kind: 'host', addr: { mac: A.mac, ipv4: A.ip }, pos: { x: 0, y: 0 }, lifeline: true },
    { id: 'laptop-b', label: 'Laptop B', kind: 'host', addr: { mac: B.mac, ipv4: B.ip }, pos: { x: 0, y: 1 }, lifeline: true },
    { id: 'switch', label: 'Switch', kind: 'switch', pos: { x: 2, y: 0 }, lifeline: false },
    { id: 'router', label: 'Router (NAT)', kind: 'router', addr: { ipv4: ROUTER_WAN.ip }, pos: { x: 4, y: 0 }, lifeline: true, note: `LAN ${ROUTER_LAN.ip}, WAN ${ROUTER_WAN.ip}` },
    { id: 'internet', label: 'Internet', kind: 'internet', pos: { x: 6, y: 0 }, lifeline: false },
    { id: 'server', label: 'Web server', kind: 'server', addr: { ipv4: SERVER.ip }, pos: { x: 8, y: 0 }, lifeline: true },
    { id: 'resolver', label: 'DNS resolver', kind: 'resolver', addr: { ipv4: RESOLVER.ip }, pos: { x: 8, y: 1 }, lifeline: true, note: 'The provider\'s resolver' },
    { id: 'outsider', label: 'Internet host', kind: 'host', addr: { ipv4: OUTSIDER }, pos: { x: 6, y: 1 }, lifeline: true },
  ],
  links: [
    { id: 'p-a', a: 'laptop-a', b: 'switch', label: '' },
    { id: 'p-b', a: 'laptop-b', b: 'switch', label: '' },
    { id: 'lan', a: 'switch', b: 'router', label: 'LAN (inside)' },
    { id: 'wan', a: 'router', b: 'internet', label: 'WAN (outside)' },
    { id: 'i-srv', a: 'internet', b: 'server', label: '' },
    { id: 'i-res', a: 'internet', b: 'resolver', label: '' },
    { id: 'i-out', a: 'internet', b: 'outsider', label: '' },
  ],
  categories: [
    { id: 'out', label: 'Outgoing, source rewritten', color: 'green' },
    { id: 'in', label: 'Reply, destination rewritten', color: 'blue' },
    { id: 'dropped', label: 'No entry, dropped', color: 'red' },
    { id: 'forward', label: 'Port forwarding', color: 'yellow' },
  ],
  steps: SPECS.map(build),
};
