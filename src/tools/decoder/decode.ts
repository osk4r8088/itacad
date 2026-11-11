import type { LayerDef, LayerInstance, StructDef, StructInstance } from '../../shared/schema';
import { ethernetDef } from '../../shared/headers/ethernet';
import { ipv4Def } from '../../shared/headers/ipv4';
import { tcpDef, optEolDef, optNopDef, optMssDef, optWsDef, optSackPermDef, optTsDef } from '../../shared/headers/tcp';
import { udpDef } from '../../shared/headers/udp';
import { arpDef } from '../../shared/headers/arp';
import { vlanDef, vlanDisplay, vlanSummary } from '../../shared/headers/vlan';
import { icmpEchoDef, icmpTimeExceededDef, icmpDestUnreachableDef, icmpFragNeededDef } from '../../shared/headers/icmp';
import { ipv6Def } from '../../shared/headers/ipv6';
import { icmpv6EchoDef, rsDef, raDef, nsDef, naDef, optSllaDef, optTllaDef, optPrefixDef, optMtuDef, seconds } from '../../shared/headers/icmpv6';
import { concat, crc32, internetChecksum } from '../../shared/lib/encode';
import { formatIpv6 } from '../../shared/lib/ipv6';
import { decodeDns } from './dns';
import { decodeDhcp } from './dhcp';
import { decodeNtp } from './ntp';
import { arr, bit, type Display, type Issue, fixedOctets, forInput, hex, hexBytes, instance, ip4, mac, num, readBits, slice, stripExample } from './fields';

// The decoder reads real bytes with the header definitions from src/shared/headers:
// field names, sizes, explanations and sources are the same as in the protocol exchanges.

export type Start = 'auto' | 'ethernet' | 'ipv4' | 'ipv6';

export type { Issue };

export interface Check {
  label: string;
  ok: boolean;
}

export interface Decoded {
  layers: LayerInstance[];
  issues: Issue[];
  checks: Check[];
  start: 'ethernet' | 'ipv4' | 'ipv6';
  octets: number;
}

// ---- definitions adapted for real input


const ETH_WITH_FCS = forInput(ethernetDef);
const ETH_NO_FCS = forInput(ethernetDef, {
  trailer: ethernetDef.trailer!.filter((f) => f.id !== 'fcs'),
  about: `${stripExample(ethernetDef.about)}\n\nThe input ends without an FCS. Capture tools usually remove it before they show a frame, and frames captured on the sending host are often not padded yet.`,
});
const IPV4 = forInput(ipv4Def);
const TCP = forInput(tcpDef);
const UDP = forInput(udpDef);
const ARP = forInput(arpDef);
const VLAN = forInput(vlanDef);
const ICMP_ECHO = forInput(icmpEchoDef);
const ICMP_TIME = forInput(icmpTimeExceededDef);
const ICMP_UNREACH = forInput(icmpDestUnreachableDef);
const ICMP_FRAG = forInput(icmpFragNeededDef);

const IPV6 = forInput(ipv6Def);
const ICMPV6_ECHO = forInput(icmpv6EchoDef);
const ICMPV6_ND: Record<number, LayerDef> = { 133: forInput(rsDef), 134: forInput(raDef), 135: forInput(nsDef), 136: forInput(naDef) };

const ICMPV6_OTHER: LayerDef = {
  ...forInput(icmpv6EchoDef),
  id: 'icmpv6-other',
  name: 'ICMPv6 message',
  fields: [
    ...icmpv6EchoDef.fields.slice(0, 3).map((f) => ({ ...f, about: stripExample(f.about) })),
    { id: 'rest', name: 'Rest of message', bits: 'variable', compact: true, about: 'The layout of the rest depends on the type. This type is not decoded further here.', source: { rfc: 4443, section: '2.1' } },
  ],
};

const ND_OPT_OTHER: StructDef = {
  id: 'nd-opt-other',
  name: 'Neighbor Discovery option',
  about: 'An option this decoder does not know in detail. Every option has Type and Length, so the receiver can skip options it does not understand.',
  fields: [
    { id: 'type', name: 'Type', bits: 8, about: 'Option type, assigned by IANA.' },
    { id: 'length', name: 'Length', bits: 8, about: 'Length of the whole option in units of 8 octets.' },
    { id: 'data', name: 'Data', bits: 'variable', about: 'Option data.' },
  ],
  sources: [{ rfc: 4861, section: '4.6' }, { spec: 'IANA IPv6 Neighbor Discovery Option Formats', url: 'https://www.iana.org/assignments/icmpv6-parameters/' }],
};

const EXT_SOURCES = (section: string) => [{ rfc: 8200, section }];

/** Hop-by-Hop Options, Routing, Destination Options and the other extension headers with the common length format. */
const IPV6_EXT: LayerDef = {
  id: 'ipv6-ext',
  name: 'IPv6 extension header',
  short: 'IPv6 ext',
  osi: [3],
  tcpip: 'internet',
  about:
    'Optional information that IPv4 keeps in header options, IPv6 puts into extension headers between the fixed header and the upper-layer header. They form a chain: each one names the next in its Next Header field. The decoder names this header and skips it by its length; its contents are not decoded.',
  fields: [
    { id: 'nextHeader', name: 'Next Header', bits: 8, about: 'Type of the header after this one.', source: { rfc: 8200, section: '4.2' } },
    { id: 'hdrExtLen', name: 'Hdr Ext Len', bits: 8, about: 'Length of this header in units of 8 octets, not counting the first 8 octets.', source: { rfc: 8200, section: '4.3' } },
    { id: 'data', name: 'Options or data', bits: 'variable', compact: true, about: 'The contents of the header, not decoded here.' },
  ],
  sources: EXT_SOURCES('4'),
};

const IPV6_FRAG: LayerDef = {
  id: 'ipv6-frag',
  name: 'IPv6 Fragment header',
  short: 'IPv6 frag',
  osi: [3],
  tcpip: 'internet',
  about:
    'In IPv6 only the source fragments, never a router. A packet that is too big for the next link is dropped and reported with ICMPv6 Packet Too Big; the source then sends smaller packets, or fragments with this header.',
  fields: [
    { id: 'nextHeader', name: 'Next Header', bits: 8, about: 'Type of the header that starts the fragmentable part of the original packet.', source: { rfc: 8200, section: '4.5' } },
    { id: 'reserved', name: 'Reserved', bits: 8, about: 'Zero.', source: { rfc: 8200, section: '4.5' } },
    { id: 'fragOffset', name: 'Fragment Offset', bits: 13, about: 'Position of this fragment in the original data, in units of 8 octets.', source: { rfc: 8200, section: '4.5' } },
    { id: 'res', name: 'Res', bits: 2, about: 'Zero.', source: { rfc: 8200, section: '4.5' } },
    { id: 'm', name: 'M (More Fragments)', short: 'M', bits: 1, about: '1 = more fragments follow, 0 = last fragment.', source: { rfc: 8200, section: '4.5' } },
    { id: 'identification', name: 'Identification', bits: 32, about: 'Same value in all fragments of one original packet.', source: { rfc: 8200, section: '4.5' } },
  ],
  sources: EXT_SOURCES('4.5'),
};

