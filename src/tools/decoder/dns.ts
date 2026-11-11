import type { LayerInstance, StructDef, StructInstance } from '../../shared/schema';
import { dnsDef, dnsOptDef, dnsQuestionDef, dnsRrDef, dnsClassDisplay, dnsOpcodeDisplay, dnsRcodeDisplay, dnsTtlDisplay, dnsTypeDisplay, DNS_RCODES, DNS_TYPES } from '../../shared/headers/dns';
import { formatIpv6 } from '../../shared/lib/ipv6';
import { type Display, forInput, hex, hexBytes, instance, ip4, num, type Report, slice } from './fields';

// DNS messages: RFC 1035 section 4. The decoder walks the four sections record by record
// and resolves compressed names; anything that does not fit is reported, never thrown to the caller.

const DNS = forInput(dnsDef);
const QUESTION = forInput(dnsQuestionDef, {
  fields: dnsQuestionDef.fields.map((f) => (f.id === 'qtype' ? { ...f, about: 'Record type asked for, for example 1 = A (IPv4 address), 2 = NS, 15 = MX, 28 = AAAA (IPv6 address), 255 = any type.' } : f)),
});
const RR = forInput(dnsRrDef, {
  fields: dnsRrDef.fields.map((f) =>
    f.id === 'type'
      ? { ...f, about: 'Record type, for example 1 = A, 2 = NS, 5 = CNAME, 6 = SOA, 12 = PTR, 15 = MX, 16 = TXT, 28 = AAAA, 33 = SRV.' }
      : f.id === 'rdata'
        ? { ...f, about: 'The data. Its layout depends on TYPE: an address for A and AAAA, a domain name (which may be compressed) for NS, CNAME and PTR, a preference and a name for MX, text strings for TXT.' }
        : f,
  ),
  sources: [{ rfc: 1035, section: '4.1.3' }, { rfc: 1035, section: '3.3' }, { rfc: 3596, section: '2.2' }, { rfc: 2782 }],
});
const OPT = forInput(dnsOptDef);

/** A record that cannot be read; the message says why. */
class Malformed extends Error {}

interface Name {
  /** The name in text form, labels joined by dots. */
  text: string;
  /** Text with a description of how the name is encoded. */
  display: string;
  /** Offset of the first octet after the name at the place where it was read. */
  end: number;
}

/** A label as text; octets outside printable ASCII, dots and backslashes are escaped as in zone files (RFC 1035 section 5.1). */
function labelText(b: Uint8Array): string {
  let out = '';
  for (const c of b) out += c === 0x2e || c === 0x5c ? `\\${String.fromCharCode(c)}` : c > 0x20 && c < 0x7f ? String.fromCharCode(c) : `\\${String(c).padStart(3, '0')}`;
  return out;
}

/**
 * Reads a domain name at offset `at` and follows compression pointers (RFC 1035 section 4.1.4).
 * A pointer has to refer to an earlier place in the message. Enforcing this also rules out loops:
 * every jump lands before the start of the part just read, so the offsets only decrease.
 */
export function readName(msg: Uint8Array, at: number): Name {
  const labels: string[] = [];
  let pos = at;
  let end = -1;
  let before = at;
  let pointer: number | undefined;
  let literal = 0;
  let octets = 1;
  for (;;) {
    if (pos >= msg.length) throw new Malformed(`the name at offset ${at} runs past the end of the message`);
    const len = msg[pos];
    if ((len & 0xc0) === 0xc0) {
      if (pos + 1 >= msg.length) throw new Malformed(`the compression pointer at offset ${pos} is cut off`);
      const target = ((len & 0x3f) << 8) | msg[pos + 1];
      if (end < 0) end = pos + 2;
      if (pointer === undefined) {
        pointer = target;
        literal = labels.length;
      }
      if (target >= before) throw new Malformed(`the compression pointer at offset ${pos} points to offset ${target}, which is not an earlier name. Following it could loop forever (RFC 1035 section 4.1.4)`);
      before = target;
      pos = target;
      continue;
    }
    if (len & 0xc0) throw new Malformed(`the label at offset ${pos} starts with the bits ${len >> 6 === 1 ? '01' : '10'}, which are reserved (RFC 1035 section 4.1.4)`);
    if (len === 0) {
      if (end < 0) end = pos + 1;
      break;
    }
    if (pos + 1 + len > msg.length) throw new Malformed(`the label at offset ${pos} runs past the end of the message`);
    octets += 1 + len;
    if (octets > 255) throw new Malformed(`the name at offset ${at} is longer than 255 octets (RFC 1035 section 2.3.4)`);
    labels.push(labelText(msg.subarray(pos + 1, pos + 1 + len)));
    pos += 1 + len;
  }
  const text = labels.length ? labels.join('.') : '.';
  let display: string;
  if (pointer === undefined) display = labels.length ? `${text} (${labels.length} labels, ${end - at} octets, not compressed)` : '. (the root: a single zero octet)';
  else if (literal === 0) display = `${text} (pointer to offset ${pointer}, ${hex(0xc000 | pointer, 4)})`;
  else display = `${text} (label${literal > 1 ? 's' : ''} ${labels.slice(0, literal).map((l) => `"${l}"`).join(', ')}, then pointer to offset ${pointer})`;
  return { text, display, end };
}

