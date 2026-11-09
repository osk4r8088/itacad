import type { Capture, Exchange, Learned, Source, Step, StepDetails } from '../../shared/schema';
import { arp } from '../../shared/headers/arp';
import { ethArp, ethIpv4Tcp } from '../../shared/headers/stacks';
import type { TcpOption } from '../../shared/headers/tcp';
import { dhcpExchange } from '../../protocols/exchanges/dhcp';
import { arpExchange } from '../../protocols/exchanges/arp';
import { dnsExchange } from '../../protocols/exchanges/dns';
import { tlsExchange } from '../../protocols/exchanges/tls';

// "From URL to page": a laptop joins a network and loads https://www.example.com.
// The frames of DHCP, ARP (gateway), DNS and TLS are taken unchanged from those exchanges, so
// every byte matches the protocol pages. Only the ARP exchange for the resolver and the TCP
// handshake before TLS are built here, with the same builders and the same addresses.

const CLIENT = { mac: '00:00:5e:00:53:0a', ip: '192.0.2.50' };
const ROUTER = { mac: '00:00:5e:00:53:01', ip: '192.0.2.1' };
const RESOLVER = { mac: '00:00:5e:00:53:35', ip: '192.0.2.53' };
const SERVER_IP = '203.0.113.80';
const BROADCAST = 'ff:ff:ff:ff:ff:ff';

// The TCP connection of the TLS exchange: same ports, initial sequence numbers and hop count.
const TCP = { clientPort: 51802, serverPort: 443, clientIsn: 1838812016, serverIsn: 708241355, hops: 9 };

const LINK = 'lan';
const AT_LAPTOP = 'Captured at the laptop.';

const step = (ex: Exchange, id: string): Step => {
  const s = ex.steps.find((x) => x.id === id);
  if (!s) throw new Error(`${ex.id} has no step ${id}`);
  return s;
};

/** A capture of another exchange, moved to the laptop link of this topology. */
const reuse = (s: Step): Capture[] => [{ ...s.captures[0], link: LINK, note: AT_LAPTOP }];

const isBroadcast = (s: Step) => s.captures[0].layers.find((l) => l.def.id === 'ethernet')?.values.dst.display.startsWith(BROADCAST) ?? false;

// ---- frames built here

const arpResolverRequest = ethArp({
  link: LINK,
  note: AT_LAPTOP,
  eth: { src: CLIENT.mac, dst: BROADCAST },
  arp: arp({ oper: 'request', sha: CLIENT.mac, spa: CLIENT.ip, tha: '00:00:00:00:00:00', tpa: RESOLVER.ip }),
});
const arpResolverReply = ethArp({
  link: LINK,
  note: AT_LAPTOP,
  eth: { src: RESOLVER.mac, dst: CLIENT.mac },
  arp: arp({ oper: 'reply', sha: RESOLVER.mac, spa: RESOLVER.ip, tha: CLIENT.mac, tpa: CLIENT.ip }),
});

const SYN_OPTIONS_CLIENT: TcpOption[] = [{ kind: 'mss', mss: 1460 }, { kind: 'nop' }, { kind: 'ws', shift: 8 }, { kind: 'nop' }, { kind: 'nop' }, { kind: 'sackPerm' }];
const SYN_OPTIONS_SERVER: TcpOption[] = [{ kind: 'mss', mss: 1460 }, { kind: 'nop' }, { kind: 'nop' }, { kind: 'sackPerm' }, { kind: 'nop' }, { kind: 'ws', shift: 7 }];

const toServer = (id: number) => ({ eth: { src: CLIENT.mac, dst: ROUTER.mac }, ip: { src: CLIENT.ip, dst: SERVER_IP, ttl: 64, id, df: true } });
const toClient = (id: number) => ({ eth: { src: ROUTER.mac, dst: CLIENT.mac }, ip: { src: SERVER_IP, dst: CLIENT.ip, ttl: 64 - TCP.hops, id, df: true } });

