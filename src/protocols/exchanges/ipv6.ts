import type { Capture, Exchange, Learned, Source, Step, StepDetails } from '../../shared/schema';
import { ethIpv6Icmpv6 } from '../../shared/headers/stacks';
import { icmpv6Info, type Icmpv6Message } from '../../shared/headers/icmpv6';
import { parseMac } from '../../shared/lib/encode';
import { eui64, multicastMac, solicitedNode, withInterfaceId } from '../../shared/lib/ipv6';
import { LINUX_PING_DISPLAY, linuxPingData } from './common';

// A host joins an IPv6 network and pings a server: the IPv6 counterpart of DHCP, ARP and the
// first packet. Addresses from the documentation prefix 2001:db8::/32 (RFC 3849), MAC addresses RFC 7042.

const HOST_MAC = '00:00:5e:00:53:0a';
const ROUTER_MAC = '00:00:5e:00:53:01';
const IID = eui64(parseMac(HOST_MAC));
const LINK_LOCAL = withInterfaceId('fe80::', IID);
const PREFIX = '2001:db8:1::';
const GLOBAL = withInterfaceId(PREFIX, IID);
const ROUTER_LL = 'fe80::1';
const SERVER = '2001:db8:200::80';
const UNSPECIFIED = '::';
const ALL_NODES = 'ff02::1';
const ALL_ROUTERS = 'ff02::2';
const SOLICITED = solicitedNode(LINK_LOCAL);
/** Routers between the LAN and the server, as in the other exchanges. */
const HOPS = 8;

const PING_ID = 0x2c50;
const PING_DATA = linuxPingData(1793955602, 4000);

const H = 'host';
const R = 'router';
const S = 'server';

function frame(link: string, note: string, eth: { src: string; dst: string }, ip: { src: string; dst: string; hopLimit: number; notes?: Record<string, string> }, icmp: Icmpv6Message): Capture {
  return ethIpv6Icmpv6({ link, note, eth, ip, icmp });
}

const fromHost = 'As sent by the host.';
const toHost = 'As delivered to the host.';

const ND = (section: string): Source => ({ rfc: 4861, section });
const SLAAC = (section: string): Source => ({ rfc: 4862, section });

const dadNs = (target: string): Icmpv6Message => ({
  kind: 'ns',
  target,
  options: [],
  notes: { options: 'Empty: a Duplicate Address Detection probe comes from the unspecified address and must not carry a Source Link-Layer Address.' },
});

const rs: Icmpv6Message = { kind: 'rs', options: [{ kind: 'slla', mac: HOST_MAC }] };
const ra: Icmpv6Message = {
  kind: 'ra',
  curHopLimit: 64,
  managed: false,
  other: false,
  routerLifetime: 1800,
  reachableTime: 0,
  retransTimer: 0,
  options: [
    { kind: 'slla', mac: ROUTER_MAC },
    { kind: 'mtu', mtu: 1500 },
    { kind: 'prefix', prefix: PREFIX, length: 64, onLink: true, autonomous: true, validLifetime: 2592000, preferredLifetime: 604800 },
  ],
  notes: { routerLifetime: '1800 s is the default: three times the maximum interval between periodic advertisements (600 s).' },
};
const echoReq: Icmpv6Message = { kind: 'echo-request', identifier: PING_ID, sequence: 1, data: PING_DATA, dataDisplay: LINUX_PING_DISPLAY };
const echoRep: Icmpv6Message = { kind: 'echo-reply', identifier: PING_ID, sequence: 1, data: PING_DATA, dataDisplay: LINUX_PING_DISPLAY };
const resolveNs: Icmpv6Message = { kind: 'ns', target: GLOBAL, options: [{ kind: 'slla', mac: ROUTER_MAC }] };
const resolveNa: Icmpv6Message = { kind: 'na', router: false, solicited: true, override: true, target: GLOBAL, options: [{ kind: 'tlla', mac: HOST_MAC }] };
const nudNs: Icmpv6Message = { kind: 'ns', target: ROUTER_LL, options: [{ kind: 'slla', mac: HOST_MAC }] };
const nudNa: Icmpv6Message = { kind: 'na', router: true, solicited: true, override: true, target: ROUTER_LL, options: [{ kind: 'tlla', mac: ROUTER_MAC }] };

