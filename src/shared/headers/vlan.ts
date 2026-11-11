import type { LayerDef, LayerInstance, Source } from '../schema';
import { buildStruct, type Annotations } from '../lib/build';
import { ETHERTYPES } from './ethernet';

const TAG: Source = { spec: 'IEEE 802.1Q-2022', section: 'Clause 9 (tagged frame format)' };

export const vlanDef: LayerDef = {
  id: 'vlan',
  name: 'IEEE 802.1Q tag',
  short: '802.1Q',
  osi: [2],
  tcpip: 'link',
  about:
    'The VLAN tag sits between the source address and the EtherType of an Ethernet frame. Its first two octets are the Tag Protocol Identifier 0x8100, which takes the place of the EtherType: that is how a receiver knows a tag follows. Then come two octets of Tag Control Information (priority, drop eligibility, VLAN ID) and the original EtherType. Switches add the tag on trunk links, which carry several VLANs, and remove it on access ports, so hosts normally never see it. The frame becomes 4 octets longer, and the FCS has to be recomputed.',
  fields: [
    {
      id: 'pcp',
      name: 'Priority Code Point',
      short: 'PCP',
      bits: 3,
      about: 'Priority class 0 to 7 for queueing in switches. 0 is best effort, the default; voice is often 5.',
      source: TAG,
    },
    {
      id: 'dei',
      name: 'Drop Eligible Indicator',
      short: 'DEI',
      bits: 1,
      about: 'Set: this frame may be dropped first under congestion. 0 here.',
      source: TAG,
    },
    {
      id: 'vid',
      name: 'VLAN Identifier',
      short: 'VID',
      bits: 12,
      about: 'Which VLAN the frame belongs to, 1 to 4094. 0 means "no VLAN, priority only"; 4095 is reserved. VLAN 1 is the default VLAN of most switches.',
      source: TAG,
    },
    {
      id: 'type',
      name: 'EtherType',
      bits: 16,
      about: 'The EtherType of the payload, moved behind the tag: 0x0800 for IPv4, 0x0806 for ARP.',
      source: TAG,
    },
  ],
  sources: [{ spec: 'IEEE 802.1Q-2022', note: 'Bridges and Bridged Networks' }],
};

export interface VlanTag {
  vid: number;
  pcp?: number;
  dei?: boolean;
}

export const vlanDisplay = (pcp: number, dei: number, vid: number, type: number) => ({
  pcp: pcp === 0 ? '0 (best effort)' : String(pcp),
  dei: String(dei),
  vid: String(vid),
  type: `0x${type.toString(16).padStart(4, '0')} (${ETHERTYPES[type] ?? 'unknown'})`,
});

export const vlanSummary = (vid: number, pcp: number) => `VLAN ${vid}${pcp ? `, priority ${pcp}` : ''}`;

export function vlan(tag: VlanTag & Annotations, type: number): LayerInstance {
  const pcp = tag.pcp ?? 0;
  const dei = tag.dei ? 1 : 0;
  if (tag.vid < 1 || tag.vid > 4094) throw new Error(`bad VLAN ID ${tag.vid}`);
  const d = vlanDisplay(pcp, dei, tag.vid, type);
  return buildStruct(
    vlanDef,
    { pcp: { raw: pcp, display: d.pcp }, dei: { raw: dei, display: d.dei }, vid: { raw: tag.vid, display: d.vid }, type: { raw: type, display: d.type } },
    tag,
    vlanSummary(tag.vid, pcp),
  );
}
