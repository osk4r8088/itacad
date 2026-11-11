import type { LayerDef, LayerInstance, Source } from '../schema';
import { buildStruct, type Annotations } from '../lib/build';
import { parseMac } from '../lib/encode';

const D: Source = { spec: 'IEEE 802.1D-2004', section: 'Clause 9 (encoding of BPDUs)' };
const LLC: Source = { spec: 'IEEE 802.2', note: 'Logical Link Control' };

const STP_NOTE =
  'BPDUs are carried directly in Ethernet frames, never in IP: Spanning Tree runs between switches on one link and is part of the data link layer.';

export const llcDef: LayerDef = {
  id: 'llc',
  name: 'LLC header',
  short: 'LLC',
  osi: [2],
  tcpip: 'link',
  about:
    'Frames in the original IEEE 802.3 format carry a length instead of an EtherType, so the receiver needs another way to know what the payload is: the IEEE 802.2 Logical Link Control header. Its service access points (SAPs) play the role of the EtherType. Spanning Tree uses SAP 0x42. Today almost all traffic uses Ethernet II framing with an EtherType; BPDUs are one of the few kinds of frames that still use LLC.',
  fields: [
    { id: 'dsap', name: 'DSAP', bits: 8, about: 'Destination service access point: 0x42 for Spanning Tree.', source: LLC },
    { id: 'ssap', name: 'SSAP', bits: 8, about: 'Source service access point: 0x42 for Spanning Tree.', source: LLC },
    { id: 'control', name: 'Control', bits: 8, about: '0x03: an unnumbered information frame, the simplest LLC frame type, with no connection or acknowledgment.', source: LLC },
  ],
  sources: [LLC],
};

export const bpduDef: LayerDef = {
  id: 'stp-bpdu',
  name: 'Configuration BPDU',
  short: 'BPDU',
  osi: [2],
  tcpip: 'link',
  osiNote: STP_NOTE,
  about:
    'A Bridge Protocol Data Unit carries the information switches use to build a loop-free tree. Every switch states which bridge it believes is the root, how far it is from it, and who it is itself. A switch keeps the best information it hears on each port and sends its own BPDUs where it is the designated bridge. The root sends one every Hello Time; the others relay them.',
  fields: [
    { id: 'protocol', name: 'Protocol Identifier', bits: 16, about: 'Always 0x0000 (Spanning Tree).', source: D },
    { id: 'version', name: 'Protocol Version', bits: 8, about: '0 = classic STP (802.1D-1998), 2 = Rapid STP, 3 = Multiple STP.', source: D },
    { id: 'type', name: 'BPDU Type', bits: 8, about: '0x00 = Configuration BPDU, 0x80 = Topology Change Notification, 0x02 = Rapid STP BPDU.', source: D },
    {
      id: 'flags',
      name: 'Flags',
      bits: 8,
      about: 'In classic STP only two bits: Topology Change (lowest bit) and Topology Change Acknowledgment (highest bit). Rapid STP uses the bits in between for the port role, proposal, agreement, learning and forwarding.',
      source: D,
    },
    {
      id: 'rootId',
      name: 'Root Identifier',
      bits: 64,
      about:
        'The bridge the sender believes is the root: a 4-bit priority (in steps of 4096, default 32768), a 12-bit system ID extension (often the VLAN), and the bridge MAC address. The lowest identifier in the network wins the election.',
      source: D,
    },
    {
      id: 'rootPathCost',
      name: 'Root Path Cost',
      bits: 32,
      about: 'The sender\'s cost to reach the root: the sum of the port costs along the way. 0 from the root itself. The recommended cost of a 1 Gbit/s port is 20,000 (802.1D-2004); the older short values (4 for 1 Gbit/s) are still common.',
      source: D,
    },
    { id: 'bridgeId', name: 'Bridge Identifier', bits: 64, about: 'The sender itself, in the same format as the root identifier. Breaks ties between equal paths: the lower bridge wins.', source: D },
    {
      id: 'portId',
      name: 'Port Identifier',
      bits: 16,
      about: 'The sending port: a 4-bit priority (in steps of 16, default 128) and a 12-bit port number. Breaks the last tie, for example between two links to the same switch.',
      source: D,
    },
    {
      id: 'messageAge',
      name: 'Message Age',
      bits: 16,
      about: 'How old the root information is, in units of 1/256 second: 0 from the root, plus about a second for each switch that relays it. Information older than Max Age is discarded.',
      source: D,
    },
    { id: 'maxAge', name: 'Max Age', bits: 16, about: 'How long information is kept without being refreshed, in 1/256 s. Default 20 s. Set by the root for the whole network.', source: D },
    { id: 'helloTime', name: 'Hello Time', bits: 16, about: 'Interval between BPDUs from the root, in 1/256 s. Default 2 s.', source: D },
    { id: 'forwardDelay', name: 'Forward Delay', bits: 16, about: 'Time a classic STP port spends in each of the listening and learning states, in 1/256 s. Default 15 s.', source: D },
  ],
  sources: [{ spec: 'IEEE 802.1D-2004' }, { spec: 'IEEE 802.1Q-2022', note: 'Rapid and Multiple Spanning Tree today' }],
};

