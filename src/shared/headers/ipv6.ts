import type { LayerDef, LayerInstance } from '../schema';
import { buildStruct, type Annotations } from '../lib/build';
import { parseIpv6, formatIpv6 } from '../lib/ipv6';

const R = (section: string) => ({ rfc: 8200, section });

export const ipv6Def: LayerDef = {
  id: 'ipv6',
  name: 'IPv6 header',
  short: 'IPv6',
  osi: [3],
  tcpip: 'internet',
  about:
    'IPv6 does the same job as IPv4, moving a packet from source to destination across networks, with 128-bit addresses and a simpler fixed header of 40 octets. There is no header checksum (the link layer and the transport checksums cover errors) and routers never fragment: a packet too big for the next link is dropped and reported with ICMPv6 Packet Too Big. Optional information goes into extension headers, chained through Next Header.',
  fields: [
    { id: 'version', name: 'Version', bits: 4, about: 'Always 6.', source: R('3') },
    {
      id: 'trafficClass',
      name: 'Traffic Class',
      bits: 8,
      about: 'The same as the IPv4 octet that holds DSCP (6 bits) and ECN (2 bits). 0 here: default forwarding, no ECN.',
      source: R('7'),
    },
    {
      id: 'flowLabel',
      name: 'Flow Label',
      bits: 20,
      about:
        'Marks packets of one flow, so routers and load balancers can keep them on the same path without looking at transport headers. Hosts that set it choose a pseudo-random value per flow (RFC 6437); 0 means unlabeled.',
      source: { rfc: 6437, section: '3' },
    },
    {
      id: 'payloadLength',
      name: 'Payload Length',
      bits: 16,
      about: 'Length of everything after this 40-octet header, in octets. Unlike IPv4 Total Length, the fixed header itself is not counted.',
      source: R('3'),
    },
    {
      id: 'nextHeader',
      name: 'Next Header',
      bits: 8,
      about: 'Type of the header that follows, from the same registry as the IPv4 Protocol field: 6 TCP, 17 UDP, 58 ICMPv6, or an extension header.',
      source: R('3'),
    },
    {
      id: 'hopLimit',
      name: 'Hop Limit',
      bits: 8,
      about:
        'IPv4\'s TTL under an honest name: every router decrements it and drops the packet at zero. Neighbor Discovery messages are sent with 255 and must arrive with 255, which proves they did not cross a router.',
      source: R('3'),
    },
    { id: 'src', name: 'Source Address', bits: 128, about: 'Address of the sender. The unspecified address :: is used before a host has any address of its own.', source: R('3') },
    {
      id: 'dst',
      name: 'Destination Address',
      bits: 128,
      about: 'Address of the receiver, or of a group: addresses starting with ff are multicast. IPv6 has no broadcast; multicast groups such as all-nodes (ff02::1) take its place.',
      source: R('3'),
    },
  ],
  sources: [{ rfc: 8200 }, { rfc: 4291 }, { rfc: 6437 }],
};

const NEXT_HEADERS: Record<number, string> = { 6: 'TCP', 17: 'UDP', 58: 'ICMPv6' };

export interface Ipv6Params extends Annotations {
  src: string;
  dst: string;
  hopLimit: number;
  nextHeader: number;
  flowLabel?: number;
}

export function ipv6(p: Ipv6Params, payload: Uint8Array): LayerInstance {
  const src = parseIpv6(p.src);
  const dst = parseIpv6(p.dst);
  const flow = p.flowLabel ?? 0;
  return buildStruct(
    ipv6Def,
    {
      version: { raw: 6, display: '6' },
      trafficClass: { raw: 0, display: '0' },
      flowLabel: { raw: flow, display: flow ? `0x${flow.toString(16).padStart(5, '0')}` : '0 (unlabeled)' },
      payloadLength: { raw: payload.length, display: String(payload.length) },
      nextHeader: { raw: p.nextHeader, display: `${p.nextHeader} (${NEXT_HEADERS[p.nextHeader] ?? 'unknown'})` },
      hopLimit: { raw: p.hopLimit, display: String(p.hopLimit) },
      src: { raw: src, display: formatIpv6(src) },
      dst: { raw: dst, display: formatIpv6(dst) },
    },
    p,
    `${formatIpv6(src)} to ${formatIpv6(dst)}, hop limit ${p.hopLimit}`,
  );
}