const IPV6_AH: LayerDef = {
  ...IPV6_EXT,
  id: 'ipv6-ah',
  name: 'Authentication Header',
  short: 'AH',
  about: 'IPsec Authentication Header: protects the integrity of the packet. Its length counts in units of 4 octets, unlike the other extension headers. The decoder skips it by its length.',
  fields: [
    { id: 'nextHeader', name: 'Next Header', bits: 8, about: 'Type of the header after this one.', source: { rfc: 4302, section: '2.1' } },
    { id: 'hdrExtLen', name: 'Payload Len', bits: 8, about: 'Length of this header in units of 4 octets, minus 2.', source: { rfc: 4302, section: '2.2' } },
    { id: 'data', name: 'Rest of header', bits: 'variable', compact: true, about: 'Reserved, Security Parameters Index, Sequence Number and Integrity Check Value; not decoded here.', source: { rfc: 4302, section: '2' } },
  ],
  sources: [{ rfc: 4302, section: '2' }],
};

const ICMP_OTHER: LayerDef = {
  ...forInput(icmpEchoDef),
  id: 'icmp-other',
  name: 'ICMP message',
  fields: [
    ...icmpEchoDef.fields.slice(0, 3).map((f) => ({ ...f, about: stripExample(f.about) })),
    { id: 'rest', name: 'Rest of message', bits: 'variable', compact: true, about: 'The layout of the rest depends on the type. This type is not decoded further here.', source: { rfc: 792 } },
  ],
};

const TCP_OPT_OTHER: StructDef = {
  id: 'tcp-opt-other',
  name: 'TCP option',
  about: 'An option this decoder does not know in detail. Every option other than End of Option List and No-Operation has Kind, Length and data, so the receiver can skip options it does not understand.',
  fields: [
    { id: 'kind', name: 'Kind', bits: 8, about: 'Option type, assigned by IANA.' },
    { id: 'length', name: 'Length', bits: 8, about: 'Length of the whole option in octets, including Kind and Length.' },
    { id: 'data', name: 'Data', bits: 'variable', about: 'Option data.' },
  ],
  sources: [{ rfc: 9293, section: '3.2' }, { spec: 'IANA TCP Option Kind Numbers', url: 'https://www.iana.org/assignments/tcp-parameters/' }],
};

const DATA: LayerDef = {
  id: 'data',
  name: 'Data',
  short: 'Data',
  osi: [5, 6, 7],
  tcpip: 'application',
  about: 'The bytes after the last decoded header. The decoder does not interpret them; the port numbers usually tell which application protocol it is. Of the application protocols it reads DNS, DHCP and NTP over UDP.',
  fields: [{ id: 'data', name: 'Data', bits: 'variable', compact: true, about: 'Shown as text when it is printable, otherwise as hex.' }],
  sources: [],
};

const FRAGMENT: LayerDef = {
  ...DATA,
  id: 'fragment',
  name: 'Fragment data',
  short: 'Fragment',
  osi: [3],
  tcpip: 'internet',
  about: 'This packet is a fragment that does not start at offset 0, so it carries a piece from the middle or end of the original datagram. Its transport header is in the first fragment; the receiver reassembles all fragments before it hands the datagram to TCP, UDP or ICMP.',
  fields: [{ id: 'data', name: 'Data', bits: 'variable', compact: true, about: 'Part of the original IP payload.' }],
  sources: [{ rfc: 791, section: '2.3' }],
};

// ---- names

const ETHERTYPES: Record<number, string> = { 0x0800: 'IPv4', 0x0806: 'ARP', 0x86dd: 'IPv6', 0x8100: 'VLAN tag, IEEE 802.1Q', 0x88cc: 'LLDP', 0x8847: 'MPLS' };
const IP_PROTOCOLS: Record<number, string> = {
  0: 'Hop-by-Hop Options',
  1: 'ICMP',
  2: 'IGMP',
  6: 'TCP',
  17: 'UDP',
  41: 'IPv6 encapsulation',
  43: 'Routing header',
  44: 'Fragment header',
  47: 'GRE',
  50: 'ESP',
  51: 'AH',
  58: 'ICMPv6',
  59: 'No Next Header',
  60: 'Destination Options',
  89: 'OSPF',
  132: 'SCTP',
  135: 'Mobility header',
  139: 'HIP',
  140: 'Shim6',
};
/** Extension headers with Next Header and Hdr Ext Len in the first two octets (RFC 8200 section 4, RFC 6564). */
const IPV6_EXT_GENERIC = new Set([0, 43, 60, 135, 139, 140]);
const ICMPV6_TYPES: Record<number, string> = {
  1: 'Destination Unreachable',
  2: 'Packet Too Big',
  3: 'Time Exceeded',
  4: 'Parameter Problem',
  128: 'Echo Request',
  129: 'Echo Reply',
  130: 'Multicast Listener Query',
  131: 'Multicast Listener Report',
  132: 'Multicast Listener Done',
  133: 'Router Solicitation',
  134: 'Router Advertisement',
  135: 'Neighbor Solicitation',
  136: 'Neighbor Advertisement',
  137: 'Redirect',
  143: 'Version 2 Multicast Listener Report',
};
const ECN = ['00 (Not-ECT)', '01 (ECT(1))', '10 (ECT(0))', '11 (CE, congestion experienced)'];
const ICMP_TYPES: Record<number, string> = { 0: 'Echo Reply', 3: 'Destination Unreachable', 5: 'Redirect', 8: 'Echo Request', 11: 'Time Exceeded', 12: 'Parameter Problem', 13: 'Timestamp', 14: 'Timestamp Reply' };
const ICMP_UNREACH_CODES: Record<number, string> = {
  0: 'Net unreachable',
  1: 'Host unreachable',
  2: 'Protocol unreachable',
  3: 'Port unreachable',
  4: 'Fragmentation needed and DF set',
  5: 'Source route failed',
  13: 'Communication administratively prohibited',
};
const ICMP_TIME_CODES: Record<number, string> = { 0: 'TTL exceeded in transit', 1: 'Fragment reassembly time exceeded' };
const PORTS: Record<number, string> = { 20: 'FTP data', 21: 'FTP', 22: 'SSH', 25: 'SMTP', 53: 'DNS', 67: 'DHCP server', 68: 'DHCP client', 80: 'HTTP', 123: 'NTP', 143: 'IMAP', 443: 'HTTPS', 587: 'SMTP submission', 993: 'IMAPS' };
const TCP_FLAGS = ['CWR', 'ECE', 'URG', 'ACK', 'PSH', 'RST', 'SYN', 'FIN'] as const;



