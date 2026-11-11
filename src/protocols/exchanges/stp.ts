import type { Capture, Exchange, Learned, Source, Step, StepDetails } from '../../shared/schema';
import { ethArp, ethLlc } from '../../shared/headers/stacks';
import { arp } from '../../shared/headers/arp';
import { bpdu, llc, STP_MULTICAST, type BpduParams, type BridgeId } from '../../shared/headers/stp';

// Three switches in a triangle. First without Spanning Tree (a broadcast storm), then with classic STP
// (IEEE 802.1D): election, a blocked port, and a link failure. MAC addresses RFC 9542, IPv4 RFC 5737.
// All links 1 Gbit/s, port cost 20,000 (802.1D-2004 recommendation).

const SW1: BridgeId = { priority: 32768, mac: '00:00:5e:00:53:11' };
const SW2: BridgeId = { priority: 32768, mac: '00:00:5e:00:53:12' };
const SW3: BridgeId = { priority: 32768, mac: '00:00:5e:00:53:13' };
const PC_A = { mac: '00:00:5e:00:53:0a', ip: '192.0.2.10' };
const PC_B = { mac: '00:00:5e:00:53:0b', ip: '192.0.2.20' };
const COST = 20000;

const D: Source = { spec: 'IEEE 802.1D-2004', section: 'Clause 17 (Rapid Spanning Tree Protocol)' };
const D_BPDU: Source = { spec: 'IEEE 802.1D-2004', section: 'Clause 9 (encoding of BPDUs)' };
const CLASSIC: Source = { spec: 'IEEE 802.1D-1998', note: 'classic STP: port states and timers, default Hello 2 s, Max Age 20 s, Forward Delay 15 s' };
const STORM: Source = { spec: 'IEEE 802.1D-2004', note: 'bridges must not create loops: the active topology is a tree' };

const SRC_NOTE = 'Switches send BPDUs from the MAC address of the sending port; the bridge address is shown here to keep the example readable.';

function bpduFrame(link: string, note: string, from: BridgeId, p: Omit<BpduParams, 'bridge'>): Capture {
  return ethLlc({ link, note, eth: { src: from.mac, dst: STP_MULTICAST, notes: { src: SRC_NOTE } }, llc: llc(), payload: bpdu({ ...p, bridge: from }) });
}

const broadcast = (link: string, note: string) =>
  ethArp({ link, note, eth: { src: PC_A.mac, dst: 'ff:ff:ff:ff:ff:ff' }, arp: arp({ oper: 'request', sha: PC_A.mac, spa: PC_A.ip, tha: '00:00:00:00:00:00', tpa: PC_B.ip }) });

const fact = (label: string, value: string): Learned => ({ label, value });

interface Spec {
  id: string;
  phase: string;
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
  lost?: boolean;
}

const arpInfo = `Who has ${PC_B.ip}? Tell ${PC_A.ip}`;
const bpduInfo = (root: BridgeId, cost: number, port: number) => `Conf. Root = 32768/0/${root.mac}  Cost = ${cost}  Port = 0x80${port.toString(16).padStart(2, '0')}`;