const fact = (label: string, value: string): Learned => ({ label, value });

interface Spec {
  id: string;
  from: string;
  to: string;
  path: string[];
  extraPaths?: string[][];
  label: string;
  time: number;
  category: string;
  captures: Capture[];
  msg: Icmpv6Message;
  details: StepDetails;
  sources: Source[];
  states?: Record<string, string>;
  learned?: Learned[];
}

const SPECS: Spec[] = [
  {
    id: 'dad-link-local',
    from: H,
    to: R,
    path: [H, 'switch', R],
    extraPaths: [[H, 'switch', 'other']],
    label: 'NS (DAD) link-local',
    time: 0,
    category: 'dad',
    msg: dadNs(LINK_LOCAL),
    captures: [
      frame('lan', fromHost, { src: HOST_MAC, dst: multicastMac(SOLICITED) }, { src: UNSPECIFIED, dst: SOLICITED, hopLimit: 255, notes: { src: 'The unspecified address: the host may not use its new address before the check is done.', dst: 'The solicited-node multicast group of the address being checked: only hosts whose addresses end in the same 24 bits listen.' } }, dadNs(LINK_LOCAL)),
    ],
    sources: [SLAAC('5.3'), SLAAC('5.4'), { rfc: 4291, section: '2.5.1' }, { rfc: 4291, section: '2.7.1' }, { rfc: 2464, section: '7' }],
    states: { host: 'LL tentative' },
    learned: [fact('Link-local address', `${LINK_LOCAL} (tentative)`)],
    details: {
      what: `The interface comes up. Before it has any other address, the host forms a link-local address from the prefix fe80::/64 and an interface identifier, here made from its MAC address: ${LINK_LOCAL}. Before using it, it asks whether anybody else already has it: a Neighbor Solicitation for that address, sent from the unspecified address :: to the address's solicited-node multicast group ${SOLICITED}.`,
      why: 'IPv6 has no broadcast. The solicited-node group contains only hosts whose addresses end in the same 24 bits, so in practice only a host that really owns the address hears the question. The Ethernet destination 33:33:ff:00:53:0a is derived from the group address.',
      typical:
        'Building the interface identifier from the MAC address (modified EUI-64: ff:fe in the middle, one bit flipped) is the classic method shown here. Current systems usually prefer stable random-looking identifiers (RFC 7217, RFC 8064) or temporary addresses (RFC 8981), so that the address does not reveal the device across networks.',
      wrong: 'Before this probe the host also joins the multicast groups with MLDv2 reports and waits a short random time; those messages are left out here. If another host answers with a Neighbor Advertisement, the address is a duplicate and the host must not use it.',
      insight: 'Every IPv6 interface has a link-local address, even with no router on the link. Neighbor Discovery itself runs on these addresses.',
      keyFields: [{ layer: 'ipv6', field: 'src' }, { layer: 'ipv6', field: 'dst' }, { layer: 'icmpv6-ns', field: 'target' }, { layer: 'ethernet', field: 'dst' }],
    },
  },
  {
    id: 'rs',
    from: H,
    to: R,
    path: [H, 'switch', R],
    extraPaths: [[H, 'switch', 'other']],
    label: 'Router Solicitation',
    time: 1000.2,
    category: 'router',
    msg: rs,
    captures: [frame('lan', fromHost, { src: HOST_MAC, dst: multicastMac(ALL_ROUTERS) }, { src: LINK_LOCAL, dst: ALL_ROUTERS, hopLimit: 255 }, rs)],
    sources: [ND('6.3.7'), ND('4.1'), SLAAC('5.4')],
    states: { host: 'LL valid' },
    learned: [fact('Link-local address', `${LINK_LOCAL} (valid)`)],
    details: {
      what: 'After one second without an answer the link-local address is the host\'s. Now it asks all routers on the link (ff02::2) to announce themselves, with its own MAC address in the Source Link-Layer Address option.',
      why: 'Routers send Router Advertisements every few minutes anyway, but a host that just came up does not want to wait that long. The solicitation asks for one now.',
      typical: 'One second is the default wait for Duplicate Address Detection: one probe (DupAddrDetectTransmits = 1) and a retransmission timer of 1000 ms.',
      keyFields: [{ layer: 'ipv6', field: 'dst' }, { layer: 'icmpv6-rs', field: 'options' }],
    },
  },
  {
    id: 'ra',
    from: R,
    to: H,
    path: [R, 'switch', H],
    extraPaths: [[R, 'switch', 'other']],
    label: 'Router Advertisement',
    time: 1001.0,
    category: 'router',
    msg: ra,
    captures: [frame('lan', toHost, { src: ROUTER_MAC, dst: multicastMac(ALL_NODES) }, { src: ROUTER_LL, dst: ALL_NODES, hopLimit: 255, notes: { hopLimit: 'Hosts drop Neighbor Discovery messages that arrive with less than 255: proof that the sender is on this link.' } }, ra)],
    sources: [ND('4.2'), ND('6.2.6'), ND('6.3.4'), ND('4.6.2')],
    learned: [
      fact('Default router', `${ROUTER_LL}, for 1800 s`),
      fact('Prefix on this link', `${PREFIX}/64 (SLAAC allowed)`),
      fact('Neighbor cache: fe80::1', `${ROUTER_MAC} (STALE)`),
    ],
    details: {
      what: 'The router answers all nodes on the link (ff02::1): use me as default router for 1800 seconds; the link MTU is 1500; the prefix 2001:db8:1::/64 is on this link, and you may form your own addresses from it (A flag). M and O are clear: there is no DHCPv6 to ask.',
      why: 'One message carries what DHCP and ARP provide for IPv4: the gateway, the network prefix, and even the router\'s MAC address. The router speaks from its link-local address, so hosts keep their default route even if the global prefix changes.',
      typical: 'The host puts the router\'s MAC address from the option into its neighbor cache, in state STALE: known, but not yet confirmed. An RA can also carry DNS servers (RDNSS option, RFC 8106); this one does not.',
      wrong: 'Any host on the link can send a Router Advertisement, just as any host can answer ARP. A rogue RA makes hosts use a fake gateway; switches block them from host ports with RA Guard (RFC 6105).',
      insight: 'SLAAC needs no server that remembers which address it gave to whom: the router announces a prefix, and every host builds its own address.',
      keyFields: [{ layer: 'icmpv6-ra', field: 'options' }, { layer: 'icmpv6-ra', field: 'routerLifetime' }, { layer: 'icmpv6-ra', field: 'managed' }],
    },
  },
  {
    id: 'dad-global',
    from: H,
    to: R,
    path: [H, 'switch', R],
    extraPaths: [[H, 'switch', 'other']],
    label: 'NS (DAD) global',
    time: 1001.5,
    category: 'dad',
    msg: dadNs(GLOBAL),
    captures: [frame('lan', fromHost, { src: HOST_MAC, dst: multicastMac(solicitedNode(GLOBAL)) }, { src: UNSPECIFIED, dst: solicitedNode(GLOBAL), hopLimit: 255 }, dadNs(GLOBAL))],
    sources: [SLAAC('5.5.3'), SLAAC('5.4'), { rfc: 8981 }],
    states: { host: 'GUA tentative' },
    learned: [fact('Global address', `${GLOBAL} (tentative)`)],
    details: {
      what: `The host forms its global address from the advertised prefix and the same interface identifier: ${GLOBAL}. Like the link-local address, it is checked for duplicates first.`,
      why: 'An address must be unique on the link before it is used, whichever prefix it has.',
      typical: 'Many hosts also form one or more temporary addresses (RFC 8981) from the same prefix with random interface identifiers, and use them for outgoing connections. Each one goes through the same check; they are left out here.',
      insight: 'The solicited-node group is the same as for the link-local address, because both addresses end in the same interface identifier. One multicast group serves all addresses of the interface.',
      keyFields: [{ layer: 'icmpv6-ns', field: 'target' }, { layer: 'ipv6', field: 'dst' }],
    },
  },
  {
    id: 'ping',
    from: H,
    to: S,
    path: [H, 'switch', R, 'internet', S],
    label: 'Echo Request',
    time: 2002,
    category: 'data',
    msg: echoReq,
    captures: [frame('lan', fromHost, { src: HOST_MAC, dst: ROUTER_MAC }, { src: GLOBAL, dst: SERVER, hopLimit: 64, notes: { hopLimit: 'The Cur Hop Limit from the Router Advertisement.' } }, echoReq)],
    sources: [{ rfc: 4443, section: '4.1' }, ND('7.3.3'), { rfc: 8200, section: '3' }],
    states: { host: 'GUA valid' },
    learned: [fact('Global address', `${GLOBAL} (valid)`), fact('Neighbor cache: fe80::1', `${ROUTER_MAC} (DELAY)`)],
    details: {
      what: 'One second later the global address is valid. The host pings the server: the destination is not on-link (it is outside 2001:db8:1::/64), so the packet goes to the default router. Its MAC address is already in the neighbor cache from the Router Advertisement, so the frame leaves at once, with no address resolution first.',
      why: 'Compare with IPv4: there the host had to send an ARP request before the first packet. Here the RA already delivered the answer.',
      typical: 'Sending to a STALE entry moves it to DELAY: the host waits up to 5 seconds for a sign from upper layers (for example TCP acknowledgments) that the router is reachable before it checks for itself.',
      keyFields: [{ layer: 'ethernet', field: 'dst' }, { layer: 'ipv6', field: 'dst' }, { layer: 'ipv6', field: 'src' }],
    },
  },
  {
    id: 'resolve-ns',
    from: R,
    to: H,
    path: [R, 'switch', H],
    extraPaths: [[R, 'switch', 'other']],
    label: 'NS (who has the address?)',
    time: 2025,
    category: 'neighbor',
    msg: resolveNs,
    captures: [
      frame('lan', toHost, { src: ROUTER_MAC, dst: multicastMac(solicitedNode(GLOBAL)) }, { src: ROUTER_LL, dst: solicitedNode(GLOBAL), hopLimit: 255, notes: { dst: 'The solicited-node group of the address the router is looking for.' } }, resolveNs),
    ],
    sources: [ND('7.2.2'), ND('7.2.3'), { rfc: 4291, section: '2.7.1' }],
    details: {
      what: `The server's reply has reached the router, which now needs the MAC address for ${GLOBAL}. It has never sent anything to that address, so it asks: a Neighbor Solicitation to the address's solicited-node multicast group, with its own MAC in the Source Link-Layer Address option.`,
      why: 'This is the IPv6 version of an ARP request. Instead of a broadcast to every host, it goes to a multicast group that, in practice, only the owner of the address has joined.',
      typical: 'The router knew the host\'s MAC address for the link-local address from the Router Solicitation, but neighbor cache entries are per IPv6 address, and the global address is a different one.',
      keyFields: [{ layer: 'ipv6', field: 'dst' }, { layer: 'icmpv6-ns', field: 'target' }, { layer: 'ethernet', field: 'dst' }],
    },
  },
  {
    id: 'resolve-na',
    from: H,
    to: R,
    path: [H, 'switch', R],
    label: 'Neighbor Advertisement',
    time: 2025.2,
    category: 'neighbor',
    msg: resolveNa,
    captures: [frame('lan', fromHost, { src: HOST_MAC, dst: ROUTER_MAC }, { src: GLOBAL, dst: ROUTER_LL, hopLimit: 255 }, resolveNa)],
    sources: [ND('7.2.4'), ND('4.4')],
    details: {
      what: 'The host answers the router directly: S (solicited), O (override), R clear because the host is not a router, and its MAC address in the Target Link-Layer Address option.',
      why: 'The answer goes by unicast: the router included its own MAC address in the question, so the host can address it without asking back.',
      keyFields: [{ layer: 'icmpv6-na', field: 'options' }, { layer: 'icmpv6-na', field: 'router' }],
    },
  },
  {
    id: 'pong',
    from: S,
    to: H,
    path: [S, 'internet', R, 'switch', H],
    label: 'Echo Reply',
    time: 2025.4,
    category: 'data',
    msg: echoRep,
    captures: [frame('lan', toHost, { src: ROUTER_MAC, dst: HOST_MAC }, { src: SERVER, dst: GLOBAL, hopLimit: 64 - HOPS }, echoRep)],
    sources: [{ rfc: 4443, section: '4.2' }],
    details: {
      what: `Now the router can deliver the server's reply. It arrives with hop limit ${64 - HOPS} after ${HOPS} routers.`,
      why: 'Both directions needed Neighbor Discovery: the host found the router through the Router Advertisement, the router found the host with a Neighbor Solicitation.',
      typical: 'Ping shows the address in its short form, for example "64 bytes from 2001:db8:200::80: icmp_seq=1 ttl=56".',
      keyFields: [{ layer: 'ipv6', field: 'hopLimit' }],
    },
  },
  {
    id: 'nud-ns',
    from: H,
    to: R,
    path: [H, 'switch', R],
    label: 'NS (is the router there?)',
    time: 7002,
    category: 'neighbor',
    msg: nudNs,
    captures: [frame('lan', fromHost, { src: HOST_MAC, dst: ROUTER_MAC }, { src: GLOBAL, dst: ROUTER_LL, hopLimit: 255, notes: { dst: 'Unicast to the router: this is a reachability check, not a question to everybody.' } }, nudNs)],
    sources: [ND('7.3'), ND('7.3.3'), ND('7.2.2'), ND('10')],
    learned: [fact('Neighbor cache: fe80::1', `${ROUTER_MAC} (PROBE)`)],
    details: {
      what: 'Five seconds passed without a confirmation that the router is still reachable at that MAC address. The host checks itself: a Neighbor Solicitation, sent straight to the router\'s MAC and link-local address.',
      why: 'Neighbor Unreachability Detection: a cache entry is only trusted while there is evidence. An echo reply from a remote server is not such evidence for most implementations, because it says nothing about which first hop delivered it.',
      typical: 'When the host has no entry at all, address resolution looks like the DAD probe: a Neighbor Solicitation to the solicited-node multicast group of the target, the IPv6 version of an ARP request. Here the entry exists, so the probe is unicast.',
      keyFields: [{ layer: 'ipv6', field: 'dst' }, { layer: 'icmpv6-ns', field: 'target' }, { layer: 'ethernet', field: 'dst' }],
    },
  },
  {
    id: 'nud-na',
    from: R,
    to: H,
    path: [R, 'switch', H],
    label: 'Neighbor Advertisement',
    time: 7002.3,
    category: 'neighbor',
    msg: nudNa,
    captures: [frame('lan', toHost, { src: ROUTER_MAC, dst: HOST_MAC }, { src: ROUTER_LL, dst: GLOBAL, hopLimit: 255 }, nudNa)],
    sources: [ND('4.4'), ND('7.2.4'), ND('7.2.5')],
    learned: [fact('Neighbor cache: fe80::1', `${ROUTER_MAC} (REACHABLE)`)],
    details: {
      what: 'The router answers with a Neighbor Advertisement: R (I am a router), S (this answers your solicitation), O (replace your entry), and its MAC address in the Target Link-Layer Address option. The entry becomes REACHABLE.',
      why: 'The S flag is what turns the answer into a confirmation of reachability. The R flag lets the host notice if a router stops being one.',
      insight: 'Neighbor Discovery replaces ARP and adds what ARP never had: unreachability detection, router discovery and duplicate detection, all in ICMPv6 on top of IPv6 instead of a separate protocol below it.',
      wrong: 'Like ARP, plain Neighbor Discovery has no authentication; spoofed advertisements work the same way as ARP spoofing. SEND (RFC 3971) adds signatures but is rarely deployed; switches use RA Guard and ND inspection instead.',
      keyFields: [{ layer: 'icmpv6-na', field: 'solicited' }, { layer: 'icmpv6-na', field: 'router' }, { layer: 'icmpv6-na', field: 'options' }],
    },
  },
];

