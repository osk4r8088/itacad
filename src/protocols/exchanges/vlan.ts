import type { Capture, Exchange, Learned, Source, Step, StepDetails } from '../../shared/schema';
import { ethArp, ethIpv4, type EthParams } from '../../shared/headers/stacks';
import { arp } from '../../shared/headers/arp';
import { icmpEcho } from '../../shared/headers/icmp';
import { LINUX_PING_DISPLAY, linuxPingData } from './common';

// Two VLANs on two switches joined by a trunk, and a router on a stick that routes between them.
// VLAN 10: 192.0.2.0/26, VLAN 20: 192.0.2.64/26 (RFC 5737). MAC addresses RFC 9542.
// The trunk carries VLAN 10 tagged and VLAN 20 as its native VLAN, untagged.

const A = { mac: '00:00:5e:00:53:0a', ip: '192.0.2.10' };
const C = { mac: '00:00:5e:00:53:0c', ip: '192.0.2.11' };
const B = { mac: '00:00:5e:00:53:0b', ip: '192.0.2.74' };
const D = { mac: '00:00:5e:00:53:0d', ip: '192.0.2.75' };
/** One MAC address for both subinterfaces, as usual for a router on a stick. */
const ROUTER = { mac: '00:00:5e:00:53:01', ip10: '192.0.2.1', ip20: '192.0.2.65' };
const BROADCAST = 'ff:ff:ff:ff:ff:ff';

const V10 = 10;

const PING_ID = 0x3a11;
const pingData = (n: number) => linuxPingData(1793955700 + n, 125000);

const echo = (kind: 'request' | 'reply', seq: number, data: Uint8Array) => icmpEcho({ kind, identifier: PING_ID, sequence: seq, data, dataDisplay: LINUX_PING_DISPLAY });

const tagged = (insertedBySwitch = true): EthParams['vlan'] => ({ vid: V10, insertedBySwitch });

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
  protocol: string;
  info: string;
  details: StepDetails;
  sources: Source[];
  learned?: Learned[];
}

const Q: Source = { spec: 'IEEE 802.1Q-2022', section: 'Clause 9 (tagged frame format)' };
const BRIDGE: Source = { spec: 'IEEE 802.1Q-2022', note: 'VLAN-aware bridges: ingress, forwarding and egress rules' };

// ---- frames

const arpReq = (link: string, note: string, vlan?: EthParams['vlan']) =>
  ethArp({ link, note, eth: { src: A.mac, dst: BROADCAST, ...(vlan ? { vlan } : {}) }, arp: arp({ oper: 'request', sha: A.mac, spa: A.ip, tha: '00:00:00:00:00:00', tpa: C.ip }) });
const arpRep = (link: string, note: string, vlan?: EthParams['vlan']) =>
  ethArp({ link, note, eth: { src: C.mac, dst: A.mac, ...(vlan ? { vlan } : {}) }, arp: arp({ oper: 'reply', sha: C.mac, spa: C.ip, tha: A.mac, tpa: A.ip }) });

function ping(link: string, note: string, eth: EthParams, src: string, dst: string, ttl: number, id: number, kind: 'request' | 'reply', seq: number): Capture {
  return ethIpv4({ link, note, eth, ip: { src, dst, ttl, id, protocol: 1, df: true }, inner: [echo(kind, seq, pingData(seq))] });
}