const SPECS: Spec[] = [
  // ---- 1 loop
  {
    id: 'storm-1',
    phase: 'loop',
    from: 'pc-a',
    to: 'sw2',
    path: ['pc-a', 'sw1', 'sw2'],
    extraPaths: [['pc-a', 'sw1', 'sw3']],
    label: 'Broadcast',
    time: 0,
    category: 'storm',
    captures: [broadcast('acc-a', 'As sent by PC A.')],
    protocol: 'ARP',
    info: arpInfo,
    sources: [{ rfc: 826 }, STORM],
    learned: [fact('SW1: PC A is at', 'port 3 (PC A)')],
    details: {
      what: 'The three switches are connected in a triangle, for redundancy, and Spanning Tree is off. PC A broadcasts an ARP request. Switch 1 floods it to all other ports: to switch 2 and to switch 3.',
      why: 'A switch must flood broadcasts to every port except the one they came in on. That is correct, until the ports lead back to each other.',
      keyFields: [{ layer: 'ethernet', field: 'dst' }],
    },
  },
  {
    id: 'storm-2',
    phase: 'loop',
    from: 'sw3',
    to: 'sw2',
    path: ['sw3', 'sw2'],
    label: 'Copy flooded on',
    time: 0.01,
    category: 'storm',
    captures: [broadcast('l23', 'On the link between switch 3 and switch 2: the same frame, unchanged.')],
    protocol: 'ARP',
    info: arpInfo,
    sources: [STORM],
    learned: [fact('SW2: PC A is at', 'port 2 (towards SW3), was port 1')],
    details: {
      what: 'Switch 3 floods its copy too, to switch 2. Switch 2 now receives PC A\'s broadcast twice, on two different ports, and each time it learns PC A\'s MAC address on the port the frame arrived on. Its MAC table entry for PC A jumps between ports.',
      why: 'MAC learning assumes every address is reachable through exactly one port. In a loop that assumption breaks: unicast frames to PC A may now go the wrong way.',
      keyFields: [{ layer: 'ethernet', field: 'src' }],
    },
  },
  {
    id: 'storm-3',
    phase: 'loop',
    from: 'sw2',
    to: 'sw1',
    path: ['sw2', 'sw1'],
    label: 'Back to the start',
    time: 0.02,
    category: 'storm',
    captures: [broadcast('l12', 'On the link from switch 2 back to switch 1.')],
    protocol: 'ARP',
    info: arpInfo,
    sources: [STORM],
    learned: [fact('SW1: PC A is at', 'port 1 (towards SW2), was port 3')],
    details: {
      what: 'Switch 2 floods the copy it got from switch 3 on to switch 1, which floods it again to switch 3 and to PC A. The frame circles the triangle in both directions, and every switch multiplies it.',
      why: 'Ethernet has no hop limit: unlike the IP TTL, nothing in the frame changes or runs out on the way. A looped broadcast circles until a link is cut, at full line rate.',
      insight: 'Within seconds the copies fill every link, the switches\' CPUs and every host that has to process the broadcasts: a broadcast storm. Spanning Tree exists to prevent exactly this, by keeping redundant links but switching some of their ports off.',
      wrong: 'Even switch 1 now believes PC A is behind switch 2. Frames for PC A go round the loop instead of to its port.',
      keyFields: [{ layer: 'ethernet', field: 'dst' }, { layer: 'ethernet', field: 'src' }],
    },
  },
  // ---- 2 election
  {
    id: 'bpdu-root',
    phase: 'election',
    from: 'sw1',
    to: 'sw2',
    path: ['sw1', 'sw2'],
    extraPaths: [['sw1', 'sw3']],
    label: 'BPDU: I am root',
    time: 60000,
    category: 'bpdu',
    captures: [
      bpduFrame('l12', 'On the link to switch 2.', SW1, { root: SW1, rootPathCost: 0, portNumber: 1, messageAge: 0 }),
      bpduFrame('l13', 'On the link to switch 3.', SW1, { root: SW1, rootPathCost: 0, portNumber: 2, messageAge: 0 }),
    ],
    protocol: 'STP',
    info: bpduInfo(SW1, 0, 1),
    sources: [D_BPDU, D],
    learned: [fact('Root bridge', `SW1 (${SW1.priority}/${SW1.mac})`)],
    details: {
      what: 'Now Spanning Tree is on. Every switch starts by claiming to be the root and sends Configuration BPDUs to the Spanning Tree multicast address 01:80:c2:00:00:00. Switch 1 has the lowest bridge identifier: all three have the default priority 32768, so the MAC address decides, and 00:00:5e:00:53:11 is the lowest.',
      why: 'The root bridge is the center of the tree: every other switch keeps the best path to it and blocks the rest. The election needs no configuration; everybody compares the same numbers and comes to the same result.',
      typical: 'Administrators set a lower priority on the switch that should be root, usually a core switch, instead of leaving the choice to the lowest MAC address.',
      insight: 'BPDUs use the old IEEE 802.3 frame format: a length (38) instead of an EtherType, and an LLC header with SAP 0x42. Switches never forward frames to 01:80:c2:00:00:00; they consume them.',
      keyFields: [{ layer: 'stp-bpdu', field: 'rootId' }, { layer: 'stp-bpdu', field: 'bridgeId' }, { layer: 'ethernet', field: 'dst' }, { layer: 'ethernet', field: 'type' }],
    },
  },
  {
    id: 'bpdu-sw2',
    phase: 'election',
    from: 'sw2',
    to: 'sw3',
    path: ['sw2', 'sw3'],
    label: 'BPDU from SW2',
    time: 61000,
    category: 'bpdu',
    captures: [bpduFrame('l23', 'On the link between switch 2 and switch 3.', SW2, { root: SW1, rootPathCost: COST, portNumber: 2, messageAge: 1 })],
    protocol: 'STP',
    info: bpduInfo(SW1, COST, 2),
    sources: [D, D_BPDU],
    learned: [fact('SW2 ports', 'p1 (to SW1): root port; p2 (to SW3): designated')],
    details: {
      what: 'Switch 2 has accepted switch 1 as root. Its port to switch 1 is its root port, the port with the best path to the root, at cost 20,000. On its other links it now passes the root\'s information on, with its own cost and its own bridge identifier.',
      why: 'Root Path Cost tells the neighbor how far the sender is from the root. A switch adds the cost of the port it received the BPDU on to get its own distance.',
      typical: 'Message Age is 1 second: one switch has relayed the information. If it grows beyond Max Age (20 s), the information is dropped.',
      keyFields: [{ layer: 'stp-bpdu', field: 'rootPathCost' }, { layer: 'stp-bpdu', field: 'bridgeId' }, { layer: 'stp-bpdu', field: 'messageAge' }],
    },
  },
  {
    id: 'bpdu-sw3',
    phase: 'election',
    from: 'sw3',
    to: 'sw2',
    path: ['sw3', 'sw2'],
    label: 'BPDU from SW3',
    time: 61000.1,
    category: 'bpdu',
    captures: [bpduFrame('l23', 'On the link between switch 3 and switch 2.', SW3, { root: SW1, rootPathCost: COST, portNumber: 2, messageAge: 1 })],
    protocol: 'STP',
    info: bpduInfo(SW1, COST, 2),
    sources: [D],
    learned: [fact('SW3 ports', 'p1 (to SW1): root port; p2 (to SW2): blocking')],
    details: {
      what: 'Switch 3 sends the same kind of BPDU to switch 2: root switch 1, cost 20,000. Both sides of the link between switch 2 and switch 3 are equally far from the root, so the next field decides: the bridge identifier. Switch 2 is lower, so its port is the designated port for this link. Switch 3\'s port is neither its root port nor designated: it blocks.',
      why: 'Every link gets exactly one designated port, the one closest to the root, which forwards traffic onto it. Ports that are neither root nor designated stop forwarding. Here that cuts the triangle into a tree: the loop is gone.',
      typical: 'The blocked port still receives BPDUs, so it notices when it is needed. It sends none, and it neither learns addresses nor forwards frames.',
      insight: 'The comparison order is fixed: root identifier, root path cost, sender bridge identifier, sender port identifier. The first difference decides.',
      keyFields: [{ layer: 'stp-bpdu', field: 'bridgeId' }, { layer: 'stp-bpdu', field: 'rootPathCost' }],
    },
  },
  // ---- 3 stable
  {
    id: 'tree-broadcast',
    phase: 'stable',
    from: 'pc-a',
    to: 'sw2',
    path: ['pc-a', 'sw1', 'sw2'],
    extraPaths: [['pc-a', 'sw1', 'sw3']],
    label: 'Broadcast',
    time: 120000,
    category: 'data',
    captures: [broadcast('acc-a', 'As sent by PC A.')],
    protocol: 'ARP',
    info: arpInfo,
    sources: [D],
    details: {
      what: 'PC A broadcasts again. Switch 1 floods it to switch 2 and switch 3, as before.',
      why: 'Spanning Tree changes nothing for the hosts and nothing about flooding: it only decides which switch ports take part.',
      keyFields: [{ layer: 'ethernet', field: 'dst' }],
    },
  },
  {
    id: 'tree-blocked',
    phase: 'stable',
    from: 'sw2',
    to: 'sw3',
    path: ['sw2', 'sw3'],
    label: 'Dropped at blocked port',
    time: 120000.1,
    category: 'blocked',
    lost: true,
    captures: [broadcast('l23', 'On the link from switch 2 to switch 3, before switch 3\'s blocked port.')],
    protocol: 'ARP',
    info: `${arpInfo}, dropped by the blocked port`,
    sources: [D],
    details: {
      what: 'Switch 2 floods its copy towards switch 3, but switch 3\'s port on this link is blocking and drops it. Switch 3 already has its copy, directly from switch 1. Every host gets the broadcast exactly once.',
      why: 'The link is not shut down; only one of its ports discards data frames. It stays ready to take over.',
      keyFields: [{ layer: 'ethernet', field: 'dst' }],
    },
  },
  // ---- 4 failure
  {
    id: 'failure-bpdu',
    phase: 'failure',
    from: 'sw2',
    to: 'sw3',
    path: ['sw2', 'sw3'],
    label: 'BPDU, link SW1-SW3 down',
    time: 180000,
    category: 'bpdu',
    captures: [bpduFrame('l23', 'On the link between switch 2 and switch 3.', SW2, { root: SW1, rootPathCost: COST, portNumber: 2, messageAge: 1 })],
    protocol: 'STP',
    info: bpduInfo(SW1, COST, 2),
    sources: [CLASSIC, D],
    learned: [fact('SW3 ports', 'p1 (to SW1): down; p2 (to SW2): root port, listening')],
    details: {
      what: 'The link between switch 1 and switch 3 fails. Switch 3 loses its root port. Its blocked port still hears switch 2\'s BPDUs: the root is reachable through switch 2 at cost 20,000 + 20,000. That port becomes the new root port.',
      why: 'The redundant link was kept for exactly this case. But classic STP does not trust the new topology at once: a port first spends Forward Delay (15 s) listening, then 15 s learning addresses, before it forwards.',
      typical: 'Here switch 3 noticed the failure immediately, because its own link went down: 30 seconds until forwarding. If a failure is only noticed by missing BPDUs, Max Age (20 s) passes first: up to 50 seconds without connectivity.',
      wrong: 'Switch 3 also reports the change towards the root with a Topology Change Notification BPDU; the root then sets the Topology Change flag, and all switches age out their MAC tables quickly, because addresses may now be behind different ports. Those messages are left out here.',
      keyFields: [{ layer: 'stp-bpdu', field: 'rootPathCost' }, { layer: 'stp-bpdu', field: 'forwardDelay' }, { layer: 'stp-bpdu', field: 'maxAge' }],
    },
  },
  {
    id: 'failure-forward',
    phase: 'failure',
    from: 'pc-a',
    to: 'sw3',
    path: ['pc-a', 'sw1', 'sw2', 'sw3'],
    label: 'Broadcast reaches SW3 again',
    time: 210000,
    category: 'data',
    captures: [broadcast('l23', 'On the link from switch 2 to switch 3, now forwarding.')],
    protocol: 'ARP',
    info: arpInfo,
    sources: [D],
    learned: [fact('SW3 ports', 'p1 (to SW1): down; p2 (to SW2): root port, forwarding')],
    details: {
      what: 'Thirty seconds after the failure, switch 3\'s new root port forwards. PC A\'s broadcast reaches switch 3 the long way round, through switch 2.',
      why: 'The tree has been rebuilt without the failed link, and it is still loop-free.',
      insight:
        'Rapid Spanning Tree (802.1w, today part of 802.1D-2004 and 802.1Q) removes most of this waiting. Switch 3 already knows its blocked port as an alternate port, a ready-made replacement for the root port, and switches to it at once; designated ports agree with their neighbor through a proposal and agreement handshake instead of timers. Recovery takes well under a second. RSTP sends BPDUs with version 2 and uses the flag bits for port roles; it is the default on modern switches.',
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
  ...(s.lost ? { lost: true } : {}),
});

export const stpExchange: Exchange = {
  id: 'stp',
  title: 'Spanning Tree',
  summary: 'Three switches in a triangle: a broadcast storm without STP, the root election, a blocked port, and recovery after a link failure.',
  group: 'Link',
  scenario:
    'Three switches are connected in a triangle of 1 Gbit/s links for redundancy. Without Spanning Tree a single broadcast circles forever. With it, the switches elect a root, block one port, and unblock it when a link fails.',
  intro:
    'Redundant links between switches create loops, and Ethernet has nothing like a TTL to stop a looping frame. The Spanning Tree Protocol lets switches agree on a loop-free tree: they elect a root bridge, every switch keeps its best path to the root, and ports that would close a loop are blocked. When a link fails, a blocked port takes over.\n\nThis exchange uses classic STP to show the timers; the last step explains how Rapid STP shortens recovery.',
  sources: [
    { spec: 'IEEE 802.1D-1998', note: 'classic Spanning Tree' },
    { spec: 'IEEE 802.1D-2004', note: 'Rapid Spanning Tree, BPDU encoding, port costs' },
    { spec: 'IEEE 802.1Q-2022', note: 'RSTP and MSTP in current switches' },
    { spec: 'IEEE 802.2', note: 'LLC header' },
  ],
  participants: [
    { id: 'pc-a', label: 'PC A', kind: 'host', addr: { mac: PC_A.mac, ipv4: PC_A.ip }, pos: { x: 0, y: 0 }, lifeline: true },
    { id: 'sw1', label: 'Switch 1', kind: 'switch', addr: { mac: SW1.mac }, pos: { x: 2, y: 0 }, lifeline: true, note: 'Bridge ID 32768/00:00:5e:00:53:11' },
    { id: 'sw2', label: 'Switch 2', kind: 'switch', addr: { mac: SW2.mac }, pos: { x: 6, y: 0 }, lifeline: true, note: 'Bridge ID 32768/00:00:5e:00:53:12; PC B on port 3' },
    { id: 'sw3', label: 'Switch 3', kind: 'switch', addr: { mac: SW3.mac }, pos: { x: 4, y: 1 }, lifeline: true, note: 'Bridge ID 32768/00:00:5e:00:53:13' },
  ],
  links: [
    { id: 'acc-a', a: 'pc-a', b: 'sw1', label: 'Port 3' },
    { id: 'l12', a: 'sw1', b: 'sw2', label: 'SW1-SW2' },
    { id: 'l13', a: 'sw1', b: 'sw3', label: 'SW1-SW3' },
    { id: 'l23', a: 'sw2', b: 'sw3', label: 'SW2-SW3' },
  ],
  categories: [
    { id: 'storm', label: 'Looping frames', color: 'red' },
    { id: 'bpdu', label: 'BPDUs', color: 'blue' },
    { id: 'data', label: 'Data on the tree', color: 'green' },
    { id: 'blocked', label: 'Dropped at a blocked port', color: 'gray' },
  ],
  phases: [
    { id: 'loop', label: 'Without STP', about: 'A broadcast circles the triangle and MAC tables flap.' },
    { id: 'election', label: 'Election', about: 'BPDUs elect the root and decide each port\'s role.' },
    { id: 'stable', label: 'Loop-free', about: 'One blocked port turns the triangle into a tree.' },
    { id: 'failure', label: 'Link failure', about: 'The blocked port takes over after the STP timers.' },
  ],
  steps: SPECS.map(build),
};