const build = (s: Spec): Step => ({
  id: s.id,
  from: s.from,
  to: s.to,
  path: s.path,
  ...(s.extraPaths ? { extraPaths: s.extraPaths } : {}),
  label: s.label,
  details: s.details,
  captures: s.captures,
  sources: s.sources,
  time: s.time,
  category: s.category,
  protocol: 'ICMPv6',
  info: icmpv6Info(s.msg),
  ...(s.states ? { states: s.states } : {}),
  ...(s.learned ? { learned: s.learned } : {}),
});

export const ipv6Exchange: Exchange = {
  id: 'ipv6',
  title: 'IPv6, NDP and SLAAC',
  summary: 'A host joins an IPv6 network: link-local address, duplicate check, router advertisement, its own global address, and Neighbor Discovery instead of ARP.',
  group: 'Internet',
  scenario:
    'A laptop is plugged into an IPv6 network without DHCPv6. It configures itself from scratch, gets its prefix and default router from a Router Advertisement, and pings a server on the Internet.',
  intro:
    'IPv6 does without DHCP and ARP in the common case. Every interface first gives itself a link-local address and checks that nobody else has it. A router advertises the prefix of the link, and the host forms its global address from it (stateless address autoconfiguration, SLAAC). Address resolution and router discovery are ICMPv6 messages: Neighbor Discovery.\n\nThe sequence view shows the state of the host\'s addresses: LL is the link-local address, GUA the global unicast address; tentative means it is still being checked for duplicates. The "known so far" panel shows the host\'s addresses and its neighbor cache entry for the router.',
  sources: [
    { rfc: 8200, note: 'IPv6' },
    { rfc: 4443, note: 'ICMPv6' },
    { rfc: 4861, note: 'Neighbor Discovery' },
    { rfc: 4862, note: 'Stateless Address Autoconfiguration' },
    { rfc: 4291, note: 'addressing architecture' },
    { rfc: 2464, note: 'IPv6 over Ethernet, multicast MAC addresses' },
    { rfc: 8981, note: 'temporary addresses' },
    { rfc: 7217, note: 'stable interface identifiers' },
    { rfc: 3849, note: 'documentation prefix 2001:db8::/32' },
  ],
  participants: [
    { id: H, label: 'Laptop', kind: 'host', addr: { mac: HOST_MAC }, pos: { x: 0, y: 0 }, lifeline: true, note: `No address yet. Later link-local ${LINK_LOCAL}, global ${GLOBAL}` },
    { id: 'switch', label: 'Switch', kind: 'switch', pos: { x: 2, y: 0 }, lifeline: false },
    { id: 'other', label: 'Other host', kind: 'host', pos: { x: 2, y: 1 }, lifeline: false, note: 'Receives multicast it has joined' },
    { id: R, label: 'Router', kind: 'router', addr: { mac: ROUTER_MAC, ipv6: ROUTER_LL }, pos: { x: 4, y: 0 }, lifeline: true, note: `Advertises ${PREFIX}/64` },
    { id: 'internet', label: 'Internet', kind: 'internet', pos: { x: 6, y: 0 }, lifeline: false },
    { id: S, label: 'Server', kind: 'server', addr: { ipv6: SERVER }, pos: { x: 8, y: 0 }, lifeline: true },
  ],
  links: [
    { id: 'lan', a: H, b: 'switch', label: 'Port 1' },
    { id: 'p-other', a: 'switch', b: 'other', label: 'Port 2' },
    { id: 'p-router', a: 'switch', b: R, label: 'Port 3' },
    { id: 'up', a: R, b: 'internet', label: 'Uplink' },
    { id: 'srv', a: 'internet', b: S, label: '' },
  ],
  initialStates: { host: 'no address' },
  categories: [
    { id: 'dad', label: 'Duplicate Address Detection', color: 'purple' },
    { id: 'router', label: 'Router discovery', color: 'green' },
    { id: 'data', label: 'First packets', color: 'blue' },
    { id: 'neighbor', label: 'Neighbor Unreachability Detection', color: 'yellow' },
  ],
  steps: SPECS.map(build),
};