// ---- decoder state

/** What the network layer tells the layer above: addresses for the pseudo-header, and whether the data is complete. */
interface Ctx {
  src: Uint8Array;
  dst: Uint8Array;
  complete: boolean;
  v6: boolean;
  hopLimit?: number;
}

class Decoder {
  layers: LayerInstance[] = [];
  issues: Issue[] = [];
  checks: Check[] = [];

  issue(level: Issue['level'], text: string) {
    this.issues.push({ level, text });
  }

  need(bytes: Uint8Array, octets: number, what: string): boolean {
    if (bytes.length >= octets) return true;
    this.issue('error', `${what} needs at least ${octets} octets, but only ${bytes.length} are left. The input is cut off.`);
    if (bytes.length) this.data(bytes, 'Undecoded bytes');
    return false;
  }

  checksum(label: string, ok: boolean, transmitted: number, expected: number): { display: string; note: string } {
    this.checks.push({ label, ok });
    if (!ok) this.issue('warning', `${label} does not match: the input has ${hex(transmitted, 4)}, the content gives ${hex(expected, 4)}. The bytes were changed or cut, or the checksum was offloaded to the network card.`);
    return {
      display: hex(transmitted, 4),
      note: ok ? 'Checked: matches the content.' : `Does not match: computed from the content it would be ${hex(expected, 4)}.`,
    };
  }

  data(bytes: Uint8Array, summary?: string, note?: string) {
    const printable = bytes.length > 0 && Array.from(bytes).every((b) => (b >= 0x20 && b < 0x7f) || b === 0x0d || b === 0x0a || b === 0x09);
    const text = printable ? new TextDecoder().decode(bytes).replace(/\r\n/g, '\\r\\n\n') : hexBytes(bytes, 64);
    const sliced = slice(DATA.fields, bytes);
    this.layers.push(instance(DATA, bytes, sliced, { data: { display: text, ...(note ? { note } : {}) } }, summary ?? `${bytes.length} octets${printable ? ', text' : ''}`));
  }

  // ---- Ethernet

  ethernet(frame: Uint8Array) {
    if (!this.need(frame, 14, 'An Ethernet header')) return;
    // FCS present if the last four octets are the CRC-32 of everything before them, sent least significant octet first.
    let hasFcs = false;
    if (frame.length >= 18) {
      const crc = crc32(frame.subarray(0, frame.length - 4));
      const t = frame.subarray(frame.length - 4);
      hasFcs = t[0] === (crc & 0xff) && t[1] === ((crc >>> 8) & 0xff) && t[2] === ((crc >>> 16) & 0xff) && t[3] === crc >>> 24;
    }
    const def = hasFcs ? ETH_WITH_FCS : ETH_NO_FCS;
    const header = slice(def.fields, frame);
    const body = frame.subarray(14, frame.length - (hasFcs ? 4 : 0));
    const type = num(header.raw.type);
    const index = this.layers.length;
    this.layers.push(undefined as unknown as LayerInstance); // placeholder, filled once the payload length is known

    let used = body.length;
    let typeDisplay = `${hex(type, 4)} (${ETHERTYPES[type] ?? 'unknown'})`;
    if (type < 0x0600) {
      typeDisplay = `${hex(type, 4)} (a length: IEEE 802.3 frame with LLC header)`;
      this.issue('info', 'This is an IEEE 802.3 frame with an LLC header, not Ethernet II. The decoder stops here.');
      // The field gives the length of the LLC data; anything after it is padding.
      used = Math.min(type, body.length);
      if (type > body.length) this.issue('warning', `The length field says ${type} octets, but only ${body.length} follow.`);
      this.data(body.subarray(0, used), 'LLC frame, not decoded');
    } else used = this.byType(type, body);

    const pad = body.subarray(used);
    const trailerBytes = concat(pad, hasFcs ? frame.subarray(frame.length - 4) : new Uint8Array(0));
    const trailer = slice(def.trailer!, trailerBytes, { pad: pad.length });
    const dst = header.bin.dst;
    const display: Display = {
      dst: mac(dst) === 'ff:ff:ff:ff:ff:ff' ? `${mac(dst)} (broadcast)` : (dst[0] & 1 ? `${mac(dst)} (multicast)` : mac(dst)),
      src: mac(header.bin.src),
      type: typeDisplay,
      pad: pad.length === 0 ? (body.length >= 46 ? 'none (payload is at least 46 octets)' : 'none') : pad.every((b) => b === 0) ? `${pad.length} zero octets` : `${pad.length} octets: ${hexBytes(pad)}`,
    };
    if (hasFcs) {
      display.fcs = { display: hexBytes(frame.subarray(frame.length - 4)), note: 'Checked: matches the CRC-32 of the frame. That is how the decoder recognized it as FCS.' };
      this.checks.push({ label: 'Ethernet FCS', ok: true });
    }
    if (!hasFcs && frame.length < 60) this.issue('info', `The frame has ${frame.length} octets without FCS. On the wire it is padded to at least 60 (64 with FCS); captures on the sending host show it before padding.`);
    this.layers[index] = instance(def, frame, header, display, `${display.src} to ${mac(dst)}`, { bytes: trailerBytes, sliced: trailer });
  }

  /** Decodes a payload by its EtherType; returns the number of octets used, the rest is padding. */
  byType(type: number, body: Uint8Array): number {
    if (type === 0x0800) return this.ipv4(body);
    if (type === 0x0806) return this.arp(body);
    if (type === 0x86dd) return this.ipv6(body);
    if (type === 0x8100) return this.vlanTag(body);
    this.issue('info', `EtherType ${hex(type, 4)} (${ETHERTYPES[type] ?? 'unknown'}) is not decoded yet. Supported: IPv4, IPv6, ARP and 802.1Q VLAN tags.`);
    this.data(body, `${ETHERTYPES[type] ?? 'Unknown'} payload, not decoded`);
    return body.length;
  }

