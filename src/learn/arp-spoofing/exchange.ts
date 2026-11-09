import type { Capture, Exchange, Learned, Source, Step, StepDetails } from '../../shared/schema';
import { arp } from '../../shared/headers/arp';
import { icmpEcho } from '../../shared/headers/icmp';
import { ethArp, ethIpv4 } from '../../shared/headers/stacks';

// ARP spoofing: an attacker in the same LAN sends forged ARP replies and becomes the man in the middle
// between a laptop and its gateway. Same addresses as the other exchanges; the attacker is new.
// Conceptual: the frames show how the attack works and how a switch stops it, no tooling.

const LAPTOP = { mac: '00:00:5e:00:53:0a', ip: '192.0.2.50' };
const ROUTER = { mac: '00:00:5e:00:53:01', ip: '192.0.2.1' };
const ATTACKER = { mac: '00:00:5e:00:53:66', ip: '192.0.2.66' };
const SERVER_IP = '203.0.113.80';
/** Routers between the LAN and the server, as in the TCP exchange: replies arrive with TTL 64 - 9 = 55. */
const HOPS = 9;

const PING_ID = 0x2c4f;
const PING_DATA = Uint8Array.from('abcdefghijklmnopqrstuvwabcdefghi', (c) => c.charCodeAt(0));

const C = 'client';
const A = 'attacker';
const R = 'router';
const S = 'server';

function ping(kind: 'request' | 'reply', seq: number, link: string, eth: { src: string; dst: string }, ttl: number, id: number, note: string): Capture {
  const toServer = kind === 'request';
  return ethIpv4({
    link,
    note,
    eth,
    ip: { src: toServer ? LAPTOP.ip : SERVER_IP, dst: toServer ? SERVER_IP : LAPTOP.ip, ttl, id, protocol: 1, df: false },
    inner: [icmpEcho({ kind, identifier: PING_ID, sequence: seq, data: PING_DATA, dataDisplay: '32 octets: abcdefghijklmnopqrstuvwabcdefghi' })],
  });
}

function forgedReply(link: string, victim: { mac: string; ip: string }, claimedIp: string, note: string): Capture {
  return ethArp({
    link,
    note,
    eth: { src: ATTACKER.mac, dst: victim.mac },
    arp: arp({ oper: 'reply', sha: ATTACKER.mac, spa: claimedIp, tha: victim.mac, tpa: victim.ip, notes: { sha: 'The attacker\'s own MAC address.', spa: 'An address that belongs to someone else.' } }),
  });
}

interface Spec {
  id: string;
  phase: string;
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
  lost?: boolean;
}

const RFC826: Source = { rfc: 826 };
const RFC792: Source = { rfc: 792 };
const DAI: Source = { spec: 'Dynamic ARP Inspection, a switch feature (for example Cisco IOS, Juniper, Aruba)', note: 'validates ARP against the DHCP snooping bindings' };

const toServer = [C, 'switch', R, 'internet', S];
const fromServer = [S, 'internet', R, 'switch', C];

