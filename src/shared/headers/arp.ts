import type { LayerDef, LayerInstance, Source } from '../schema';
import { buildStruct, type Annotations } from '../lib/build';
import { parseIpv4, parseMac } from '../lib/encode';

const RFC826: Source = { rfc: 826 };

export const arpDef: LayerDef = {
  id: 'arp',
  name: 'ARP packet',
  short: 'ARP',
  osi: [2],
  tcpip: 'link',
  osiNote:
    'ARP is often called "layer 2.5": it carries IP addresses, but it is never routed and travels directly inside an Ethernet frame (EtherType 0x0806), not inside IP. RFC 1122 treats it as part of the link layer. It is shown at OSI layer 2 here, next to the Ethernet header.',
  about:
    'The Address Resolution Protocol finds the MAC address that belongs to an IPv4 address on the local link. A host that wants to send to an IP address on its own network (or to its default gateway) broadcasts "who has this IP address?"; the owner answers with its MAC address. Results are cached for a while, so ARP runs only now and then. ARP has no authentication: any host can answer, which is the basis of ARP spoofing. IPv6 replaced ARP with Neighbor Discovery (RFC 4861), which uses ICMPv6.',
  fields: [
    { id: 'htype', name: 'Hardware Type', short: 'HTYPE', bits: 16, about: 'Type of link layer: 1 = Ethernet. RFC 826 calls the field ar$hrd.', source: RFC826 },
    {
      id: 'ptype',
      name: 'Protocol Type',
      short: 'PTYPE',
      bits: 16,
      about: 'Which network protocol the addresses belong to, using EtherType values: 0x0800 = IPv4. RFC 826 calls it ar$pro.',
      source: RFC826,
    },
    { id: 'hlen', name: 'Hardware Address Length', short: 'HLEN', bits: 8, about: 'Length of a hardware address in octets: 6 for Ethernet (ar$hln).', source: RFC826 },
    { id: 'plen', name: 'Protocol Address Length', short: 'PLEN', bits: 8, about: 'Length of a protocol address in octets: 4 for IPv4 (ar$pln).', source: RFC826 },
    { id: 'oper', name: 'Operation', bits: 16, about: '1 = request, 2 = reply (ar$op).', source: RFC826 },
    { id: 'sha', name: 'Sender Hardware Address', bits: 48, about: 'MAC address of the sender (ar$sha).', source: RFC826 },
    { id: 'spa', name: 'Sender Protocol Address', bits: 32, about: 'IPv4 address of the sender (ar$spa). Receivers that already have an entry for this address update it with the sender hardware address.', source: RFC826 },
    {
      id: 'tha',
      name: 'Target Hardware Address',
      bits: 48,
      about: 'MAC address of the target (ar$tha). Unknown in a request: RFC 826 leaves the content open, and implementations such as Linux send zeros.',
      source: RFC826,
    },
    { id: 'tpa', name: 'Target Protocol Address', bits: 32, about: 'IPv4 address that is being resolved (in a request) or of the original requester (in a reply), ar$tpa.', source: RFC826 },
  ],
  sources: [RFC826, { rfc: 1122, section: '2.3.2' }, { rfc: 5227, note: 'IPv4 address conflict detection' }],
};

export interface ArpParams extends Annotations {
  oper: 'request' | 'reply';
  sha: string;
  spa: string;
  tha: string;
  tpa: string;
}

export function arp(p: ArpParams): LayerInstance {
  const op = p.oper === 'request' ? 1 : 2;
  return buildStruct(
    arpDef,
    {
      htype: { raw: 1, display: '1 (Ethernet)' },
      ptype: { raw: 0x0800, display: '0x0800 (IPv4)' },
      hlen: { raw: 6, display: '6' },
      plen: { raw: 4, display: '4' },
      oper: { raw: op, display: `${op} (${p.oper})` },
      sha: { raw: parseMac(p.sha), display: p.sha },
      spa: { raw: parseIpv4(p.spa), display: p.spa },
      tha: { raw: parseMac(p.tha), display: p.tha },
      tpa: { raw: parseIpv4(p.tpa), display: p.tpa },
    },
    p,
    p.oper === 'request' ? `Who has ${p.tpa}? Tell ${p.spa}` : `${p.spa} is at ${p.sha}`,
  );
}