  // ---- 802.1Q

  vlanTag(bytes: Uint8Array): number {
    if (!this.need(bytes, 4, 'An 802.1Q tag')) return bytes.length;
    const s = slice(VLAN.fields, bytes.subarray(0, 4));
    const pcp = num(s.raw.pcp);
    const vid = num(s.raw.vid);
    const inner = num(s.raw.type);
    this.layers.push(instance(VLAN, bytes.subarray(0, 4), s, vlanDisplay(pcp, num(s.raw.dei), vid, inner), vlanSummary(vid, pcp)));
    if (vid === 0 || vid === 4095) this.issue('info', `VLAN ID ${vid} is ${vid === 0 ? 'a priority tag without VLAN' : 'reserved'}.`);
    if (inner === 0x8100) this.issue('warning', 'A second 802.1Q tag follows directly. Double tagging is used in VLAN hopping attacks; carriers use stacked tags with TPID 0x88a8 (802.1ad) instead.');
    return 4 + this.byType(inner, bytes.subarray(4));
  }

  // ---- ARP

  /** Returns the number of octets used by ARP. */
  arp(bytes: Uint8Array): number {
    if (!this.need(bytes, 8, 'An ARP message')) return bytes.length;
    const htype = (bytes[0] << 8) | bytes[1];
    const ptype = (bytes[2] << 8) | bytes[3];
    if (htype !== 1 || ptype !== 0x0800 || bytes[4] !== 6 || bytes[5] !== 4) {
      this.issue('info', `ARP for hardware type ${htype} and protocol ${hex(ptype, 4)} is not decoded; only Ethernet with IPv4 is.`);
      this.data(bytes, 'ARP, not decoded');
      return bytes.length;
    }
    if (!this.need(bytes, 28, 'ARP for Ethernet and IPv4')) return bytes.length;
    const s = slice(ARP.fields, bytes);
    const oper = num(s.raw.oper);
    const spa = ip4(s.bin.spa);
    const tpa = ip4(s.bin.tpa);
    const sha = mac(s.bin.sha);
    const summary = oper === 1 ? `Who has ${tpa}? Tell ${spa}` : oper === 2 ? `${spa} is at ${sha}` : `Operation ${oper}`;
    this.layers.push(
      instance(ARP, bytes, s, {
        htype: '1 (Ethernet)',
        ptype: '0x0800 (IPv4)',
        hlen: '6',
        plen: '4',
        oper: `${oper} (${oper === 1 ? 'request' : oper === 2 ? 'reply' : 'unknown'})`,
        sha,
        spa,
        tha: mac(s.bin.tha),
        tpa,
      }, summary),
    );
    return 28;
  }

  // ---- IPv4

  /** Returns the number of octets of the datagram (Total Length), the rest is Ethernet padding. */
  ipv4(bytes: Uint8Array): number {
    if (!this.need(bytes, 20, 'An IPv4 header')) return bytes.length;
    const version = bytes[0] >> 4;
    const ihl = bytes[0] & 0x0f;
    if (version !== 4) {
      this.issue('error', `The Version field is ${version}, not 4, so this is not an IPv4 header.`);
      this.data(bytes, 'Not IPv4');
      return bytes.length;
    }
    if (ihl < 5) {
      this.issue('error', `IHL is ${ihl}; the minimum is 5 (20 octets). The header is invalid.`);
      this.data(bytes, 'Invalid IPv4 header');
      return bytes.length;
    }
    const headerLen = ihl * 4;
    if (!this.need(bytes, headerLen, `An IPv4 header with IHL ${ihl}`)) return bytes.length;
    const s = slice(IPV4.fields, bytes, { options: headerLen - 20 });
    const totalLength = num(s.raw.totalLength);
    let end = totalLength;
    if (totalLength < headerLen) {
      this.issue('error', `Total Length ${totalLength} is smaller than the header (${headerLen} octets).`);
      end = bytes.length;
    } else if (totalLength > bytes.length) {
      this.issue('warning', `Total Length says ${totalLength} octets, but only ${bytes.length} are there. The packet is cut off, for example by a capture length limit.`);
      end = bytes.length;
    }

    const header = bytes.subarray(0, headerLen);
    const transmitted = num(s.raw.checksum);
    const expected = internetChecksum(concat(header.subarray(0, 10), Uint8Array.of(0, 0), header.subarray(12)));
    const src = ip4(s.bin.src);
    const dst = ip4(s.bin.dst);
    const protocol = num(s.raw.protocol);
    const df = num(s.raw.df);
    const mf = num(s.raw.mf);
    const frag = num(s.raw.fragOffset);
    const options = arr(s.raw.options);
    const ttl = num(s.raw.ttl);

    this.layers.push(
      instance(IPV4, bytes, s, {
        version: '4',
        ihl: `${ihl} (${headerLen} octets)`,
        dscp: String(num(s.raw.dscp)),
        ecn: ECN[num(s.raw.ecn)],
        totalLength: String(totalLength),
        id: `${hex(num(s.raw.id), 4)} (${num(s.raw.id)})`,
        reserved: num(s.raw.reserved) ? { display: '1', note: 'Must be zero.' } : '0',
        df: String(df),
        mf: String(mf),
        fragOffset: frag ? `${frag} (${frag * 8} octets)` : '0',
        ttl: String(ttl),
        protocol: `${protocol} (${IP_PROTOCOLS[protocol] ?? 'unknown'})`,
        checksum: this.checksum('IPv4 header checksum', internetChecksum(header) === 0, transmitted, expected),
        src,
        dst,
        options: options.length ? `${options.length} octets: ${hexBytes(options)}` : 'none',
      }, `${src} to ${dst}, TTL ${ttl}${mf || frag ? `, fragment at ${frag * 8}${mf ? ', MF' : ''}` : ''}`),
    );

    const payload = bytes.subarray(headerLen, end);
    const ctx: Ctx = { src: s.bin.src, dst: s.bin.dst, complete: !mf && totalLength <= bytes.length, v6: false };
    if (payload.length === 0 && end < totalLength) return end; // cut off right after the header, already reported
    if (frag > 0) {
      this.issue('info', `This is a fragment at offset ${frag * 8}; its data is a piece of the original payload and is not decoded.`);
      this.layers.push(instance(FRAGMENT, payload, slice(FRAGMENT.fields, payload), { data: hexBytes(payload, 64) }, `${payload.length} octets`));
    } else {
      if (mf) this.issue('info', 'More Fragments is set: this is the first fragment. The transport checksum covers the whole datagram, so it cannot be checked from this fragment alone.');
      if (protocol === 6) this.tcp(payload, ctx);
      else if (protocol === 17) this.udp(payload, ctx);
      else if (protocol === 1) this.icmp(payload, ctx.complete);
      else {
        this.issue('info', `Protocol ${protocol} (${IP_PROTOCOLS[protocol] ?? 'unknown'}) is not decoded yet. Supported: TCP, UDP and ICMP.`);
        this.data(payload, `${IP_PROTOCOLS[protocol] ?? 'Unknown'} payload, not decoded`);
      }
    }
    return end;
  }