const syn = ethIpv4Tcp({
  link: LINK,
  note: AT_LAPTOP,
  ...toServer(0x4d1e),
  tcp: { srcPort: TCP.clientPort, dstPort: TCP.serverPort, seq: TCP.clientIsn, ack: 0, flags: ['SYN'], window: 64240, options: SYN_OPTIONS_CLIENT },
});
const synAck = ethIpv4Tcp({
  link: LINK,
  note: AT_LAPTOP,
  ...toClient(0x1a6f),
  tcp: { srcPort: TCP.serverPort, dstPort: TCP.clientPort, seq: TCP.serverIsn, ack: TCP.clientIsn + 1, flags: ['SYN', 'ACK'], window: 65535, options: SYN_OPTIONS_SERVER },
});
const ack = ethIpv4Tcp({
  link: LINK,
  note: AT_LAPTOP,
  ...toServer(0x4d1f),
  tcp: { srcPort: TCP.clientPort, dstPort: TCP.serverPort, seq: TCP.clientIsn + 1, ack: TCP.serverIsn + 1, flags: ['ACK'], window: 502 },
});

// ---- steps

const C = 'client';
const R = 'router';
const D = 'resolver';
const S = 'server';
const toRouter = [C, 'switch', R];
const fromRouter = [R, 'switch', C];
const toResolver = [C, 'switch', D];
const fromResolver = [D, 'switch', C];
const toWeb = [C, 'switch', R, 'internet', S];
const fromWeb = [S, 'internet', R, 'switch', C];

interface Spec {
  id: string;
  phase: string;
  from: string;
  to: string;
  path: string[];
  label: string;
  time: number;
  category: string;
  /** Step of another exchange whose frame, flow table entry, key fields and sources are reused. */
  source?: Step;
  captures?: Capture[];
  protocol?: string;
  info?: string;
  details: Omit<StepDetails, 'keyFields'> & { keyFields?: StepDetails['keyFields'] };
  sources?: Source[];
  states?: Record<string, string>;
  learned?: Learned[];
}

function build(spec: Spec): Step {
  const src = spec.source;
  const captures = spec.captures ?? (src ? reuse(src) : []);
  const broadcast = src ? isBroadcast(src) : captures[0]?.layers.find((l) => l.def.id === 'ethernet')?.values.dst.display.startsWith(BROADCAST);
  // A broadcast from the laptop also reaches the other hosts on the switch.
  const others = [R, D].filter((p) => p !== spec.to && spec.from === C);
  return {
    id: spec.id,
    phase: spec.phase,
    from: spec.from,
    to: spec.to,
    path: spec.path,
    ...(broadcast && others.length ? { extraPaths: others.map((p) => [C, 'switch', p]) } : {}),
    label: spec.label,
    ...(spec.states ? { states: spec.states } : {}),
    details: { ...spec.details, keyFields: spec.details.keyFields ?? src?.details.keyFields ?? [] },
    captures,
    sources: spec.sources ?? src?.sources ?? [],
    time: spec.time,
    category: spec.category,
    protocol: spec.protocol ?? src?.protocol ?? '',
    info: spec.info ?? src?.info ?? '',
    ...(spec.learned ? { learned: spec.learned } : {}),
  };
}

const dhcp = (id: string) => step(dhcpExchange, id);
const tls = (id: string) => step(tlsExchange, id);
// Flow table times are send times. One way between laptop and server takes about 15 ms (round trip 30 ms, as in the TLS exchange).
const TLS_START = 113.2;
const tlsTime = (id: string) => TLS_START + tls(id).time;

