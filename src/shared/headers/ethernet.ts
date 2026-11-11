import type { LayerDef, LayerInstance, Source } from '../schema';
import { buildStruct, type Annotations } from '../lib/build';
import { concat, crc32, hexBytes, parseMac } from '../lib/encode';

const IEEE8023: Source = { spec: 'IEEE 802.3-2022', section: 'Clause 3 (MAC frame and packet format)' };

export const physicalDef: LayerDef = {
  id: 'phy',
  name: 'Preamble and SFD',
  short: 'Preamble',
  osi: [1],
  tcpip: 'link',
  osiNote:
    'IEEE 802.3 counts preamble and SFD as part of the "packet" that wraps the MAC frame. They are shown at layer 1 here because they only exist so the receiver can lock onto the bit stream: they are not part of the MAC frame, not covered by the FCS and not shown in most packet captures. Faster PHYs encode them with their own line codes.',
  about:
    'Before every frame the sender transmits a preamble and a Start Frame Delimiter. The alternating bit pattern lets the receiver synchronize its clock to the incoming signal; the SFD marks where the frame begins. Layer 1 itself has no header with addresses: it is about bits, signals and timing on the medium (copper, fiber, radio). After each frame the sender also keeps an interpacket gap of at least 96 bit times, which is not shown.',
  fields: [
    {
      id: 'preamble',
      name: 'Preamble',
      bits: 56,
      about:
        'Seven octets of alternating ones and zeros. Each octet is 0x55; Ethernet sends the least significant bit of each octet first, so on the wire the pattern is 10101010.',
      source: { spec: 'IEEE 802.3-2022', section: '3.2.1' },
    },
    {
      id: 'sfd',
      name: 'SFD',
      short: 'SFD',
      bits: 8,
      about:
        'Start Frame Delimiter, 0xD5, on the wire 10101011. The two ones at the end break the alternating pattern and tell the receiver that the destination address follows.',
      source: { spec: 'IEEE 802.3-2022', section: '3.2.2' },
    },
  ],
  sources: [IEEE8023],
};

export function physical(): LayerInstance {
  return buildStruct(
    physicalDef,
    {
      preamble: { raw: new Uint8Array(7).fill(0x55), display: '55 55 55 55 55 55 55' },
      sfd: { raw: 0xd5, display: '0xd5' },
    },
    {},
    '8 octets for synchronization',
  );
}

export const ethernetDef: LayerDef = {
  id: 'ethernet',
  name: 'Ethernet II frame',
  short: 'Ethernet',
  osi: [2],
  tcpip: 'link',
  about:
    'Ethernet delivers a frame from one interface to another interface on the same link, identified by 48-bit MAC addresses. It never crosses a router: every router removes the frame and builds a new one for the next link, with new MAC addresses, while the IP packet inside stays the same (apart from TTL and checksum). The payload must be 46 to 1500 octets; shorter payloads are padded so the frame is at least 64 octets from destination address to FCS. The frame used for IP is called Ethernet II or DIX framing; RFC 894 defines how IPv4 is carried in it.',
  fields: [
    {
      id: 'dst',
      name: 'Destination Address',
      bits: 48,
      about:
        'MAC address of the next interface on this link, not of the final destination. For a host on another network this is the MAC address of the default gateway, learned with ARP (IPv4) or Neighbor Discovery (IPv6). The address ff:ff:ff:ff:ff:ff is the broadcast address: every interface on the link accepts the frame, and switches forward it on all ports. Addresses starting with 33:33 are IPv6 multicast groups.',
      source: { spec: 'IEEE 802.3-2022', section: '3.2.4' },
    },
    {
      id: 'src',
      name: 'Source Address',
      bits: 48,
      about: 'MAC address of the interface that sends the frame on this link.',
      source: { spec: 'IEEE 802.3-2022', section: '3.2.5' },
    },
    {
      id: 'type',
      name: 'EtherType',
      bits: 16,
      about:
        'Says which protocol the payload carries. IEEE 802.3 calls this field Length/Type: values of 0x0600 and above are a type, smaller values are a length (used by other framings). 0x0800 is IPv4, 0x86DD is IPv6, 0x0806 is ARP.',
      source: { spec: 'IEEE 802.3-2022', section: '3.2.6' },
    },
  ],
  trailer: [
    {
      id: 'pad',
      name: 'Pad',
      bits: 'variable',
      about: 'Zero octets added when the payload is shorter than 46 octets, so the frame reaches the minimum size of 64 octets.',
      source: { spec: 'IEEE 802.3-2022', section: '3.2.8' },
    },
    {
      id: 'fcs',
      name: 'Frame Check Sequence',
      short: 'FCS',
      bits: 32,
      about:
        'CRC-32 over destination address, source address, EtherType, payload and pad. The receiver recomputes it and silently drops frames that do not match; Ethernet does not retransmit, that is left to higher layers such as TCP. Shown here as the four octets in the order they are sent. Most captures do not show the FCS because the network card removes it.',
      source: { spec: 'IEEE 802.3-2022', section: '3.2.9' },
    },
  ],
  sources: [IEEE8023, { rfc: 894 }],
};

export const ETHERTYPES: Record<number, string> = { 0x0800: 'IPv4', 0x0806: 'ARP', 0x86dd: 'IPv6', 0x8100: 'VLAN tag, IEEE 802.1Q' };

export interface EthernetParams extends Annotations {
  dst: string;
  src: string;
  type: number;
  /** Payload octets below which the frame is padded. 46 normally; a switch that inserts a VLAN tag may keep the original padding (50). */
  minPayload?: number;
}

export function ethernet(p: EthernetParams, payload: Uint8Array): LayerInstance {
  const padLen = Math.max(0, (p.minPayload ?? 46) - payload.length);
  const pad = new Uint8Array(padLen);
  const header = concat(parseMac(p.dst), parseMac(p.src), Uint8Array.of(p.type >> 8, p.type & 0xff));
  const crc = crc32(concat(header, payload, pad));
  // The CRC is sent least significant octet first (the bit order of the CRC register matches LSB-first transmission).
  const fcs = Uint8Array.of(crc & 0xff, (crc >>> 8) & 0xff, (crc >>> 16) & 0xff, crc >>> 24);
  return buildStruct(
    ethernetDef,
    {
      dst: { raw: parseMac(p.dst), display: /^ff([:-]ff){5}$/i.test(p.dst) ? `${p.dst} (broadcast)` : parseMac(p.dst)[0] & 1 ? `${p.dst} (multicast)` : p.dst },
      src: { raw: parseMac(p.src), display: p.src },
      type: { raw: p.type, display: `0x${p.type.toString(16).padStart(4, '0')} (${p.type < 0x0600 ? 'a length: IEEE 802.3 frame with LLC header' : (ETHERTYPES[p.type] ?? 'unknown')})` },
      pad: { raw: pad, display: padLen ? `${padLen} zero octets` : 'none (payload is at least 46 octets)' },
      fcs: { raw: fcs, display: hexBytes(fcs) },
    },
    p,
    `${p.src} to ${p.dst}`,
  );
}