  // ---- IPv6

  /** Returns the number of octets of the packet (40 + Payload Length), the rest is Ethernet padding. */
  ipv6(bytes: Uint8Array): number {
    if (!this.need(bytes, 40, 'An IPv6 header')) return bytes.length;
    const version = bytes[0] >> 4;
    if (version !== 6) {
      this.issue('error', `The Version field is ${version}, not 6, so this is not an IPv6 header.`);
      this.data(bytes, 'Not IPv6');
      return bytes.length;
    }
    const s = slice(IPV6.fields, bytes);
    const payloadLength = num(s.raw.payloadLength);
    let end = 40 + payloadLength;
    if (payloadLength === 0 && num(s.raw.nextHeader) === 0) this.issue('info', 'Payload Length 0 with a Hop-by-Hop header can mean a jumbogram (RFC 2675), which this decoder does not handle.');
    if (end > bytes.length) {
      this.issue('warning', `Payload Length says ${payloadLength} octets, but only ${bytes.length - 40} follow the header. The packet is cut off, for example by a capture length limit.`);
      end = bytes.length;
    }
    const tc = num(s.raw.trafficClass);
    const flow = num(s.raw.flowLabel);
    const nextHeader = num(s.raw.nextHeader);
    const hopLimit = num(s.raw.hopLimit);
    const src = formatIpv6(s.bin.src);
    const dst = formatIpv6(s.bin.dst);
    this.layers.push(
      instance(IPV6, bytes, s, {
        version: '6',
        trafficClass: tc ? `${tc} (DSCP ${tc >> 2}, ECN ${ECN[tc & 3]})` : '0',
        flowLabel: flow ? hex(flow, 5) : '0 (unlabeled)',
        payloadLength: String(payloadLength),
        nextHeader: `${nextHeader} (${IP_PROTOCOLS[nextHeader] ?? 'unknown'})`,
        hopLimit: String(hopLimit),
        src,
        dst,
      }, `${src} to ${dst}, hop limit ${hopLimit}`),
    );
    const ctx: Ctx = { src: s.bin.src, dst: s.bin.dst, complete: 40 + payloadLength <= bytes.length, v6: true, hopLimit };
    this.ipv6Next(nextHeader, bytes.subarray(40, end), ctx);
    return end;
  }

  /** Follows the chain of extension headers to the upper-layer protocol. */
  ipv6Next(nextHeader: number, rest: Uint8Array, ctx: Ctx) {
    let nh = nextHeader;
    let bytes = rest;
    for (let guard = 0; guard < 16; guard++) {
      if (nh === 6) return this.tcp(bytes, ctx);
      if (nh === 17) return this.udp(bytes, ctx);
      if (nh === 58) return this.icmpv6(bytes, ctx);
      if (nh === 59) {
        if (bytes.length) this.data(bytes, 'After No Next Header, ignored');
        return;
      }
      if (nh === 44) {
        if (!this.need(bytes, 8, 'An IPv6 Fragment header')) return;
        const s = slice(IPV6_FRAG.fields, bytes.subarray(0, 8));
        const offset = num(s.raw.fragOffset);
        const m = num(s.raw.m);
        const next = num(s.raw.nextHeader);
        this.layers.push(
          instance(IPV6_FRAG, bytes, s, {
            nextHeader: `${next} (${IP_PROTOCOLS[next] ?? 'unknown'})`,
            fragOffset: offset ? `${offset} (${offset * 8} octets)` : '0',
            m: String(m),
            identification: `${hex(num(s.raw.identification), 8)}`,
          }, `fragment at ${offset * 8}${m ? ', more follow' : ', last'}`),
        );
        const payload = bytes.subarray(8);
        if (offset > 0) {
          this.issue('info', `This is a fragment at offset ${offset * 8}; its data is a piece of the original payload and is not decoded.`);
          this.layers.push(instance(FRAGMENT, payload, slice(FRAGMENT.fields, payload), { data: hexBytes(payload, 64) }, `${payload.length} octets`));
          return;
        }
        if (m) this.issue('info', 'More Fragments is set: this is the first fragment. The upper-layer checksum covers the whole packet, so it cannot be checked from this fragment alone.');
        ctx = { ...ctx, complete: ctx.complete && !m };
        nh = next;
        bytes = payload;
        continue;
      }
      if (IPV6_EXT_GENERIC.has(nh) || nh === 51) {
        if (!this.need(bytes, 8, `An IPv6 ${IP_PROTOCOLS[nh]}`)) return;
        const ah = nh === 51;
        const len = ah ? (bytes[1] + 2) * 4 : (bytes[1] + 1) * 8;
        if (!this.need(bytes, len, `This ${IP_PROTOCOLS[nh]} (${len} octets)`)) return;
        const def = ah ? IPV6_AH : IPV6_EXT;
        const s = slice(def.fields, bytes.subarray(0, len), { data: len - 2 });
        const next = bytes[0];
        this.layers.push(
          instance({ ...def, name: ah ? def.name : IP_PROTOCOLS[nh] }, bytes, s, {
            nextHeader: `${next} (${IP_PROTOCOLS[next] ?? 'unknown'})`,
            hdrExtLen: `${bytes[1]} (${len} octets in total)`,
            data: `${len - 2} octets: ${hexBytes(bytes.subarray(2, len))}`,
          }, `${IP_PROTOCOLS[nh]}, ${len} octets`),
        );
        nh = next;
        bytes = bytes.subarray(len);
        continue;
      }
      break;
    }
    const name = IP_PROTOCOLS[nh] ?? 'unknown';
    this.issue('info', nh === 50 ? 'ESP (IPsec) follows: everything after its header is encrypted.' : `Next Header ${nh} (${name}) is not decoded yet. Supported: TCP, UDP, ICMPv6 and skipping extension headers.`);
    this.data(bytes, `${name} payload, not decoded`);
  }