const SPECS: Spec[] = [
  // ---- 1 DHCP
  {
    id: 'dhcp-discover',
    phase: 'dhcp',
    from: C,
    to: R,
    path: toRouter,
    label: 'DHCPDISCOVER',
    time: 0,
    category: 'setup',
    source: dhcp('discover'),
    states: { client: 'SELECTING' },
    details: {
      what: 'The laptop has just joined the network. It has a MAC address but no IP address, no gateway and no DNS resolver. It broadcasts a DHCPDISCOVER: "Is there a DHCP server?"',
      why: 'Without an address the laptop cannot send a normal IP packet to anyone, so it uses source 0.0.0.0 and the broadcast addresses 255.255.255.255 and ff:ff:ff:ff:ff:ff.',
      insight: 'Every later step depends on what this phase delivers: the own address, the gateway for everything outside the LAN, and the resolver for names.',
    },
  },
  {
    id: 'dhcp-offer',
    phase: 'dhcp',
    from: R,
    to: C,
    path: fromRouter,
    label: 'DHCPOFFER',
    time: 4,
    category: 'setup',
    source: dhcp('offer'),
    details: {
      what: 'The router, which is also the DHCP server here, offers 192.0.2.50 together with the network settings: subnet mask, default gateway 192.0.2.1 and DNS resolver 192.0.2.53.',
      why: 'An offer is not yet a lease: other DHCP servers might have answered too, so the laptop still has to pick one.',
    },
  },
  {
    id: 'dhcp-request',
    phase: 'dhcp',
    from: C,
    to: R,
    path: toRouter,
    label: 'DHCPREQUEST',
    time: 5,
    category: 'setup',
    source: dhcp('request'),
    states: { client: 'REQUESTING' },
    details: {
      what: 'The laptop requests the offered address from this server, again as a broadcast, so any other server that made an offer learns it was not chosen.',
      why: 'The laptop still has no address it may use; it only uses 192.0.2.50 after the server confirms.',
    },
  },
  {
    id: 'dhcp-ack',
    phase: 'dhcp',
    from: R,
    to: C,
    path: fromRouter,
    label: 'DHCPACK',
    time: 9,
    category: 'setup',
    source: dhcp('ack'),
    states: { client: 'BOUND' },
    details: {
      what: 'The server confirms the lease. The laptop configures 192.0.2.50/24 and stores the gateway and the resolver address.',
      why: 'From the mask the laptop now knows its own network, 192.0.2.0/24. That decides every following send: a destination inside it is reached directly, anything else through the gateway.',
      typical: 'Many clients first check with an ARP probe that nobody else uses the address (RFC 5227) and announce it afterwards. Those frames are left out here.',
    },
    learned: [
      { label: 'Own IP', value: '192.0.2.50/24' },
      { label: 'Gateway IP', value: '192.0.2.1' },
      { label: 'Resolver IP', value: '192.0.2.53' },
    ],
  },
  // ---- 2 ARP for the resolver
  {
    id: 'arp-resolver-request',
    phase: 'arp-resolver',
    from: C,
    to: D,
    path: toResolver,
    label: 'ARP: who has .53?',
    time: 10,
    category: 'setup',
    captures: [arpResolverRequest],
    protocol: 'ARP',
    info: `Who has ${RESOLVER.ip}? Tell ${CLIENT.ip}`,
    sources: [{ rfc: 826 }],
    details: {
      what: 'To ask for www.example.com the laptop must send a DNS query to 192.0.2.53. That address is inside its own network 192.0.2.0/24, so the frame goes directly to the resolver, not to the gateway. The laptop needs the resolver\'s MAC address and broadcasts an ARP request.',
      why: 'The routing decision comes first: same network, deliver directly. Only then does ARP look up the MAC address of the next hop, which here is the destination itself.',
      keyFields: [
        { layer: 'arp', field: 'tpa' },
        { layer: 'ethernet', field: 'dst' },
      ],
    },
  },
  {
    id: 'arp-resolver-reply',
    phase: 'arp-resolver',
    from: D,
    to: C,
    path: fromResolver,
    label: 'ARP: .53 is at ..:35',
    time: 10.4,
    category: 'setup',
    captures: [arpResolverReply],
    protocol: 'ARP',
    info: `${RESOLVER.ip} is at ${RESOLVER.mac}`,
    sources: [{ rfc: 826 }],
    details: {
      what: 'The resolver answers with its MAC address, as a unicast frame straight to the laptop.',
      why: 'The laptop caches the mapping, so the DNS answer and later queries need no new ARP.',
      keyFields: [{ layer: 'arp', field: 'sha' }],
    },
    learned: [{ label: 'Resolver MAC', value: RESOLVER.mac }],
  },
  // ---- 3 DNS
  {
    id: 'dns-query',
    phase: 'dns',
    from: C,
    to: D,
    path: toResolver,
    label: 'DNS query',
    time: 11,
    category: 'dns',
    source: step(dnsExchange, 'client-query'),
    details: {
      what: 'The browser needs the IP address of www.example.com. The operating system asks the resolver it learned from DHCP: A record for www.example.com, recursion desired.',
      why: 'The laptop does not resolve names itself. The resolver does the work and caches the result for every client in the network.',
    },
  },
  {
    id: 'dns-answer',
    phase: 'dns',
    from: D,
    to: C,
    path: fromResolver,
    label: 'DNS answer',
    time: 81.1,
    category: 'dns',
    source: step(dnsExchange, 'client-answer'),
    details: {
      what: 'About 70 ms later the answer arrives: www.example.com has the address 203.0.113.80.',
      why: 'In between, the resolver asked a root server, a .com server and the name server of example.com. The DNS exchange shows that recursion step by step.',
      insight: 'With a warm cache the answer would come back in about a millisecond: DNS speed depends on caching far more than on the network.',
    },
    learned: [{ label: 'Server IP', value: SERVER_IP }],
  },
  // ---- 4 ARP for the gateway
  {
    id: 'arp-gateway-request',
    phase: 'arp-gateway',
    from: C,
    to: R,
    path: toRouter,
    label: 'ARP: who has .1?',
    time: 82,
    category: 'setup',
    source: step(arpExchange, 'request'),
    details: {
      what: '203.0.113.80 is not in 192.0.2.0/24, so the laptop must send the packet to its default gateway 192.0.2.1. It needs the gateway\'s MAC address and asks with ARP.',
      why: 'Compare with the ARP for the resolver: the IP destination now is the web server, but the frame goes to the router. ARP never asks for the web server; it is not on this link.',
    },
  },
  {
    id: 'arp-gateway-reply',
    phase: 'arp-gateway',
    from: R,
    to: C,
    path: fromRouter,
    label: 'ARP: .1 is at ..:01',
    time: 82.4,
    category: 'setup',
    source: step(arpExchange, 'reply'),
    details: {
      what: 'The router answers with its MAC address. Every packet to the Internet will now carry the web server as IP destination and the router as Ethernet destination.',
      why: 'The laptop saw this MAC address already as the source of the DHCP answers, but the IP stack fills its neighbor cache through ARP.',
    },
    learned: [{ label: 'Gateway MAC', value: ROUTER.mac }],
  },
  // ---- 5 TCP
  {
    id: 'tcp-syn',
    phase: 'tcp',
    from: C,
    to: S,
    path: toWeb,
    label: 'SYN',
    time: 83,
    category: 'tcp',
    captures: [syn],
    protocol: 'TCP',
    info: `${TCP.clientPort} → 443 [SYN] Seq=0 Win=64240 Len=0 MSS=1460 WS=256 SACK_PERM`,
    sources: [{ rfc: 9293, section: '3.5' }, { rfc: 7323, section: '2' }],
    states: { client: 'SYN-SENT' },
    details: {
      what: 'The browser opens a TCP connection to 203.0.113.80, port 443 for HTTPS. The laptop picks a random source port and initial sequence number and sends a SYN through the gateway.',
      why: 'TLS and HTTP need a reliable byte stream, so TCP sets it up first. The IP header carries the web server address; the Ethernet header carries the router MAC from the last step.',
      keyFields: [
        { layer: 'tcp', field: 'flagSYN' },
        { layer: 'tcp', field: 'dstPort' },
        { layer: 'ethernet', field: 'dst' },
        { layer: 'ipv4', field: 'dst' },
      ],
    },
  },
  {
    id: 'tcp-synack',
    phase: 'tcp',
    from: S,
    to: C,
    path: fromWeb,
    label: 'SYN-ACK',
    time: 98,
    category: 'tcp',
    captures: [synAck],
    protocol: 'TCP',
    info: `443 → ${TCP.clientPort} [SYN, ACK] Seq=0 Ack=1 Win=65535 Len=0 MSS=1460 SACK_PERM WS=128`,
    sources: [{ rfc: 9293, section: '3.5' }],
    states: { server: 'SYN-RECEIVED', client: 'ESTABLISHED' },
    details: {
      what: 'The server answers with its own SYN and acknowledges the laptop\'s. When it arrives, the connection is open for the laptop.',
      why: 'The SYN took about 15 ms to the server and the SYN-ACK takes as long back: one round trip is about 30 ms, which also sets TCP\'s first retransmission timer. Nine routers lie in between, so the TTL arrives as 55.',
      keyFields: [
        { layer: 'tcp', field: 'ack' },
        { layer: 'ipv4', field: 'ttl' },
      ],
    },
    learned: [{ label: 'Connection', value: `TCP ${CLIENT.ip}:${TCP.clientPort} to ${SERVER_IP}:443` }],
  },
  {
    id: 'tcp-ack',
    phase: 'tcp',
    from: C,
    to: S,
    path: toWeb,
    label: 'ACK',
    time: 113.1,
    category: 'tcp',
    captures: [ack],
    protocol: 'TCP',
    info: `${TCP.clientPort} → 443 [ACK] Seq=1 Ack=1 Win=128512 Len=0`,
    sources: [{ rfc: 9293, section: '3.5' }],
    states: { server: 'ESTABLISHED' },
    details: {
      what: 'The laptop acknowledges the server SYN. Right behind it, without waiting, it sends the TLS ClientHello.',
      why: 'The window field now holds 502; with the window scale of 8 agreed in the SYNs, that means 502 x 256 = 128512 octets.',
      keyFields: [{ layer: 'tcp', field: 'window' }],
    },
  },
  // ---- 6 TLS
  ...(
    [
      ['client-hello', 'tls-client-hello', C, 'ClientHello', 'The browser starts TLS 1.3: cipher suites, its key share, the server name www.example.com (SNI) and the application protocols it speaks (ALPN: h2, http/1.1).', 'The name is still visible here: SNI tells the server which certificate to present, and the network can read it.'],
      ['server-hello', 'tls-server-hello', S, 'ServerHello', 'The server picks the cipher suite and sends its key share. From now on both sides can compute the handshake keys.', 'Everything after this message is encrypted, including the certificate.'],
      ['server-ccs', 'tls-server-ccs', S, 'ChangeCipherSpec', 'A dummy ChangeCipherSpec record for middlebox compatibility.', 'TLS 1.3 does not need it; it makes the handshake look like a resumed TLS 1.2 session to old network devices.'],
      ['encrypted-extensions', 'tls-encrypted-extensions', S, 'EncryptedExtensions', 'The server confirms HTTP/2 through ALPN, encrypted.', 'The application protocol is decided inside the TLS handshake, so no extra round trip is needed later.'],
      ['certificate', 'tls-certificate', S, 'Certificate', 'The server sends its certificate chain for www.example.com.', 'The browser checks that the chain leads to a trusted root and that the name matches the one it asked for.'],
      ['certificate-verify', 'tls-certificate-verify', S, 'CertificateVerify', 'The server signs the handshake with the private key of its certificate.', 'This proves the server owns the certificate, not only that it can send a copy.'],
      ['server-finished', 'tls-server-finished', S, 'Finished', 'The server Finished protects the whole handshake against tampering.', 'If anyone had changed a message in between, the Finished value would not match.'],
      ['client-ccs', 'tls-client-ccs', C, 'ChangeCipherSpec', 'The laptop sends its own compatibility ChangeCipherSpec.', 'Like the server one, it carries no meaning in TLS 1.3.'],
      ['client-finished', 'tls-client-finished', C, 'Finished', 'The laptop has verified certificate, signature and Finished, and sends its own Finished. The encrypted channel is ready after a single round trip.', 'Since the start of the TCP handshake, two round trips have passed.'],
    ] as const
  ).map(([src, id, from, label, what, why]) => ({
    id,
    phase: 'tls',
    from,
    to: from === C ? S : C,
    path: from === C ? toWeb : fromWeb,
    label,
    time: tlsTime(src),
    category: 'tls',
    source: tls(src),
    details: { what, why },
    ...(src === 'server-hello' ? { learned: [{ label: 'Cipher suite', value: 'TLS_AES_128_GCM_SHA256' }] } : {}),
    ...(src === 'encrypted-extensions' ? { learned: [{ label: 'Application protocol', value: 'h2 (HTTP/2)' }] } : {}),
    ...(src === 'server-finished' ? { learned: [{ label: 'Server identity', value: 'verified for www.example.com' }] } : {}),
  })),
  // ---- 7 HTTP
  {
    id: 'http-request',
    phase: 'http',
    from: C,
    to: S,
    path: toWeb,
    label: 'HTTP/2 request',
    time: tlsTime('client-data'),
    category: 'http',
    source: tls('client-data'),
    details: {
      what: 'Inside the encrypted channel the browser sends the HTTP/2 connection preface, its settings and the request GET / for www.example.com.',
      why: 'From outside only a TLS Application Data record of some size is visible: not the path, not the headers, not the cookies.',
    },
  },
  {
    id: 'http-ticket',
    phase: 'http',
    from: S,
    to: C,
    path: fromWeb,
    label: 'NewSessionTicket',
    time: tlsTime('session-ticket'),
    category: 'tls',
    source: tls('session-ticket'),
    details: {
      what: 'Before its answer the server sends a session ticket, encrypted like everything else.',
      why: 'With it, the next connection to www.example.com can skip the certificate exchange and even send data in its first flight (0-RTT).',
    },
  },
  {
    id: 'http-response',
    phase: 'http',
    from: S,
    to: C,
    path: fromWeb,
    label: 'HTTP/2 response',
    time: tlsTime('server-data'),
    category: 'http',
    source: tls('server-data'),
    details: {
      what: 'The response arrives: HTTP/2 frames with the status and the start of the page, encrypted. The browser can start parsing the HTML.',
      why: 'When this answer reaches the laptop, about 163 ms have passed since the DNS query: about 70 ms for the DNS lookup, then three round trips of about 30 ms each, for TCP, TLS and HTTP.',
      insight: 'Each phase built on the one before: no address without DHCP, no frame without ARP, no destination without DNS, no stream without TCP, no privacy without TLS. Loading the images and scripts of the page reuses this connection; HTTP/3 over QUIC would merge the TCP and TLS round trips into one.',
    },
    learned: [{ label: 'Page', value: 'first bytes of the HTML received' }],
  },
];

