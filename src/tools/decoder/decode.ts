import type { FieldDef, FieldValue, LayerDef, LayerInstance, StructDef, StructInstance } from '../../shared/schema';
import { ethernetDef } from '../../shared/headers/ethernet';
import { ipv4Def } from '../../shared/headers/ipv4';
import { tcpDef, optEolDef, optNopDef, optMssDef, optWsDef, optSackPermDef, optTsDef } from '../../shared/headers/tcp';
import { udpDef } from '../../shared/headers/udp';
import { arpDef } from '../../shared/headers/arp';
import { vlanDef, vlanDisplay, vlanSummary } from '../../shared/headers/vlan';
import { icmpEchoDef, icmpTimeExceededDef, icmpDestUnreachableDef, icmpFragNeededDef } from '../../shared/headers/icmp';
import { concat, crc32, internetChecksum } from '../../shared/lib/encode';

// The decoder reads real bytes with the header definitions from src/shared/headers:
// field names, sizes, explanations and sources are the same as in the protocol exchanges.

export type Start = 'auto' | 'ethernet' | 'ipv4';

export interface Issue {
  level: 'error' | 'warning' | 'info';
  text: string;
}

export interface Check {
  label: string;
  ok: boolean;
}

export interface Decoded {
  layers: LayerInstance[];
  issues: Issue[];
  checks: Check[];
  start: 'ethernet' | 'ipv4';
  octets: number;
}

// ---- definitions adapted for real input

/** Removes sentences that only make sense for the generated examples of the exchanges. */
const stripExample = (text: string) => text.replace(/[^.]*\bthis example\b[^.]*\.\s*/g, '').trim();

function forInput<D extends StructDef>(def: D, extra: Partial<D> = {}): D {
  const field = (f: FieldDef): FieldDef => ({ ...f, about: stripExample(f.about) });
  return {
    ...def,
    about: stripExample(def.about),
    fields: def.fields.map(field),
    ...(def.trailer ? { trailer: def.trailer.map(field) } : {}),
    ...extra,
  };
}

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
  about: 'The bytes after the last decoded header. The decoder does not interpret them; the port numbers usually tell which application protocol it is.',
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
const IP_PROTOCOLS: Record<number, string> = { 1: 'ICMP', 2: 'IGMP', 6: 'TCP', 17: 'UDP', 41: 'IPv6 encapsulation', 47: 'GRE', 50: 'ESP', 51: 'AH', 58: 'ICMPv6', 89: 'OSPF', 132: 'SCTP' };
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

const hex = (n: number, digits: number) => `0x${n.toString(16).padStart(digits, '0')}`;
const mac = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(':');
const ip4 = (b: Uint8Array) => Array.from(b).join('.');
const hexBytes = (b: Uint8Array, max = 32) => Array.from(b.subarray(0, max), (x) => x.toString(16).padStart(2, '0')).join(' ') + (b.length > max ? ` ... (${b.length} octets)` : '');

// ---- generic field slicer

type Raw = number | Uint8Array;

function readBits(bytes: Uint8Array, start: number, bits: number): number {
  let v = 0;
  for (let i = 0; i < bits; i++) {
    const pos = start + i;
    v = v * 2 + ((bytes[pos >> 3] >> (7 - (pos & 7))) & 1);
  }
  return v;
}

/**
 * Cuts a structure into its fields, following the bit widths of the definition.
 * Variable fields take the length given in `varOctets`, or all remaining octets.
 */
function slice(fields: FieldDef[], bytes: Uint8Array, varOctets: Record<string, number> = {}): { raw: Record<string, Raw>; bin: Record<string, Uint8Array>; bits: Record<string, number>; octets: number } {
  const raw: Record<string, Raw> = {};
  const bin: Record<string, Uint8Array> = {};
  const bits: Record<string, number> = {};
  let pos = 0;
  for (const f of fields) {
    if (f.bits === 'variable') {
      const start = pos >> 3;
      const len = varOctets[f.id] ?? bytes.length - start;
      raw[f.id] = bin[f.id] = bytes.slice(start, start + len);
      bits[f.id] = len * 8;
      pos += len * 8;
    } else {
      if (pos % 8 === 0 && f.bits % 8 === 0) bin[f.id] = bytes.slice(pos >> 3, (pos + f.bits) >> 3);
      raw[f.id] = f.bits > 48 ? bin[f.id] : readBits(bytes, pos, f.bits);
      bits[f.id] = f.bits;
      pos += f.bits;
    }
  }
  return { raw, bin, bits, octets: pos >> 3 };
}