  // ---- ICMPv6

  icmpv6(msg: Uint8Array, ctx: Ctx) {
    if (!this.need(msg, 4, 'An ICMPv6 header')) return;
    const type = msg[0];
    const code = msg[1];
    const transmitted = (msg[2] << 8) | msg[3];
    const sum = this.pseudoOk(ctx, 58, msg);
    const checksum = ctx.complete ? this.checksum('ICMPv6 checksum', sum.ok, transmitted, sum.expected) : { display: hex(transmitted, 4), note: 'Not checked: the message is incomplete.' };
    const typeName = ICMPV6_TYPES[type] ?? 'unknown';
    const def = type === 128 || type === 129 ? ICMPV6_ECHO : (ICMPV6_ND[type] ?? ICMPV6_OTHER);
    if (!this.need(msg, fixedOctets(def.fields), `An ICMPv6 ${typeName} message`)) return;
    const s = slice(def.fields, msg);
    const display: Display = { type: `${type} (${typeName})`, code: String(code), checksum };
    let summary = typeName;
    if (def === ICMPV6_ECHO) {
      display.identifier = hex(num(s.raw.identifier), 4);
      display.sequence = String(num(s.raw.sequence));
      display.data = arr(s.raw.data).length ? `${arr(s.raw.data).length} octets: ${hexBytes(arr(s.raw.data))}` : 'none';
      summary = `${typeName}, id ${hex(num(s.raw.identifier), 4)}, seq ${num(s.raw.sequence)}`;
    } else if (def !== ICMPV6_OTHER) {
      // Neighbor Discovery: RFC 4861 sections 6.1 and 7.1 require Hop Limit 255, proof that no router forwarded the message.
      if (ctx.hopLimit !== undefined && ctx.hopLimit !== 255) this.issue('warning', `Neighbor Discovery messages must arrive with Hop Limit 255, this one has ${ctx.hopLimit}. Receivers discard it (RFC 4861).`);
      if (code !== 0) this.issue('warning', `The Code of a Neighbor Discovery message must be 0, it is ${code}.`);
      if ('reserved' in s.raw) display.reserved = num(s.raw.reserved) ? { display: String(num(s.raw.reserved)), note: 'Should be zero.' } : '0';
      if ('target' in s.raw) {
        display.target = formatIpv6(s.bin.target);
        summary = `${typeName} for ${display.target}`;
      }
      for (const f of ['managed', 'other', 'router', 'solicited', 'override']) if (f in s.raw) display[f] = bit(s.raw[f]);
      if (type === 134) {
        const reach = num(s.raw.reachableTime);
        const retrans = num(s.raw.retransTimer);
        display.curHopLimit = String(num(s.raw.curHopLimit));
        display.routerLifetime = seconds(num(s.raw.routerLifetime));
        display.reachableTime = reach ? `${reach} ms` : '0 (unspecified)';
        display.retransTimer = retrans ? `${retrans} ms` : '0 (unspecified)';
      }
      const options = this.ndOptions(arr(s.raw.options));
      display.options = options.length ? { display: options.map((o) => o.summary).join(', '), items: options } : 'none';
    } else if ('rest' in s.raw) display.rest = arr(s.raw.rest).length ? `${arr(s.raw.rest).length} octets: ${hexBytes(arr(s.raw.rest))}` : 'none';
    this.layers.push(instance(def, msg, s, display, summary));
  }

  ndOptions(bytes: Uint8Array): StructInstance[] {
    const out: StructInstance[] = [];
    let i = 0;
    while (i < bytes.length) {
      if (bytes.length - i < 2 || bytes[i + 1] === 0 || i + bytes[i + 1] * 8 > bytes.length) {
        this.issue('error', `Neighbor Discovery option at octet ${i} of the options has an invalid length. Receivers discard the whole message (RFC 4861 section 4.6).`);
        break;
      }
      const type = bytes[i];
      const len = bytes[i + 1];
      const b = bytes.subarray(i, i + len * 8);
      const length = `${len} (${len * 8} octets)`;
      if ((type === 1 || type === 2) && len === 1) {
        const s = slice(optSllaDef.fields, b);
        const address = mac(s.bin.address);
        out.push(instance(type === 1 ? optSllaDef : optTllaDef, b, s, { type: String(type), length, address }, `${type === 1 ? 'Source' : 'Target'} link-layer address ${address}`));
      } else if (type === 3 && len === 4) {
        const s = slice(optPrefixDef.fields, b);
        const prefix = formatIpv6(s.bin.prefix);
        const auto = num(s.raw.autonomous);
        out.push(
          instance(optPrefixDef, b, s, {
            type: '3',
            length,
            prefixLength: String(num(s.raw.prefixLength)),
            onLink: bit(s.raw.onLink),
            autonomous: bit(s.raw.autonomous),
            reserved1: String(num(s.raw.reserved1)),
            validLifetime: seconds(num(s.raw.validLifetime)),
            preferredLifetime: seconds(num(s.raw.preferredLifetime)),
            reserved2: String(num(s.raw.reserved2)),
            prefix,
          }, `Prefix ${prefix}/${num(s.raw.prefixLength)}${auto ? ', SLAAC' : ''}`),
        );
      } else if (type === 5 && len === 1) {
        const s = slice(optMtuDef.fields, b);
        out.push(instance(optMtuDef, b, s, { type: '5', length, reserved: String(num(s.raw.reserved)), mtu: String(num(s.raw.mtu)) }, `MTU ${num(s.raw.mtu)}`));
      } else {
        const s = slice(ND_OPT_OTHER.fields, b, { data: len * 8 - 2 });
        out.push(instance(ND_OPT_OTHER, b, s, { type: String(type), length }, `Option ${type}`));
      }
      i += len * 8;
    }
    return out;
  }