export const urlToPageExchange: Exchange = {
  id: 'url-to-page',
  title: 'From URL to page',
  summary: 'A laptop joins a network and opens https://www.example.com: DHCP, ARP, DNS, ARP, TCP, TLS and HTTP/2 in one chain.',
  group: 'Learn',
  scenario:
    'A laptop is plugged into a network and the user opens https://www.example.com. Every frame the laptop sends or receives until the first bytes of the page arrive, captured at the laptop.',
  intro:
    'Each protocol on this site solves one problem. This exchange shows how they hand over to each other: DHCP provides the address, gateway and resolver; ARP turns IP addresses into MAC addresses on the local link; DNS turns the name into an address; TCP builds a reliable stream; TLS makes it private and authentic; HTTP finally asks for the page.\n\nThe frames of DHCP, ARP, DNS and TLS are the same as in those exchanges. Use the deep-dive link of each phase for every detail.',
  sources: [{ rfc: 2131 }, { rfc: 826 }, { rfc: 1035 }, { rfc: 9293 }, { rfc: 8446 }, { rfc: 9113 }],
  participants: [
    { id: C, label: 'Laptop', kind: 'host', addr: { mac: CLIENT.mac, ipv4: CLIENT.ip }, pos: { x: 0, y: 0 }, lifeline: true, note: 'Has no IP address at the start' },
    { id: 'switch', label: 'Switch', kind: 'switch', pos: { x: 2, y: 0 }, lifeline: false },
    { id: D, label: 'Resolver', kind: 'resolver', addr: { mac: RESOLVER.mac, ipv4: RESOLVER.ip }, pos: { x: 2, y: 1 }, lifeline: true, note: 'Recursive DNS resolver in the LAN' },
    { id: R, label: 'Router', kind: 'router', addr: { mac: ROUTER.mac, ipv4: ROUTER.ip }, pos: { x: 4, y: 0 }, lifeline: true, note: 'Default gateway and DHCP server' },
    { id: 'internet', label: 'Internet', kind: 'internet', pos: { x: 6, y: 0 }, lifeline: false, note: 'Eight more routers' },
    { id: S, label: 'Web server', kind: 'server', addr: { ipv4: SERVER_IP }, pos: { x: 8, y: 0 }, lifeline: true, note: 'www.example.com, port 443' },
  ],
  links: [
    { id: LINK, a: C, b: 'switch', label: 'Laptop port' },
    { id: 'p-resolver', a: 'switch', b: D, label: 'LAN' },
    { id: 'p-router', a: 'switch', b: R, label: 'LAN' },
    { id: 'up', a: R, b: 'internet', label: 'Uplink' },
    { id: 'srv', a: 'internet', b: S, label: 'Server network' },
  ],
  initialStates: { client: 'INIT', server: 'LISTEN' },
  categories: [
    { id: 'setup', label: 'Address setup (DHCP, ARP)', color: 'gray' },
    { id: 'dns', label: 'Name lookup (DNS)', color: 'purple' },
    { id: 'tcp', label: 'Connection (TCP)', color: 'green' },
    { id: 'tls', label: 'Encryption (TLS)', color: 'blue' },
    { id: 'http', label: 'Page (HTTP/2)', color: 'yellow' },
  ],
  phases: [
    { id: 'dhcp', label: 'DHCP', about: 'Get an address, a gateway and a resolver.', deepDive: 'dhcp' },
    { id: 'arp-resolver', label: 'ARP', about: 'Find the MAC address of the resolver in the same network.', deepDive: 'arp' },
    { id: 'dns', label: 'DNS', about: 'Turn www.example.com into an IP address.', deepDive: 'dns' },
    { id: 'arp-gateway', label: 'ARP', about: 'Find the MAC address of the gateway for a destination outside the network.', deepDive: 'arp' },
    { id: 'tcp', label: 'TCP', about: 'Open a reliable connection to the web server.', deepDive: 'tcp' },
    { id: 'tls', label: 'TLS', about: 'Agree on keys, verify the server, encrypt.', deepDive: 'tls' },
    { id: 'http', label: 'HTTP', about: 'Request the page and receive it.', deepDive: 'http2' },
  ],
  steps: SPECS.map(build),
};