const u16 = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1];
const u32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
const typeName = (type: number) => DNS_TYPES[type] ?? `TYPE${type}`;

/** RDATA of the common record types. `text` goes into the one-line summary. */
function rdata(msg: Uint8Array, type: number, at: number, len: number): { display: string; text: string } {
  const end = at + len;
  const data = msg.subarray(at, end);
  const nameIn = (from: number, last: boolean): Name => {
    const n = readName(msg, from);
    if (n.end > end || (last && n.end !== end)) throw new Malformed(`the name in RDATA does not fit RDLENGTH ${len}`);
    return n;
  };
  const fixed = (octets: number) => {
    if (len !== octets) throw new Malformed(`RDLENGTH is ${len}, but the data of type ${typeName(type)} is ${octets} octets long`);
  };
  switch (type) {
    case 1: {
      fixed(4);
      return { display: ip4(data), text: ip4(data) };
    }
    case 28: {
      fixed(16);
      return { display: formatIpv6(data), text: formatIpv6(data) };
    }
    case 2:
    case 5:
    case 12: {
      const n = nameIn(at, true);
      return { display: n.display, text: n.text };
    }
    case 15: {
      if (len < 3) throw new Malformed('RDATA of an MX record is too short');
      const n = nameIn(at + 2, true);
      return { display: `preference ${u16(msg, at)}, exchange ${n.display}`, text: `${u16(msg, at)} ${n.text}` };
    }
    case 6: {
      const mname = nameIn(at, false);
      const rname = nameIn(mname.end, false);
      if (rname.end + 20 !== end) throw new Malformed(`the five 32-bit values of an SOA record do not fit RDLENGTH ${len}`);
      const v = [0, 4, 8, 12, 16].map((o) => u32(msg, rname.end + o));
      return {
        display: `MNAME ${mname.text}, RNAME ${rname.text}, SERIAL ${v[0]}, REFRESH ${v[1]} s, RETRY ${v[2]} s, EXPIRE ${v[3]} s, MINIMUM ${v[4]} s`,
        text: `${mname.text} ${rname.text} ${v[0]}`,
      };
    }
    case 16: {
      const strings: string[] = [];
      for (let i = 0; i < len; ) {
        const n = data[i];
        if (i + 1 + n > len) throw new Malformed('a character-string in the TXT record runs past RDLENGTH');
        strings.push(`"${Array.from(data.subarray(i + 1, i + 1 + n), (c) => (c >= 0x20 && c < 0x7f && c !== 0x22 && c !== 0x5c ? String.fromCharCode(c) : `\\${String(c).padStart(3, '0')}`)).join('')}"`);
        i += 1 + n;
      }
      const text = strings.join(' ');
      return { display: text || 'empty', text: text.length > 60 ? `${text.slice(0, 57)}...` : text };
    }
    case 33: {
      if (len < 7) throw new Malformed('RDATA of an SRV record is too short');
      const n = nameIn(at + 6, true);
      return { display: `priority ${u16(msg, at)}, weight ${u16(msg, at + 2)}, port ${u16(msg, at + 4)}, target ${n.text}`, text: `${u16(msg, at)} ${u16(msg, at + 2)} ${u16(msg, at + 4)} ${n.text}` };
    }
    default:
      return { display: len ? `${len} octets: ${hexBytes(data)}` : 'none', text: len ? `(${len} octets)` : '' };
  }
}