const SPECS: Spec[] = [
  // ---- 1 normal
  {
    id: 'normal-request',
    phase: 'normal',
    from: C,
    to: S,
    path: toServer,
    label: 'Ping (normal)',
    time: 0,
    category: 'normal',
    captures: [ping('request', 1, 'lan', { src: LAPTOP.mac, dst: ROUTER.mac }, 64, 0x7d21, 'Captured at the laptop.')],
    protocol: 'ICMP',
    info: `Echo (ping) request id=0x2c4f, seq=1, ttl=64`,
    sources: [RFC792, RFC826],
    learned: [
      { label: 'Laptop: 192.0.2.1 is at', value: `${ROUTER.mac} (router)` },
      { label: 'Router: 192.0.2.50 is at', value: `${LAPTOP.mac} (laptop)` },
    ],
    details: {
      what: 'The laptop pings a server on the Internet. Its ARP cache maps the gateway 192.0.2.1 to the router\'s MAC address, learned with ARP earlier, so the frame goes to the router.',
      why: 'For every destination outside the LAN the laptop sends frames to the MAC address of its gateway. Whoever answers to that MAC address in the switch receives the laptop\'s Internet traffic.',
      keyFields: [{ layer: 'ethernet', field: 'dst' }, { layer: 'ipv4', field: 'dst' }],
    },
  },
  {
    id: 'normal-reply',
    phase: 'normal',
    from: S,
    to: C,
    path: fromServer,
    label: 'Reply (normal)',
    time: 15,
    category: 'normal',
    captures: [ping('reply', 1, 'lan', { src: ROUTER.mac, dst: LAPTOP.mac }, 64 - HOPS, 0x1b07, 'Captured at the laptop.')],
    protocol: 'ICMP',
    info: `Echo (ping) reply id=0x2c4f, seq=1, ttl=${64 - HOPS}`,
    sources: [RFC792],
    details: {
      what: `The reply comes back through the router, which looks up 192.0.2.50 in its own ARP cache and delivers the frame to the laptop. It arrives with TTL ${64 - HOPS}.`,
      why: 'Both directions depend on an ARP cache: the laptop\'s for the way out, the router\'s for the way back.',
      keyFields: [{ layer: 'ipv4', field: 'ttl' }],
    },
  },
  // ---- 2 attack
  {
    id: 'spoof-laptop',
    phase: 'attack',
    from: A,
    to: C,
    path: [A, 'switch', C],
    label: 'Forged ARP reply',
    time: 1000,
    category: 'attack',
    captures: [forgedReply('lan', LAPTOP, ROUTER.ip, 'Captured at the laptop.')],
    protocol: 'ARP',
    info: `${ROUTER.ip} is at ${ATTACKER.mac}`,
    sources: [{ rfc: 826 }],
    learned: [{ label: 'Laptop: 192.0.2.1 is at', value: `${ATTACKER.mac} (attacker)` }],
    details: {
      what: 'Another host in the LAN sends the laptop an ARP reply nobody asked for: "192.0.2.1 is at 00:00:5e:00:53:66", its own MAC address. The laptop overwrites its cache entry for the gateway.',
      why: 'ARP has no authentication. RFC 826 tells a host to update an existing entry from any ARP packet that mentions it, so a reply is believed even without a request. Repeating it every few seconds keeps the entry poisoned.',
      wrong: 'Nothing in the frame is visibly wrong: sender and target fields are well-formed. Only the combination, an IP address of the router with a MAC address of another port, betrays it.',
      keyFields: [{ layer: 'arp', field: 'spa' }, { layer: 'arp', field: 'sha' }],
    },
  },
  {
    id: 'spoof-router',
    phase: 'attack',
    from: A,
    to: R,
    path: [A, 'switch', R],
    label: 'Forged ARP reply',
    time: 1000.1,
    category: 'attack',
    captures: [forgedReply('p-attacker', ROUTER, LAPTOP.ip, 'Captured at the attacker\'s switch port.')],
    protocol: 'ARP',
    info: `${LAPTOP.ip} is at ${ATTACKER.mac}`,
    sources: [{ rfc: 826 }],
    learned: [{ label: 'Router: 192.0.2.50 is at', value: `${ATTACKER.mac} (attacker)` }],
    details: {
      what: 'The same lie in the other direction: the router learns that the laptop\'s address 192.0.2.50 is at the attacker\'s MAC address.',
      why: 'Poisoning both caches puts the attacker into both directions of the conversation, a man in the middle. Poisoning only the laptop would give the attacker the outgoing traffic, but the replies would still go straight to the laptop.',
      keyFields: [{ layer: 'arp', field: 'spa' }, { layer: 'arp', field: 'tpa' }],
    },
  },
  // ---- 3 effect
  {
    id: 'mitm-request-in',
    phase: 'effect',
    from: C,
    to: A,
    path: [C, 'switch', A],
    label: 'Ping to the attacker',
    time: 2000,
    category: 'mitm',
    captures: [ping('request', 2, 'lan', { src: LAPTOP.mac, dst: ATTACKER.mac }, 64, 0x7d22, 'Captured at the laptop.')],
    protocol: 'ICMP',
    info: `Echo (ping) request id=0x2c4f, seq=2, ttl=64`,
    sources: [RFC826],
    details: {
      what: 'The laptop pings the server again. The IP destination is still 203.0.113.80, but the frame now goes to the attacker\'s MAC address, and the switch delivers it to the attacker\'s port.',
      why: 'The switch does nothing wrong: it forwards by destination MAC address. The deception happened one layer up, in the mapping from IP to MAC address.',
      keyFields: [{ layer: 'ethernet', field: 'dst' }, { layer: 'ipv4', field: 'dst' }],
    },
  },
  {
    id: 'mitm-request-out',
    phase: 'effect',
    from: A,
    to: S,
    path: [A, 'switch', R, 'internet', S],
    label: 'Forwarded',
    time: 2000.2,
    category: 'mitm',
    captures: [ping('request', 2, 'p-attacker', { src: ATTACKER.mac, dst: ROUTER.mac }, 63, 0x7d22, 'Captured at the attacker\'s switch port.')],
    protocol: 'ICMP',
    info: `Echo (ping) request id=0x2c4f, seq=2, ttl=63`,
    sources: [RFC792, { rfc: 791, section: '3.2' }],
    details: {
      what: 'The attacker reads (or changes) the packet and forwards it to the real router, so the connection keeps working and nobody notices.',
      why: 'The attacker routes the packet like a router: new Ethernet header, same IP addresses, TTL decremented by one.',
      insight: 'The TTL is a trace: the packet leaves the LAN with 63 instead of 64, and replies reach the laptop one lower than before. Attack tools can hide this by forwarding frames without touching the IP header.',
      keyFields: [{ layer: 'ipv4', field: 'ttl' }, { layer: 'ethernet', field: 'src' }],
    },
  },
  {
    id: 'mitm-reply-in',
    phase: 'effect',
    from: S,
    to: A,
    path: [S, 'internet', R, 'switch', A],
    label: 'Reply to the attacker',
    time: 2015.2,
    category: 'mitm',
    captures: [ping('reply', 2, 'p-attacker', { src: ROUTER.mac, dst: ATTACKER.mac }, 64 - HOPS, 0x1b08, 'Captured at the attacker\'s switch port.')],
    protocol: 'ICMP',
    info: `Echo (ping) reply id=0x2c4f, seq=2, ttl=${64 - HOPS}`,
    sources: [RFC826],
    details: {
      what: 'The reply for 192.0.2.50 reaches the router, which now sends it to the attacker\'s MAC address.',
      why: 'The router\'s cache was poisoned too, so the way back also leads through the attacker.',
      keyFields: [{ layer: 'ethernet', field: 'dst' }],
    },
  },
  {
    id: 'mitm-reply-out',
    phase: 'effect',
    from: A,
    to: C,
    path: [A, 'switch', C],
    label: 'Reply forwarded',
    time: 2030.3,
    category: 'mitm',
    captures: [ping('reply', 2, 'lan', { src: ATTACKER.mac, dst: LAPTOP.mac }, 64 - HOPS - 1, 0x1b08, 'Captured at the laptop.')],
    protocol: 'ICMP',
    info: `Echo (ping) reply id=0x2c4f, seq=2, ttl=${64 - HOPS - 1}`,
    sources: [RFC792],
    details: {
      what: `The attacker passes the reply on. The laptop gets its answer, with TTL ${64 - HOPS - 1} instead of ${64 - HOPS}, and from the attacker's MAC address.`,
      why: 'Everything the laptop sends to the Internet and receives from it now passes the attacker. Unencrypted protocols can be read and changed; with TLS the attacker sees only encrypted records, and a forged certificate would fail validation.',
      insight: 'Encryption does not prevent ARP spoofing, but it makes the position in the middle nearly worthless: this is why HTTPS everywhere matters even inside "trusted" networks.',
      keyFields: [{ layer: 'ethernet', field: 'src' }, { layer: 'ipv4', field: 'ttl' }],
    },
  },
  // ---- 4 defense
  {
    id: 'dai-drop',
    phase: 'defense',
    from: A,
    to: C,
    path: [A, 'switch', C],
    label: 'Forged reply dropped',
    time: 5000,
    category: 'defense',
    captures: [forgedReply('p-attacker', LAPTOP, ROUTER.ip, 'Captured at the attacker\'s switch port, before the switch checks it.')],
    protocol: 'ARP',
    info: `${ROUTER.ip} is at ${ATTACKER.mac}, dropped by the switch`,
    lost: true,
    sources: [DAI, RFC826],
    learned: [
      { label: 'Laptop: 192.0.2.1 is at', value: `${ROUTER.mac} (router)` },
      { label: 'Router: 192.0.2.50 is at', value: `${LAPTOP.mac} (laptop)` },
    ],
    details: {
      what: 'The same network a little later, after the caches recovered and the switch got Dynamic ARP Inspection. The attacker sends the forged reply again; the switch drops it at the attacker\'s port.',
      why: 'With DHCP snooping, the switch records which IP address DHCP gave to which MAC address on which port. DAI checks every ARP packet from an untrusted port against that table: the attacker\'s port is bound to 192.0.2.66, not to 192.0.2.1, so the reply never reaches the laptop. The router\'s port is configured as trusted.',
      typical: 'Other defenses: static ARP entries for the gateway on critical hosts, 802.1X so only known devices get a port at all, tools like arpwatch that alert on changed mappings, and above all encryption, so traffic in the middle is useless. IPv6 has the same weakness in Neighbor Discovery; switches counter it with similar features (RA Guard, ND inspection).',
      keyFields: [{ layer: 'arp', field: 'spa' }],
    },
  },
  {
    id: 'dai-ping',
    phase: 'defense',
    from: C,
    to: S,
    path: toServer,
    label: 'Ping (protected)',
    time: 5001,
    category: 'normal',
    captures: [ping('request', 3, 'lan', { src: LAPTOP.mac, dst: ROUTER.mac }, 64, 0x7d23, 'Captured at the laptop.')],
    protocol: 'ICMP',
    info: `Echo (ping) request id=0x2c4f, seq=3, ttl=64`,
    sources: [RFC792],
    details: {
      what: 'The laptop\'s cache still maps the gateway to the router, and traffic takes the direct way again.',
      why: 'The attack failed silently; a switch with DAI usually also logs the dropped packet, which shows the administrator which port attacked.',
      keyFields: [{ layer: 'ethernet', field: 'dst' }],
    },
  },
];