/** Length in octets of the fixed part of a definition, before its first variable field. */
function fixedOctets(fields: FieldDef[]): number {
  let bits = 0;
  for (const f of fields) {
    if (f.bits === 'variable') break;
    bits += f.bits;
  }
  return bits / 8;
}

type Display = Record<string, string | { display: string; note?: string; items?: StructInstance[] }>;

function instance<D extends StructDef>(def: D, bytes: Uint8Array, sliced: ReturnType<typeof slice>, display: Display, summary?: string, trailer?: { bytes: Uint8Array; sliced: ReturnType<typeof slice> }): StructInstance<D> {
  const values: Record<string, FieldValue> = {};
  const all = [...def.fields, ...(def.trailer ?? [])];
  for (const f of all) {
    const s = def.trailer?.includes(f) && trailer ? trailer.sliced : sliced;
    const raw = s.raw[f.id];
    const given = display[f.id];
    const fallback = raw instanceof Uint8Array ? (raw.length ? hexBytes(raw) : 'none') : String(raw);
    const d = typeof given === 'string' ? { display: given } : (given ?? { display: fallback });
    values[f.id] = { bits: s.bits[f.id], ...d };
  }
  return {
    def,
    values,
    bytes: bytes.slice(0, sliced.octets),
    ...(trailer ? { trailerBytes: trailer.bytes } : {}),
    ...(summary ? { summary } : {}),
  };
}

const num = (r: Raw) => r as number;
const arr = (r: Raw) => r as Uint8Array;

// ---- decoder state

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
    if (type === 0x8100) return this.vlanTag(body);
    this.issue('info', `EtherType ${hex(type, 4)} (${ETHERTYPES[type] ?? 'unknown'}) is not decoded yet. Supported: IPv4, ARP and 802.1Q VLAN tags.`);
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
    const ctx = { src: s.bin.src, dst: s.bin.dst, complete: !mf && totalLength <= bytes.length };
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

  pseudoOk(ctx: { src: Uint8Array; dst: Uint8Array }, protocol: number, segment: Uint8Array): { ok: boolean; expected: number } {
    const pseudo = concat(ctx.src, ctx.dst, Uint8Array.of(0, protocol, segment.length >> 8, segment.length & 0xff));
    const ok = internetChecksum(concat(pseudo, segment)) === 0;
    const at = protocol === 6 ? 16 : 6;
    const zeroed = concat(segment.subarray(0, at), Uint8Array.of(0, 0), segment.subarray(at + 2));
    let expected = internetChecksum(concat(pseudo, zeroed));
    if (protocol === 17 && expected === 0) expected = 0xffff;
    return { ok, expected };
  }

  portNote(src: number, dst: number): string | undefined {
    const known = [dst, src].find((p) => PORTS[p]);
    return known !== undefined ? `Port ${known} is the well-known port of ${PORTS[known]}; the decoder does not interpret this protocol yet.` : undefined;
  }

  // ---- TCP

  tcp(seg: Uint8Array, ctx: { src: Uint8Array; dst: Uint8Array; complete: boolean }) {
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
    if (payload.length) this.data(payload, undefined, this.portNote(srcPort, dstPort));
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

  udp(dgram: Uint8Array, ctx: { src: Uint8Array; dst: Uint8Array; complete: boolean }) {
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
    if (transmitted === 0) checksum = { display: '0x0000', note: 'Zero means the sender did not compute a checksum, which UDP over IPv4 allows (RFC 768).' };
    else if (!ctx.complete || length !== dgram.length) checksum = { display: hex(transmitted, 4), note: 'Not checked: the datagram is incomplete.' };
    else {
      const r = this.pseudoOk(ctx, 17, dgram);
      checksum = this.checksum('UDP checksum', r.ok, transmitted, r.expected);
    }
    this.layers.push(instance(UDP, dgram, s, { length: `${length} (8 header + ${Math.max(0, length - 8)} data)`, checksum }, `${srcPort} to ${dstPort}, length ${length}`));
    const payload = dgram.subarray(8, end);
    if (payload.length) this.data(payload, undefined, this.portNote(srcPort, dstPort));
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

export function decode(bytes: Uint8Array, start: Start = 'auto'): Decoded {
  const d = new Decoder();
  const first = start === 'auto' ? (looksLikeIpv4(bytes) ? 'ipv4' : 'ethernet') : start;
  if (first === 'ipv4') {
    const used = d.ipv4(bytes);
    if (used < bytes.length) d.issue('info', `${bytes.length - used} octets after the end of the IPv4 packet (Total Length) are ignored.`);
  } else d.ethernet(bytes);
  return { layers: d.layers, issues: d.issues, checks: d.checks, start: first, octets: bytes.length };
}