const SPECS: Spec[] = [
  {
    id: 'arp-request',
    from: 'pc-a',
    to: 'pc-c',
    path: ['pc-a', 'sw1', 'sw2', 'pc-c'],
    extraPaths: [['pc-a', 'sw1', 'sw2', 'router']],
    label: 'ARP request (VLAN 10)',
    time: 0,
    category: 'v10',
    captures: [arpReq('acc-a', 'On the access port of PC A: untagged, as PC A sent it.'), arpReq('trunk', 'On the trunk between the switches: tagged with VLAN 10.', tagged())],
    protocol: 'ARP',
    info: `Who has ${C.ip}? Tell ${A.ip}`,
    sources: [BRIDGE, Q, { rfc: 826 }],
    learned: [
      { label: 'SW1 MAC table', value: `${A.mac}: port A, VLAN 10` },
      { label: 'SW2 MAC table', value: `${A.mac}: trunk, VLAN 10` },
    ],
    details: {
      what: 'PC A in VLAN 10 broadcasts an ARP request for PC C. Switch 1 floods the broadcast, but only to ports in VLAN 10: the trunk, not the access port of PC B in VLAN 20. On the trunk it inserts a tag with VLAN ID 10, so switch 2 knows which VLAN the frame belongs to. Switch 2 removes the tag and floods the frame to its own VLAN 10 ports: PC C and the router, whose trunk carries VLAN 10.',
      why: 'A VLAN is a separate broadcast domain on shared switches. Each access port belongs to one VLAN; frames never cross into another VLAN at layer 2, so PC B and PC D never see this broadcast.',
      typical:
        'Compare the two captures. On the trunk the EtherType field says 0x8100 (a tag follows), the tag carries VLAN 10, and the original EtherType 0x0806 follows the tag. The frame is 4 octets longer, and the FCS is different, because the switch recomputed it over the new content.',
      wrong: 'IEEE 802.1Q lets a switch keep the padding of a minimum-size frame when it adds a tag (the frame grows to 68 octets) or shorten the padding to stay at 64. This capture keeps it.',
      insight: 'Hosts on access ports never see a tag: switches add it on the way into a trunk and remove it on the way out. To PC A, the network looks like an ordinary LAN with only VLAN 10 in it.',
      keyFields: [{ layer: 'ethernet', field: 'dst' }, { layer: 'ethernet', field: 'type' }],
    },
  },
  {
    id: 'arp-reply',
    from: 'pc-c',
    to: 'pc-a',
    path: ['pc-c', 'sw2', 'sw1', 'pc-a'],
    label: 'ARP reply (VLAN 10)',
    time: 0.4,
    category: 'v10',
    captures: [arpRep('trunk', 'On the trunk: tagged with VLAN 10 by switch 2.', tagged()), arpRep('acc-a', 'On the access port of PC A: untagged again.')],
    protocol: 'ARP',
    info: `${C.ip} is at ${C.mac}`,
    sources: [BRIDGE, Q],
    learned: [
      { label: 'SW2 MAC table', value: `${A.mac}: trunk, VLAN 10; ${C.mac}: port C, VLAN 10` },
      { label: 'SW1 MAC table', value: `${A.mac}: port A, VLAN 10; ${C.mac}: trunk, VLAN 10` },
    ],
    details: {
      what: 'PC C answers by unicast. Switch 2 learned from the request that PC A is reachable over the trunk in VLAN 10, so it sends the reply there, tagged; switch 1 removes the tag and delivers it to port A.',
      why: 'Switches learn MAC addresses per VLAN. The same MAC address could even appear in two VLANs without conflict, because each VLAN has its own forwarding table.',
      keyFields: [{ layer: 'vlan', field: 'vid' }, { layer: 'vlan', field: 'type' }],
    },
  },
  {
    id: 'ping-a-c',
    from: 'pc-a',
    to: 'pc-c',
    path: ['pc-a', 'sw1', 'sw2', 'pc-c'],
    label: 'Ping A to C',
    time: 0.6,
    category: 'v10',
    captures: [
      ping('trunk', 'On the trunk: the frame with the tag inserted and a new FCS.', { src: A.mac, dst: C.mac, vlan: tagged() }, A.ip, C.ip, 64, 0x2201, 'request', 1),
      ping('acc-a', 'On the access port of PC A: untagged, as PC A sent it.', { src: A.mac, dst: C.mac }, A.ip, C.ip, 64, 0x2201, 'request', 1),
    ],
    protocol: 'ICMP',
    info: `Echo (ping) request id=0x${PING_ID.toString(16)}, seq=1, ttl=64`,
    sources: [Q, { rfc: 792 }],
    details: {
      what: 'PC A pings PC C. Both are in VLAN 10 and in the same subnet, so the frame goes straight to PC C\'s MAC address, across the trunk.',
      why: 'Within one VLAN, switches simply forward. The IP header is untouched: TTL stays 64, because no router is involved.',
      typical: 'The packet is 84 octets of IP (56 octets of ping data, 8 of ICMP, 20 of IPv4). Ethernet adds 18 octets of header and FCS on the access port, and 4 more for the tag on the trunk. Tagged frames may be up to 1522 octets, so a full 1500-octet packet still fits.',
      keyFields: [{ layer: 'vlan', field: 'vid' }, { layer: 'ethernet', field: 'fcs' }, { layer: 'ipv4', field: 'ttl' }],
    },
  },
  {
    id: 'ping-b-d',
    from: 'pc-b',
    to: 'pc-d',
    path: ['pc-b', 'sw1', 'sw2', 'pc-d'],
    label: 'Ping B to D (native VLAN)',
    time: 2,
    category: 'v20',
    captures: [
      ping('acc-b', 'On the access port of PC B: untagged.', { src: B.mac, dst: D.mac }, B.ip, D.ip, 64, 0x6c01, 'request', 1),
      ping('trunk', 'On the trunk: still untagged, because VLAN 20 is the native VLAN of this trunk.', { src: B.mac, dst: D.mac }, B.ip, D.ip, 64, 0x6c01, 'request', 1),
    ],
    protocol: 'ICMP',
    info: `Echo (ping) request id=0x${PING_ID.toString(16)}, seq=1, ttl=64`,
    sources: [BRIDGE],
    details: {
      what: 'PC B pings PC D in VLAN 20. On this trunk VLAN 20 is configured as the native VLAN: its frames cross the trunk without a tag. The two captures are identical.',
      why: 'A trunk port can send one VLAN untagged, and puts untagged frames it receives into that VLAN. This lets devices that do not understand tags still work on a trunk.',
      wrong:
        'Both ends of a trunk must agree on the native VLAN, or frames silently leak from one VLAN into another. Untagged native traffic also enables VLAN hopping with double-tagged frames: an attacker in the native VLAN sends a frame with two tags, the first switch removes the outer one, and the next switch forwards the frame into the VLAN of the inner tag. Common practice: make an unused VLAN the native VLAN, or tag it too.',
      insight: 'The tag is the only thing that tells VLANs apart on a trunk. Without it, the receiving switch assumes the native VLAN.',
      keyFields: [{ layer: 'ethernet', field: 'type' }],
    },
  },
  {
    id: 'route-in',
    from: 'pc-a',
    to: 'router',
    path: ['pc-a', 'sw1', 'sw2', 'router'],
    label: 'Ping A to D, to the router',
    time: 4,
    category: 'routed',
    captures: [
      ping('r-trunk', 'On the trunk to the router: tagged with VLAN 10.', { src: A.mac, dst: ROUTER.mac, vlan: tagged(false) }, A.ip, D.ip, 64, 0x2202, 'request', 2),
      ping('acc-a', 'On the access port of PC A: untagged, to the gateway\'s MAC address.', { src: A.mac, dst: ROUTER.mac }, A.ip, D.ip, 64, 0x2202, 'request', 2),
    ],
    protocol: 'ICMP',
    info: `Echo (ping) request id=0x${PING_ID.toString(16)}, seq=2, ttl=64, ${A.ip} to ${D.ip}`,
    sources: [{ rfc: 1812, section: '5.2' }, Q],
    learned: [{ label: 'Router subinterfaces', value: `VLAN 10: ${ROUTER.ip10}/26, VLAN 20 (native): ${ROUTER.ip20}/26` }],
    details: {
      what: `PC A pings PC D in VLAN 20. PC D is in another subnet, so PC A sends the packet to its default gateway, ${ROUTER.ip10}: a router with one physical link to switch 2, configured as a trunk. The frame reaches the router tagged with VLAN 10, so the router knows it came in on its VLAN 10 subinterface.`,
      why: 'No frame can cross from one VLAN to another at layer 2. Traffic between VLANs must be routed, just like traffic between separate LANs.',
      typical: 'One physical port with a subinterface per VLAN is called a router on a stick. In larger networks a layer 3 switch routes between its VLANs internally instead.',
      keyFields: [{ layer: 'ethernet', field: 'dst' }, { layer: 'ipv4', field: 'dst' }, { layer: 'vlan', field: 'vid' }],
    },
  },
  {
    id: 'route-out',
    from: 'router',
    to: 'pc-d',
    path: ['router', 'sw2', 'pc-d'],
    label: 'Routed into VLAN 20',
    time: 4.1,
    category: 'routed',
    captures: [
      ping('r-trunk', 'On the trunk from the router: VLAN 20 is native, so the frame is untagged.', { src: ROUTER.mac, dst: D.mac }, A.ip, D.ip, 63, 0x2202, 'request', 2),
      ping('acc-d', 'On the access port of PC D.', { src: ROUTER.mac, dst: D.mac }, A.ip, D.ip, 63, 0x2202, 'request', 2),
    ],
    protocol: 'ICMP',
    info: `Echo (ping) request id=0x${PING_ID.toString(16)}, seq=2, ttl=63, ${A.ip} to ${D.ip}`,
    sources: [{ rfc: 1812, section: '5.3.1' }],
    details: {
      what: 'The router routes the packet out of its VLAN 20 subinterface: same physical port, new Ethernet header with its own MAC as source and PC D as destination, TTL decremented to 63. Because VLAN 20 is the native VLAN, the frame leaves untagged.',
      why: 'From the router\'s point of view the two subinterfaces are two separate interfaces in two subnets. That the frames share one cable is only visible in the tag.',
      typical: 'The router needed PC D\'s MAC address first; that ARP exchange in VLAN 20 is left out here. The reply takes the same way back: into the router untagged on VLAN 20, out tagged on VLAN 10.',
      insight: 'Every routed packet crosses the router\'s link twice, once in each VLAN. That single link can become a bottleneck, which is why larger networks route between VLANs in the switches.',
      keyFields: [{ layer: 'ipv4', field: 'ttl' }, { layer: 'ethernet', field: 'src' }],
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
  protocol: s.protocol,
  info: s.info,
  ...(s.learned ? { learned: s.learned } : {}),
});

export const vlanExchange: Exchange = {
  id: 'vlan',
  title: 'VLAN (802.1Q)',
  summary: 'Two VLANs on two switches: access ports, a tagged trunk, the native VLAN, and a router on a stick between the VLANs.',
  group: 'Link',
  scenario:
    'Two switches connected by a trunk serve VLAN 10 (PC A, PC C) and VLAN 20 (PC B, PC D). A router with one link to switch 2 routes between the VLANs. VLAN 20 is the native VLAN of the trunks.',
  intro:
    'A VLAN splits one physical switch network into separate broadcast domains. Access ports belong to one VLAN and carry untagged frames; trunk ports carry several VLANs and mark each frame with a 4-octet IEEE 802.1Q tag that names its VLAN. Frames never cross between VLANs at layer 2; for that, a router is needed.\n\nMost steps have two captures, on an access port and on a trunk: compare them to see the tag being added and removed.',
  sources: [
    { spec: 'IEEE 802.1Q-2022', note: 'Bridges and Bridged Networks: VLANs and the tag' },
    { spec: 'IEEE 802.3-2022', section: 'Clause 3', note: 'tagged frames up to 1522 octets' },
    { rfc: 5737, note: 'documentation addresses used here' },
  ],
  participants: [
    { id: 'pc-a', label: 'PC A', kind: 'host', addr: { mac: A.mac, ipv4: A.ip }, pos: { x: 0, y: 0 }, lifeline: true, note: 'VLAN 10' },
    { id: 'pc-b', label: 'PC B', kind: 'host', addr: { mac: B.mac, ipv4: B.ip }, pos: { x: 0, y: 1 }, lifeline: true, note: 'VLAN 20' },
    { id: 'sw1', label: 'Switch 1', kind: 'switch', pos: { x: 2, y: 0 }, lifeline: false },
    { id: 'sw2', label: 'Switch 2', kind: 'switch', pos: { x: 4, y: 0 }, lifeline: false },
    { id: 'pc-c', label: 'PC C', kind: 'host', addr: { mac: C.mac, ipv4: C.ip }, pos: { x: 6, y: 0 }, lifeline: true, note: 'VLAN 10' },
    { id: 'pc-d', label: 'PC D', kind: 'host', addr: { mac: D.mac, ipv4: D.ip }, pos: { x: 6, y: 1 }, lifeline: true, note: 'VLAN 20' },
    { id: 'router', label: 'Router', kind: 'router', addr: { mac: ROUTER.mac, ipv4: `${ROUTER.ip10}, ${ROUTER.ip20}` }, pos: { x: 4, y: 1 }, lifeline: true, note: 'Router on a stick: one link, a subinterface per VLAN' },
  ],
  links: [
    { id: 'acc-a', a: 'pc-a', b: 'sw1', label: 'Access 10' },
    { id: 'acc-b', a: 'pc-b', b: 'sw1', label: 'Access 20' },
    { id: 'trunk', a: 'sw1', b: 'sw2', label: 'Trunk' },
    { id: 'acc-c', a: 'sw2', b: 'pc-c', label: 'Access 10' },
    { id: 'acc-d', a: 'sw2', b: 'pc-d', label: 'Access 20' },
    { id: 'r-trunk', a: 'sw2', b: 'router', label: 'Router trunk' },
  ],
  categories: [
    { id: 'v10', label: 'VLAN 10', color: 'blue' },
    { id: 'v20', label: 'VLAN 20 (native)', color: 'green' },
    { id: 'routed', label: 'Routed between VLANs', color: 'purple' },
  ],
  steps: SPECS.map(build),
};