export const llc = (): LayerInstance =>
  buildStruct(llcDef, { dsap: { raw: 0x42, display: '0x42 (Spanning Tree)' }, ssap: { raw: 0x42, display: '0x42 (Spanning Tree)' }, control: { raw: 3, display: '0x03 (UI)' } }, {}, 'Spanning Tree, SAP 0x42');

export interface BridgeId {
  priority: number;
  mac: string;
  /** System ID extension, usually the VLAN; 0 for plain STP. */
  ext?: number;
}

export const bridgeIdText = (b: BridgeId) => `${b.priority}/${b.ext ?? 0}/${b.mac}`;

function bridgeIdBytes(b: BridgeId): Uint8Array {
  const pe = b.priority + (b.ext ?? 0);
  return Uint8Array.from([pe >> 8, pe & 0xff, ...parseMac(b.mac)]);
}

export interface BpduParams extends Annotations {
  root: BridgeId;
  rootPathCost: number;
  bridge: BridgeId;
  portPriority?: number;
  portNumber: number;
  /** Seconds. */
  messageAge: number;
  topologyChange?: boolean;
}

const time = (s: number) => ({ raw: Math.round(s * 256), display: `${s} s` });

/** A classic STP Configuration BPDU with default timers (Max Age 20 s, Hello 2 s, Forward Delay 15 s). */
export function bpdu(p: BpduParams): LayerInstance {
  const port = ((p.portPriority ?? 128) << 8) | p.portNumber;
  return buildStruct(
    bpduDef,
    {
      protocol: { raw: 0, display: '0x0000' },
      version: { raw: 0, display: '0 (STP)' },
      type: { raw: 0, display: '0x00 (Configuration)' },
      flags: { raw: p.topologyChange ? 1 : 0, display: p.topologyChange ? '0x01 (Topology Change)' : '0x00' },
      rootId: { raw: bridgeIdBytes(p.root), display: bridgeIdText(p.root) },
      rootPathCost: { raw: p.rootPathCost, display: p.rootPathCost.toLocaleString('en-US') },
      bridgeId: { raw: bridgeIdBytes(p.bridge), display: bridgeIdText(p.bridge) },
      portId: { raw: port, display: `0x${port.toString(16).padStart(4, '0')} (priority ${p.portPriority ?? 128}, port ${p.portNumber})` },
      messageAge: time(p.messageAge),
      maxAge: time(20),
      helloTime: time(2),
      forwardDelay: time(15),
    },
    p,
    `Root ${bridgeIdText(p.root)}, cost ${p.rootPathCost}, from ${bridgeIdText(p.bridge)}`,
  );
}

export const STP_MULTICAST = '01:80:c2:00:00:00';