function question(msg: Uint8Array, at: number): StructInstance {
  const name = readName(msg, at);
  if (name.end + 4 > msg.length) throw new Malformed('QTYPE and QCLASS are cut off');
  const b = msg.subarray(at, name.end + 4);
  const s = slice(QUESTION.fields, b, { qname: name.end - at });
  const qtype = num(s.raw.qtype);
  return instance(QUESTION, b, s, { qname: name.display, qtype: dnsTypeDisplay(qtype), qclass: dnsClassDisplay(num(s.raw.qclass)) }, `${name.text} ${typeName(qtype)}`);
}

function record(msg: Uint8Array, at: number, section: string, report: Report, header: { rcode: number }): StructInstance {
  const name = readName(msg, at);
  const fixed = name.end;
  if (fixed + 10 > msg.length) throw new Malformed('TYPE, CLASS, TTL and RDLENGTH are cut off');
  const type = u16(msg, fixed);
  const rdlength = u16(msg, fixed + 8);
  const end = fixed + 10 + rdlength;
  if (end > msg.length) throw new Malformed(`RDLENGTH says ${rdlength} octets, but only ${msg.length - fixed - 10} are left`);
  const b = msg.subarray(at, end);

  if (type === 41 && name.end - at === 1) {
    const s = slice(OPT.fields, b, { rdata: rdlength });
    const size = num(s.raw.udpSize);
    const ext = num(s.raw.extRcode);
    const version = num(s.raw.version);
    const options: string[] = [];
    for (let i = fixed + 10; i < end; ) {
      if (i + 4 > end || i + 4 + u16(msg, i + 2) > end) {
        report('warning', 'An option in the EDNS OPT record runs past its RDLENGTH.');
        options.push('cut off');
        break;
      }
      options.push(`option ${u16(msg, i)} with ${u16(msg, i + 2)} octets`);
      i += 4 + u16(msg, i + 2);
    }
    if (section !== 'Additional') report('warning', `The EDNS OPT record is in the ${section} section. It belongs in the Additional section (RFC 6891 section 6.1.1).`);
    const full = (ext << 4) | header.rcode;
    const display: Display = {
      name: '0 (root)',
      type: '41 (OPT)',
      udpSize: size < 512 ? { display: `${size} octets`, note: 'Values below 512 are treated as 512 (RFC 6891 section 6.2.3).' } : `${size} octets`,
      extRcode: ext ? { display: String(ext), note: `Together with the RCODE of the header: ${full}${DNS_RCODES[full] ? ` (${DNS_RCODES[full]})` : ''}.` } : '0',
      version: String(version),
      do: String(num(s.raw.do)),
      z: String(num(s.raw.z)),
      rdlength: String(rdlength),
      rdata: options.length ? options.join(', ') : 'no options',
    };
    return instance(OPT, b, s, display, `OPT: EDNS version ${version}, UDP payload ${size}${num(s.raw.do) ? ', DO' : ''}`);
  }

  const s = slice(RR.fields, b, { name: name.end - at, rdata: rdlength });
  const cls = num(s.raw.class);
  let data: { display: string | { display: string; note: string }; text: string };
  const opaque = rdlength ? `${rdlength} octets: ${hexBytes(msg.subarray(fixed + 10, end))}` : 'none';
  // A and AAAA are defined for class IN; the types of RFC 1035 section 3.3 have the same layout in every class.
  if (cls !== 1 && (type === 1 || type === 28 || type === 33)) data = { display: opaque, text: '' };
  else {
    try {
      data = rdata(msg, type, fixed + 10, rdlength);
    } catch (e) {
      if (!(e instanceof Malformed)) throw e;
      // The record still ends where RDLENGTH says, so the records after it can be read.
      report('error', `DNS ${section} section, record of ${name.text}: ${e.message}.`);
      data = { display: { display: opaque, note: 'Not decoded: the data does not have the layout of this record type.' }, text: '(malformed)' };
    }
  }
  return instance(
    RR as StructDef,
    b,
    s,
    { name: name.display, type: dnsTypeDisplay(type), class: dnsClassDisplay(cls), ttl: dnsTtlDisplay(num(s.raw.ttl)), rdlength: String(rdlength), rdata: data.display },
    `${name.text} ${typeName(type)} ${data.text}`.trim(),
  );
}