const build = (s: Spec): Step => ({
  id: s.id,
  phase: s.phase,
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
  ...(s.lost ? { lost: true } : {}),
});

export const arpSpoofingExchange: Exchange = {
  id: 'arp-spoofing',
  title: 'Attack: ARP spoofing',
  summary: 'An attacker in the LAN poisons ARP caches and becomes the man in the middle; Dynamic ARP Inspection stops it.',
  group: 'Learn',
  scenario: 'A laptop pings a server through its gateway. A second host in the same LAN sends forged ARP replies, redirects the traffic through itself, and is finally stopped by the switch.',
  intro:
    'ARP maps IP addresses to MAC addresses inside a LAN, and it trusts every answer. Whoever answers for the gateway\'s address receives the traffic meant for the gateway. This scenario shows the frames of the attack, the trace it leaves in the TTL, and how a switch with Dynamic ARP Inspection prevents it.\n\nThe frames illustrate how the attack works; they are built with the same header builders as the protocol pages.',
  sources: [
    { rfc: 826, note: 'ARP has no authentication' },
    { rfc: 4861, section: '11.1', note: 'the same threats in IPv6 Neighbor Discovery' },
    { rfc: 6105, note: 'IPv6 Router Advertisement Guard' },
    DAI,
  ],
  participants: [
    { id: C, label: 'Laptop', kind: 'host', addr: { mac: LAPTOP.mac, ipv4: LAPTOP.ip }, pos: { x: 0, y: 0 }, lifeline: true },
    { id: 'switch', label: 'Switch', kind: 'switch', pos: { x: 2, y: 0 }, lifeline: false },
    { id: A, label: 'Attacker', kind: 'attacker', addr: { mac: ATTACKER.mac, ipv4: ATTACKER.ip }, pos: { x: 2, y: 1 }, lifeline: true, note: 'Another host in the same LAN' },
    { id: R, label: 'Router', kind: 'router', addr: { mac: ROUTER.mac, ipv4: ROUTER.ip }, pos: { x: 4, y: 0 }, lifeline: true, note: 'Default gateway' },
    { id: 'internet', label: 'Internet', kind: 'internet', pos: { x: 6, y: 0 }, lifeline: false },
    { id: S, label: 'Server', kind: 'server', addr: { ipv4: SERVER_IP }, pos: { x: 8, y: 0 }, lifeline: true },
  ],
  links: [
    { id: 'lan', a: C, b: 'switch', label: 'Laptop port' },
    { id: 'p-attacker', a: 'switch', b: A, label: 'Attacker port' },
    { id: 'p-router', a: 'switch', b: R, label: 'Router port' },
    { id: 'up', a: R, b: 'internet', label: 'Uplink' },
    { id: 'srv', a: 'internet', b: S, label: 'Server network' },
  ],
  categories: [
    { id: 'normal', label: 'Normal traffic', color: 'green' },
    { id: 'attack', label: 'Forged ARP', color: 'red' },
    { id: 'mitm', label: 'Traffic through the attacker', color: 'yellow' },
    { id: 'defense', label: 'Blocked by the switch', color: 'blue' },
  ],
  phases: [
    { id: 'normal', label: 'Normal', about: 'Traffic to the Internet goes through the router.', deepDive: 'arp' },
    { id: 'attack', label: 'Attack', about: 'Forged ARP replies poison both caches.', deepDive: 'arp' },
    { id: 'effect', label: 'Man in the middle', about: 'Both directions now pass the attacker.', deepDive: 'icmp' },
    { id: 'defense', label: 'Defense', about: 'The switch checks ARP against DHCP bindings and drops the lie.', deepDive: 'dhcp' },
  ],
  steps: SPECS.map(build),
};