  /** Checks a TCP, UDP or ICMPv6 checksum over the IPv4 or IPv6 pseudo-header. */
  pseudoOk(ctx: Ctx, protocol: number, segment: Uint8Array): { ok: boolean; expected: number } {
    const n = segment.length;
    const pseudo = ctx.v6
      ? concat(ctx.src, ctx.dst, Uint8Array.of(n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, 0, 0, 0, protocol))
      : concat(ctx.src, ctx.dst, Uint8Array.of(0, protocol, n >> 8, n & 0xff));
    const ok = internetChecksum(concat(pseudo, segment)) === 0;
    const at = protocol === 6 ? 16 : protocol === 17 ? 6 : 2;
    const zeroed = concat(segment.subarray(0, at), Uint8Array.of(0, 0), segment.subarray(at + 2));
    let expected = internetChecksum(concat(pseudo, zeroed));
    if (protocol === 17 && expected === 0) expected = 0xffff;
    return { ok, expected };
  }

  /** What to say about data the decoder does not interpret, going by the port numbers. */
  portNote(src: number, dst: number, transport: 'TCP' | 'UDP'): string {
    const reads = 'The decoder reads DNS on UDP port 53, DHCP on UDP ports 67 and 68, and NTP on UDP port 123.';
    const known = [dst, src].find((p) => PORTS[p]);
    if (known === 53 && transport === 'TCP') return 'Port 53 is DNS. Over TCP every DNS message has a two-octet length in front and can span several segments (RFC 1035 section 4.2.2), so it is not decoded here; the decoder reads DNS over UDP.';
    if (known !== undefined) return `Port ${known} is the well-known port of ${PORTS[known]}, which the decoder does not interpret. ${reads}`;
    return `Neither port belongs to a protocol the decoder interprets. ${reads}`;
  }

  /** DNS, DHCP and NTP inside UDP, chosen by port. Returns false when the data is left for the caller to show. */
  application(payload: Uint8Array, srcPort: number, dstPort: number): boolean {
    const on = (...ports: number[]) => ports.includes(srcPort) || ports.includes(dstPort);
    const report = (level: Issue['level'], text: string) => this.issue(level, text);
    const layer = on(53) ? decodeDns(payload, report) : on(67, 68) ? decodeDhcp(payload, report) : on(123) ? decodeNtp(payload, report) : undefined;
    if (!layer) return false;
    this.layers.push(layer);
    return true;
  }

  // ---- TCP

  tcp(seg: Uint8Array, ctx: Ctx) {
    if (!this.need(seg, 20, 'A TCP header')) return;
    const offset = seg[12] >> 4;
    if (offset < 5) {
      this.issue('error', `Data Offset is ${offset}; the minimum is 5 (20 octets).`);
      this.data(seg, 'Invalid TCP header');
      return;
    }
    const headerLen = offset * 4;
    if (!this.need(seg, headerLen, `A TCP header with Data Offset ${offset}`)) return;
    const s = slice(TCP.fields, seg, { options: headerLen - 20 });
    const options = this.tcpOptions(arr(s.raw.options));
    const flags = TCP_FLAGS.filter((f) => num(s.raw[`flag${f}`]));
    const srcPort = num(s.raw.srcPort);
    const dstPort = num(s.raw.dstPort);
    const transmitted = num(s.raw.checksum);
    const sum = this.pseudoOk(ctx, 6, seg);
    const display: Display = {
      dataOffset: `${offset} (${headerLen} octets)`,
      reserved: num(s.raw.reserved) ? { display: String(num(s.raw.reserved)), note: 'Must be zero.' } : '0',
      checksum: ctx.complete ? this.checksum('TCP checksum', sum.ok, transmitted, sum.expected) : { display: hex(transmitted, 4), note: 'Not checked: the segment is incomplete.' },
      options: options.length ? { display: options.map((o) => o.summary).join(', '), items: options } : 'none',
    };
    for (const f of TCP_FLAGS) display[`flag${f}`] = String(num(s.raw[`flag${f}`]));
    this.layers.push(instance(TCP, seg, s, display, `${srcPort} to ${dstPort}, [${flags.join(', ')}]`));
    const payload = seg.subarray(headerLen);
    if (payload.length) this.data(payload, undefined, this.portNote(srcPort, dstPort, 'TCP'));
  }

  tcpOptions(bytes: Uint8Array): StructInstance[] {
    const out: StructInstance[] = [];
    let i = 0;
    const known: Record<number, [StructDef, number, (b: Uint8Array) => Display, (b: Uint8Array) => string]> = {
      2: [optMssDef, 4, (b) => ({ kind: '2', length: '4', mss: String((b[2] << 8) | b[3]) }), (b) => `MSS ${(b[2] << 8) | b[3]}`],
      3: [optWsDef, 3, (b) => ({ kind: '3', length: '3', shift: `${b[2]} (factor ${2 ** b[2]})` }), (b) => `WS ${b[2]}`],
      4: [optSackPermDef, 2, () => ({ kind: '4', length: '2' }), () => 'SACK-Permitted'],
      8: [optTsDef, 10, () => ({ kind: '8', length: '10' }), (b) => `TS ${readBits(b, 16, 32)}/${readBits(b, 48, 32)}`],
    };
    while (i < bytes.length) {
      const kind = bytes[i];
      if (kind === 0) {
        out.push(instance(optEolDef, bytes.subarray(i, i + 1), slice(optEolDef.fields, bytes.subarray(i, i + 1)), { kind: '0' }, 'EOL'));
        const rest = bytes.length - i - 1;
        if (rest > 0 && bytes.subarray(i + 1).some((b) => b !== 0)) this.issue('warning', 'TCP option padding after End of Option List is not zero.');
        break;
      }
      if (kind === 1) {
        out.push(instance(optNopDef, bytes.subarray(i, i + 1), slice(optNopDef.fields, bytes.subarray(i, i + 1)), { kind: '1' }, 'NOP'));
        i += 1;
        continue;
      }
      const len = bytes[i + 1];
      if (len === undefined || len < 2 || i + len > bytes.length) {
        this.issue('error', `TCP option of kind ${kind} at octet ${i} of the options has an invalid length.`);
        break;
      }
      const b = bytes.subarray(i, i + len);
      const k = known[kind];
      if (k && k[1] === len) {
        const s = slice(k[0].fields, b);
        const d = k[2](b);
        out.push(instance(k[0], b, s, d, k[3](b)));
      } else {
        if (k) this.issue('warning', `TCP option ${kind} should be ${k[1]} octets long, but its Length is ${len}.`);
        const s = slice(TCP_OPT_OTHER.fields, b, { data: len - 2 });
        out.push(instance(TCP_OPT_OTHER, b, s, { kind: String(kind), length: String(len) }, kind === 5 ? `SACK, ${(len - 2) / 8} block(s)` : `Kind ${kind}`));
      }
      i += len;
    }
    return out;
  }

