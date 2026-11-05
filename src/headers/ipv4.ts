import type { LayerDef, LayerInstance } from '../schema';
import { buildStruct, type Annotations } from '../lib/build';
import { hex, internetChecksum, parseIpv4 } from '../lib/encode';

export const ipv4Def: LayerDef = {
  id: 'ipv4',
  name: 'IPv4 header',
  short: 'IPv4',
  osi: [3],
  tcpip: 'internet',
  about:
    'IP moves a packet from the source host to the destination host across any number of networks. Routers look at the destination address, choose the next hop and forward the packet; on the way only TTL and header checksum change (unless NAT is involved). IP is best effort: packets can be lost, duplicated or reordered, and IP itself does not notice. Reliability is the job of the transport layer.',
  fields: [
    { id: 'version', name: 'Version', bits: 4, about: 'Always 4 for IPv4.', source: { rfc: 791, section: '3.1' } },
    {
      id: 'ihl',
      name: 'IHL',
      short: 'IHL',
      bits: 4,
      about:
        'Internet Header Length in 32-bit words. The minimum is 5 (20 octets) when there are no options, which is the normal case today. Without this field the receiver could not find where the payload starts.',
      source: { rfc: 791, section: '3.1' },
    },
    {
      id: 'dscp',
      name: 'DSCP',
      bits: 6,
      about:
        'Differentiated Services Code Point: a traffic class for queueing and prioritization inside a network. RFC 791 originally called the whole octet "Type of Service"; RFC 2474 redefined the upper 6 bits as DSCP. 0 means default forwarding.',
      source: { rfc: 2474, section: '3' },
    },
    {
      id: 'ecn',
      name: 'ECN',
      bits: 2,
      about:
        'Explicit Congestion Notification. 00 means the transport does not use ECN for this packet (Not-ECT). With ECN, a congested router can mark the packet (11, CE) instead of dropping it.',
      source: { rfc: 3168, section: '5' },
    },
    {
      id: 'totalLength',
      name: 'Total Length',
      bits: 16,
      about: 'Length of the whole packet, header plus data, in octets. Maximum 65535.',
      source: { rfc: 791, section: '3.1' },
    },
    {
      id: 'id',
      name: 'Identification',
      bits: 16,
      about:
        'Lets the receiver put fragments of the same packet back together. RFC 6864 clarifies that for packets that cannot be fragmented (DF set) the value has no meaning and senders may choose it freely.',
      source: { rfc: 6864, section: '4' },
    },
    {
      id: 'reserved',
      name: 'Reserved',
      short: 'R',
      bits: 1,
      about: 'First flag bit, reserved, must be zero.',
      source: { rfc: 791, section: '3.1' },
    },
    {
      id: 'df',
      name: "DF (Don't Fragment)",
      short: 'DF',
      bits: 1,
      about:
        'When set, routers must not fragment the packet. If it is too big for the next link they drop it and send an ICMP "Fragmentation Needed" message back. Modern hosts set DF and use this for Path MTU Discovery (RFC 1191).',
      source: { rfc: 791, section: '3.1' },
    },
    {
      id: 'mf',
      name: 'MF (More Fragments)',
      short: 'MF',
      bits: 1,
      about: 'Set on every fragment except the last one. 0 for an unfragmented packet.',
      source: { rfc: 791, section: '3.1' },
    },
    {
      id: 'fragOffset',
      name: 'Fragment Offset',
      bits: 13,
      about: 'Position of this fragment in the original packet, in units of 8 octets. 0 for an unfragmented packet.',
      source: { rfc: 791, section: '3.1' },
    },
    {
      id: 'ttl',
      name: 'Time to Live',
      short: 'TTL',
      bits: 8,
      about:
        'Every router decrements TTL by one and drops the packet when it reaches zero, sending ICMP "Time Exceeded" back. This stops packets from circling forever in a routing loop. Common initial values are 64 (Linux, macOS) and 128 (Windows).',
      source: { rfc: 1812, section: '5.3.1' },
    },
    {
      id: 'protocol',
      name: 'Protocol',
      bits: 8,
      about: 'Which protocol the payload carries, from the IANA "Protocol Numbers" registry: 1 ICMP, 6 TCP, 17 UDP.',
      source: { rfc: 791, section: '3.1' },
    },
    {
      id: 'checksum',
      name: 'Header Checksum',
      bits: 16,
      about:
        'Internet checksum over the header only, not the data. Because every router changes TTL, every router has to update the checksum too. The value shown is computed from the other fields of this example.',
      source: { rfc: 791, section: '3.1' },
    },
    { id: 'src', name: 'Source Address', bits: 32, about: 'Address of the sending host.', source: { rfc: 791, section: '3.1' } },
    {
      id: 'dst',
      name: 'Destination Address',
      bits: 32,
      about: 'Address of the final destination host. Unlike the Ethernet addresses, it stays the same on every link (without NAT).',
      source: { rfc: 791, section: '3.1' },
    },
    {
      id: 'options',
      name: 'Options',
      bits: 'variable',
      about: 'Rarely used today, and many routers handle packets with options on a slow path. Empty in this example.',
      source: { rfc: 791, section: '3.1' },
    },
  ],
  sources: [{ rfc: 791 }, { rfc: 2474 }, { rfc: 3168 }, { rfc: 6864 }, { rfc: 1812 }, { rfc: 1071 }],
};

const PROTOCOLS: Record<number, string> = { 1: 'ICMP', 6: 'TCP', 17: 'UDP' };

export interface Ipv4Params extends Annotations {
  src: string;
  dst: string;
  ttl: number;
  id: number;
  protocol: number;
  df?: boolean;
  dscp?: number;
  ecn?: number;
}

export function ipv4(p: Ipv4Params, payload: Uint8Array): LayerInstance {
  const totalLength = 20 + payload.length;
  const df = p.df ?? true;
  const fields = (checksum: number) => ({
    version: { raw: 4, display: '4' },
    ihl: { raw: 5, display: '5 (20 octets)' },
    dscp: { raw: p.dscp ?? 0, display: String(p.dscp ?? 0) },
    ecn: { raw: p.ecn ?? 0, display: (p.ecn ?? 0) === 0 ? '00 (Not-ECT)' : (p.ecn ?? 0).toString(2).padStart(2, '0') },
    totalLength: { raw: totalLength, display: `${totalLength}` },
    id: { raw: p.id, display: `${hex(p.id, 4)} (${p.id})` },
    reserved: { raw: 0, display: '0' },
    df: { raw: df ? 1 : 0, display: df ? '1' : '0' },
    mf: { raw: 0, display: '0' },
    fragOffset: { raw: 0, display: '0' },
    ttl: { raw: p.ttl, display: String(p.ttl) },
    protocol: { raw: p.protocol, display: `${p.protocol} (${PROTOCOLS[p.protocol] ?? 'unknown'})` },
    checksum: { raw: checksum, display: hex(checksum, 4) },
    src: { raw: parseIpv4(p.src), display: p.src },
    dst: { raw: parseIpv4(p.dst), display: p.dst },
    options: { raw: new Uint8Array(0), display: 'none' },
  });
  const draft = buildStruct(ipv4Def, fields(0));
  const checksum = internetChecksum(draft.bytes);
  return buildStruct(ipv4Def, fields(checksum), p, `${p.src} to ${p.dst}, TTL ${p.ttl}`);
}