/** Decodes a DNS message as carried in one UDP datagram. Returns nothing when not even the header fits. */
export function decodeDns(msg: Uint8Array, report: Report): LayerInstance | undefined {
  if (msg.length < 12) {
    report('error', `A DNS header needs 12 octets, but only ${msg.length} are left. The input is cut off.`);
    return undefined;
  }
  const counts = [u16(msg, 4), u16(msg, 6), u16(msg, 8), u16(msg, 10)];
  const tc = (msg[2] & 0x02) !== 0;
  const rcode = msg[3] & 0x0f;
  const sections = ['Question', 'Answer', 'Authority', 'Additional'] as const;
  const items: StructInstance[][] = [[], [], [], []];
  const lengths = [0, 0, 0, 0];
  const undecoded = [0, 0, 0, 0];
  let pos = 12;
  let failed = false;
  for (let sec = 0; sec < 4 && !failed; sec++) {
    const start = pos;
    for (let i = 0; i < counts[sec]; i++) {
      try {
        const item = sec === 0 ? question(msg, pos) : record(msg, pos, sections[sec], report, { rcode });
        items[sec].push(item);
        pos += item.bytes.length;
      } catch (e) {
        if (!(e instanceof Malformed)) throw e;
        const what = `${sections[sec]} section, entry ${i + 1} of ${counts[sec]}`;
        // A response with TC set was cut to fit the datagram, so missing records are expected.
        if (tc && pos >= msg.length) report('info', `${what}: the message ends here. The TC bit is set, so the sender cut the response to fit; the asker repeats the query over TCP.`);
        else report('error', `DNS ${what}: ${e.message}. The rest of the message is not decoded.`);
        undecoded[sec] = msg.length - pos;
        pos = msg.length;
        failed = true;
        break;
      }
    }
    lengths[sec] = pos - start;
  }
  if (!failed && pos < msg.length) report('warning', `${msg.length - pos} octets follow the last record that the counts in the DNS header announce.`);
  if (items.flat().filter((i) => i.def.id === 'dns-opt').length > 1) report('warning', 'The message has more than one EDNS OPT record; only one is allowed (RFC 6891 section 6.1.1).');

  const s = slice(DNS.fields, msg.subarray(0, pos), { question: lengths[0], answer: lengths[1], authority: lengths[2], additional: lengths[3] });
  const section = (sec: number) => {
    const parts = items[sec].map((i) => i.summary!);
    if (undecoded[sec]) parts.push(`${undecoded[sec]} octets not decoded`);
    return { display: parts.length ? parts.join('; ') : 'empty', ...(items[sec].length ? { items: items[sec] } : {}) };
  };
  const flag = (id: string) => String(num(s.raw[id]));
  const id = hex(num(s.raw.id), 4);
  const qr = num(s.raw.qr);
  const display: Display = {
    id,
    qr: qr ? '1 (response)' : '0 (query)',
    opcode: dnsOpcodeDisplay(num(s.raw.opcode)),
    aa: flag('aa'),
    tc: flag('tc'),
    rd: flag('rd'),
    ra: flag('ra'),
    z: num(s.raw.z) ? { display: '1', note: 'Must be zero.' } : '0',
    ad: flag('ad'),
    cd: flag('cd'),
    rcode: dnsRcodeDisplay(rcode),
    question: section(0),
    answer: section(1),
    authority: section(2),
    additional: section(3),
  };
  sections.forEach((_, sec) => (display[['qdcount', 'ancount', 'nscount', 'arcount'][sec]] = String(counts[sec])));
  const summary = qr ? `Response ${id}: ${counts[1]} answer, ${counts[2]} authority, ${counts[3]} additional` : `Query ${id}${items[0].length ? `: ${items[0][0].summary}` : ''}`;
  return instance(DNS, msg, s, display, summary);
}