  // ---- UDP

  udp(dgram: Uint8Array, ctx: Ctx) {
    if (!this.need(dgram, 8, 'A UDP header')) return;
    const s = slice(UDP.fields, dgram);
    const length = num(s.raw.length);
    let end = dgram.length;
    if (length < 8) this.issue('error', `UDP Length ${length} is smaller than the header (8 octets).`);
    else if (length > dgram.length && !ctx.complete) this.issue('info', `UDP Length says ${length} octets; the rest of the datagram is in later fragments.`);
    else if (length > dgram.length) this.issue('warning', `UDP Length says ${length} octets, but only ${dgram.length} are there.`);
    else end = length;
    if (length >= 8 && length < dgram.length) this.issue('warning', `UDP Length ${length} is shorter than the IP payload (${dgram.length} octets).`);
    const transmitted = num(s.raw.checksum);
    const srcPort = num(s.raw.srcPort);
    const dstPort = num(s.raw.dstPort);
    let checksum: Display[string];
    if (transmitted === 0 && ctx.v6) {
      checksum = { display: '0x0000', note: 'Zero is not allowed over IPv6: the checksum is mandatory there (RFC 8200 section 8.1).' };
      this.issue('warning', 'The UDP checksum is zero. Over IPv6 the checksum is mandatory, and receivers discard such datagrams (RFC 8200 section 8.1).');
    } else if (transmitted === 0) checksum = { display: '0x0000', note: 'Zero means the sender did not compute a checksum, which UDP over IPv4 allows (RFC 768).' };
    else if (!ctx.complete || length !== dgram.length) checksum = { display: hex(transmitted, 4), note: 'Not checked: the datagram is incomplete.' };
    else {
      const r = this.pseudoOk(ctx, 17, dgram);
      checksum = this.checksum('UDP checksum', r.ok, transmitted, r.expected);
    }
    this.layers.push(instance(UDP, dgram, s, { length: `${length} (8 header + ${Math.max(0, length - 8)} data)`, checksum }, `${srcPort} to ${dstPort}, length ${length}`));
    const payload = dgram.subarray(8, end);
    if (!payload.length) return;
    if (!ctx.complete && [53, 67, 68, 123].some((p) => p === srcPort || p === dstPort)) {
      this.data(payload, undefined, 'The datagram is incomplete, so the application data is not decoded.');
      return;
    }
    if (!this.application(payload, srcPort, dstPort)) this.data(payload, undefined, this.portNote(srcPort, dstPort, 'UDP'));
  }

  // ---- ICMP

  icmp(msg: Uint8Array, complete: boolean) {
    if (!this.need(msg, 4, 'An ICMP header')) return;
    const type = msg[0];
    const code = msg[1];
    const transmitted = (msg[2] << 8) | msg[3];
    const expected = internetChecksum(concat(msg.subarray(0, 2), Uint8Array.of(0, 0), msg.subarray(4)));
    const checksum = complete ? this.checksum('ICMP checksum', internetChecksum(msg) === 0, transmitted, expected) : { display: hex(transmitted, 4), note: 'Not checked: the message is incomplete.' };
    const typeName = ICMP_TYPES[type] ?? 'unknown';
    let def: LayerDef = ICMP_OTHER;
    let codeName: string | undefined;
    if (type === 0 || type === 8) def = ICMP_ECHO;
    else if (type === 11) [def, codeName] = [ICMP_TIME, ICMP_TIME_CODES[code]];
    else if (type === 3) [def, codeName] = [code === 4 ? ICMP_FRAG : ICMP_UNREACH, ICMP_UNREACH_CODES[code]];
    if (!this.need(msg, fixedOctets(def.fields), `An ICMP ${typeName} message`)) return;
    const s = slice(def.fields, msg);
    const display: Display = { type: `${type} (${typeName})`, code: codeName ? `${code} (${codeName})` : String(code), checksum };
    if (def === ICMP_ECHO) {
      display.identifier = `${hex(num(s.raw.identifier), 4)} (${num(s.raw.identifier)})`;
      display.sequence = String(num(s.raw.sequence));
      display.data = arr(s.raw.data).length ? `${arr(s.raw.data).length} octets: ${hexBytes(arr(s.raw.data))}` : 'none';
    }
    if ('original' in s.raw) display.original = `${arr(s.raw.original).length} octets of the packet that caused the error`;
    const summary = def === ICMP_ECHO ? `${typeName}, id ${num(s.raw.identifier)}, seq ${num(s.raw.sequence)}` : `${typeName}${codeName ? `, ${codeName}` : ''}`;
    this.layers.push(instance(def, msg, s, display, summary));
  }
}

/** Guess: the input starts with an IPv4 header if version, IHL and header checksum fit. */
function looksLikeIpv4(bytes: Uint8Array): boolean {
  if (bytes.length < 20 || bytes[0] >> 4 !== 4) return false;
  const ihl = bytes[0] & 0x0f;
  const total = (bytes[2] << 8) | bytes[3];
  // Total Length may exceed the input when the packet is cut off; a valid header checksum is strong enough evidence.
  return ihl >= 5 && bytes.length >= ihl * 4 && total >= ihl * 4 && internetChecksum(bytes.subarray(0, ihl * 4)) === 0;
}

/** Guess: the input starts with an IPv6 header if the version is 6 and Payload Length fits the input. */
function looksLikeIpv6(bytes: Uint8Array): boolean {
  if (bytes.length < 40 || bytes[0] >> 4 !== 6) return false;
  const payload = (bytes[4] << 8) | bytes[5];
  return 40 + payload === bytes.length;
}

export function decode(bytes: Uint8Array, start: Start = 'auto'): Decoded {
  const d = new Decoder();
  const first = start === 'auto' ? (looksLikeIpv4(bytes) ? 'ipv4' : looksLikeIpv6(bytes) ? 'ipv6' : 'ethernet') : start;
  if (first === 'ipv4') {
    const used = d.ipv4(bytes);
    if (used < bytes.length) d.issue('info', `${bytes.length - used} octets after the end of the IPv4 packet (Total Length) are ignored.`);
  } else if (first === 'ipv6') {
    const used = d.ipv6(bytes);
    if (used < bytes.length) d.issue('info', `${bytes.length - used} octets after the end of the IPv6 packet (Payload Length) are ignored.`);
  } else d.ethernet(bytes);
  return { layers: d.layers, issues: d.issues, checks: d.checks, start: first, octets: bytes.length };
}
