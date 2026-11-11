import type { LayerDef, LayerInstance, StructDef, StructInstance } from '../schema';
import { buildStruct, type Annotations } from '../lib/build';
import { concat, hex, parseIpv4 } from '../lib/encode';

// DNS message format: RFC 1035 section 4.1. AD and CD bits: RFC 4035 section 3.2 (originally RFC 2535).

const flag = (id: string, name: string, about: string, source = { rfc: 1035, section: '4.1.1' }) => ({ id, name, short: name, bits: 1, about, source });
const count = (id: string, name: string, about: string) => ({ id, name, bits: 16, about, source: { rfc: 1035, section: '4.1.1' } });

export const dnsDef: LayerDef = {
  id: 'dns',
  name: 'DNS message',
  short: 'DNS',
  osi: [7],
  tcpip: 'application',
  about:
    'Queries and responses share one format: a 12-octet header and four sections. Question holds what is asked, Answer the records that answer it, Authority the name servers responsible (in a referral: where to ask next), Additional helpful extra records such as the addresses of those name servers. Over UDP a message is limited to 512 octets unless both sides use EDNS(0) (RFC 6891); larger answers set TC and are retried over TCP.',
  fields: [
    {
      id: 'id',
      name: 'ID',
      bits: 16,
      about:
        'Chosen by the one who sends the query and copied into the response, so responses can be matched to queries. Resolvers choose it at random, together with a random source port, so an off-path attacker cannot guess both and inject a forged response (RFC 5452).',
      source: { rfc: 1035, section: '4.1.1' },
    },
    flag('qr', 'QR', '0 = query, 1 = response.'),
    { id: 'opcode', name: 'Opcode', bits: 4, about: 'Kind of query: 0 = standard query (QUERY). Others are rare (4 NOTIFY, 5 UPDATE).', source: { rfc: 1035, section: '4.1.1' } },
    flag('aa', 'AA', 'Authoritative Answer: set in a response from a name server that is authoritative for the name asked. A resolver answering from its cache does not set it.'),
    flag('tc', 'TC', 'TrunCation: the response did not fit and was cut. The asker should retry over TCP.'),
    flag('rd', 'RD', 'Recursion Desired: set by the asker when the server should do the whole resolution. Copied into the response.'),
    flag('ra', 'RA', 'Recursion Available: set in responses by servers that offer recursion. Root and TLD servers do not.'),
    flag('z', 'Z', 'Reserved, must be zero. RFC 1035 had three Z bits here; DNSSEC turned the other two into AD and CD.'),
    flag('ad', 'AD', 'Authentic Data: the resolver validated the answer with DNSSEC.', { rfc: 4035, section: '3.2.3' }),
    flag('cd', 'CD', 'Checking Disabled: the asker does its own DNSSEC validation and wants the data even if it does not validate.', { rfc: 4035, section: '3.2.2' }),
    { id: 'rcode', name: 'RCODE', bits: 4, about: 'Response code: 0 NOERROR, 1 FORMERR, 2 SERVFAIL, 3 NXDOMAIN (name does not exist), 5 REFUSED.', source: { rfc: 1035, section: '4.1.1' } },
    count('qdcount', 'QDCOUNT', 'Number of entries in the Question section. In practice always 1.'),
    count('ancount', 'ANCOUNT', 'Number of resource records in the Answer section.'),
    count('nscount', 'NSCOUNT', 'Number of resource records in the Authority section.'),
    count('arcount', 'ARCOUNT', 'Number of resource records in the Additional section.'),
    { id: 'question', name: 'Question', bits: 'variable', compact: true, about: 'The question: name, type and class.', source: { rfc: 1035, section: '4.1.2' } },
    { id: 'answer', name: 'Answer', bits: 'variable', compact: true, about: 'Resource records that answer the question.', source: { rfc: 1035, section: '4.1.3' } },
    {
      id: 'authority',
      name: 'Authority',
      bits: 'variable',
      compact: true,
      about: 'NS records of the zone responsible for the name. In a referral this is the delegation: "I do not know, ask these servers".',
      source: { rfc: 1035, section: '4.1.3' },
    },
    {
      id: 'additional',
      name: 'Additional',
      bits: 'variable',
      compact: true,
      about: 'Records that help the asker, for example the addresses of the name servers in the Authority section ("glue"), so it does not have to look them up first.',
      source: { rfc: 1035, section: '4.1.3' },
    },
  ],
  sources: [{ rfc: 1034 }, { rfc: 1035 }, { rfc: 4035, section: '3.2' }],
};

const nameField = (about: string) => ({
  id: 'name',
  name: 'NAME',
  bits: 'variable' as const,
  about: `${about} Encoded as labels, each with a length octet, ending with a zero octet. A name, or the end of one, that already appeared in the message can be replaced by a 2-octet pointer (first two bits 11, then the offset), see RFC 1035 section 4.1.4.`,
});

export const dnsQuestionDef: StructDef = {
  id: 'dns-question',
  name: 'Question',
  about: 'One question: the domain name, the record type and the class.',
  fields: [
    { ...nameField('QNAME: the domain name asked for.'), id: 'qname', name: 'QNAME' },
    { id: 'qtype', name: 'QTYPE', bits: 16, about: 'Record type asked for: 1 = A (IPv4 address), 2 = NS, 28 = AAAA (IPv6 address).' },
    { id: 'qclass', name: 'QCLASS', bits: 16, about: 'Class: 1 = IN (Internet). Practically always 1.' },
  ],
  sources: [{ rfc: 1035, section: '4.1.2' }],
};

export const dnsRrDef: StructDef = {
  id: 'dns-rr',
  name: 'Resource record',
  about: 'One resource record: owner name, type, class, time to live and data.',
  fields: [
    nameField('Owner name of the record.'),
    { id: 'type', name: 'TYPE', bits: 16, about: 'Record type: 1 = A, 2 = NS, 5 = CNAME, 28 = AAAA.' },
    { id: 'class', name: 'CLASS', bits: 16, about: '1 = IN (Internet).' },
    {
      id: 'ttl',
      name: 'TTL',
      bits: 32,
      about: 'Seconds the record may be cached. A resolver that answers from its cache counts it down, so later answers show less.',
    },
    { id: 'rdlength', name: 'RDLENGTH', bits: 16, about: 'Length of RDATA in octets.' },
    { id: 'rdata', name: 'RDATA', bits: 'variable', about: 'The data: for A four octets of IPv4 address, for NS a domain name (which may be compressed).' },
  ],
  sources: [{ rfc: 1035, section: '4.1.3' }],
};

/**
 * The OPT pseudo-record of EDNS(0). It has the outline of a resource record, but CLASS and TTL carry other values.
 * RFC 6891 sections 6.1.2 and 6.1.3.
 */
export const dnsOptDef: StructDef = {
  id: 'dns-opt',
  name: 'OPT pseudo-record (EDNS)',
  about:
    'EDNS(0) extends DNS without changing the header: the sender adds one OPT record to the Additional section. It is not data about a name. It tells the other side how large a UDP message the sender can take, carries more flag and response code bits, and can hold options. A message may contain only one OPT record.',
  fields: [
    { id: 'name', name: 'NAME', bits: 8, about: 'Always the root name: a single zero octet.', source: { rfc: 6891, section: '6.1.2' } },
    { id: 'type', name: 'TYPE', bits: 16, about: '41 = OPT.', source: { rfc: 6891, section: '6.1.1' } },
    {
      id: 'udpSize',
      name: 'CLASS (UDP payload size)',
      bits: 16,
      about: 'In place of the class: the largest UDP message, in octets, that the sender can receive. Values below 512 count as 512.',
      source: { rfc: 6891, section: '6.2.3' },
    },
    {
      id: 'extRcode',
      name: 'EXTENDED-RCODE',
      bits: 8,
      about: 'The first part of the TTL field. These are the upper 8 bits of a 12-bit response code; the RCODE in the header holds the lower 4.',
      source: { rfc: 6891, section: '6.1.3' },
    },
    { id: 'version', name: 'VERSION', bits: 8, about: 'EDNS version of the sender. 0 is the version RFC 6891 defines.', source: { rfc: 6891, section: '6.1.3' } },
    { id: 'do', name: 'DO', short: 'DO', bits: 1, about: 'DNSSEC OK: the sender can handle DNSSEC records and wants them in the response.', source: { rfc: 6891, section: '6.1.4' } },
    { id: 'z', name: 'Z', bits: 15, about: 'Reserved. Senders set it to zero, receivers ignore it.', source: { rfc: 6891, section: '6.1.3' } },
    { id: 'rdlength', name: 'RDLENGTH', bits: 16, about: 'Length of the options in octets.', source: { rfc: 6891, section: '6.1.2' } },
    {
      id: 'rdata',
      name: 'RDATA',
      bits: 'variable',
      about: 'Zero or more options, each with a 16-bit OPTION-CODE, a 16-bit OPTION-LENGTH and its data.',
      source: { rfc: 6891, section: '6.1.2' },
    },
  ],
  sources: [{ rfc: 6891, section: '6.1' }],
};

/** Record types by number. Source: IANA Resource Record (RR) TYPEs registry. */
export const DNS_TYPES: Record<number, string> = {
  1: 'A',
  2: 'NS',
  5: 'CNAME',
  6: 'SOA',
  12: 'PTR',
  15: 'MX',
  16: 'TXT',
  28: 'AAAA',
  33: 'SRV',
  35: 'NAPTR',
  41: 'OPT',
  43: 'DS',
  46: 'RRSIG',
  47: 'NSEC',
  48: 'DNSKEY',
  50: 'NSEC3',
  52: 'TLSA',
  64: 'SVCB',
  65: 'HTTPS',
  252: 'AXFR',
  255: 'ANY',
  257: 'CAA',
};
/** Classes by number. Source: IANA DNS CLASSes registry. */
export const DNS_CLASSES: Record<number, string> = { 1: 'IN', 3: 'CH', 4: 'HS', 254: 'NONE', 255: 'ANY' };
/** Source: IANA DNS OpCodes registry. */
export const DNS_OPCODES: Record<number, string> = { 0: 'QUERY', 1: 'IQUERY', 2: 'STATUS', 4: 'NOTIFY', 5: 'UPDATE', 6: 'DSO' };
/** Source: IANA DNS RCODEs registry. */
export const DNS_RCODES: Record<number, string> = {
  0: 'NOERROR',
  1: 'FORMERR',
  2: 'SERVFAIL',
  3: 'NXDOMAIN',
  4: 'NOTIMP',
  5: 'REFUSED',
  6: 'YXDOMAIN',
  7: 'YXRRSET',
  8: 'NXRRSET',
  9: 'NOTAUTH',
  10: 'NOTZONE',
};

const named = (n: number, names: Record<number, string>) => (names[n] ? `${n} (${names[n]})` : String(n));
export const dnsTypeDisplay = (type: number) => named(type, DNS_TYPES);
export const dnsClassDisplay = (cls: number) => named(cls, DNS_CLASSES);
export const dnsOpcodeDisplay = (opcode: number) => named(opcode, DNS_OPCODES);
export const dnsRcodeDisplay = (rcode: number) => named(rcode, DNS_RCODES);

/** A time to live in seconds, with hours or minutes where that is easier to read. */
export function dnsTtlDisplay(ttl: number): string {
  if (ttl >= 3600) return `${ttl} s (${+(ttl / 3600).toFixed(2)} h)`;
  if (ttl >= 60) return `${ttl} s (${+(ttl / 60).toFixed(2)} min)`;
  return `${ttl} s`;
}

export type RrType = 'A' | 'NS';
const TYPE_CODE: Record<RrType, number> = { A: 1, NS: 2 };

export interface DnsRr {
  name: string;
  type: RrType;
  ttl: number;
  data: string;
  /** Explanation attached to the record. */
  note?: string;
}

export interface DnsParams extends Annotations {
  id: number;
  response: boolean;
  aa?: boolean;
  rd: boolean;
  ra?: boolean;
  rcode?: number;
  question: { name: string; type: RrType };
  answer?: DnsRr[];
  authority?: DnsRr[];
  additional?: DnsRr[];
}

/** Writes names with message compression, tracking where each suffix first appeared. */
class NameWriter {
  private seen = new Map<string, number>();

  /** Encodes `name` at message offset `at`. Returns bytes and a description of what was compressed. */
  encode(name: string, at: number): { bytes: Uint8Array; display: string } {
    const labels = name.split('.');
    const parts: Uint8Array[] = [];
    let offset = at;
    for (let i = 0; i < labels.length; i++) {
      const suffix = labels.slice(i).join('.').toLowerCase();
      const ptr = this.seen.get(suffix);
      if (ptr !== undefined) {
        parts.push(Uint8Array.of(0xc0 | (ptr >> 8), ptr & 0xff));
        const literal = labels.slice(0, i);
        const display = literal.length
          ? `${name} (label${literal.length > 1 ? 's' : ''} ${literal.map((l) => `"${l}"`).join(', ')}, then pointer to offset ${ptr})`
          : `${name} (pointer to offset ${ptr}, ${hex(0xc000 | ptr, 4)})`;
        return { bytes: concat(...parts), display };
      }
      if (offset < 0x4000) this.seen.set(suffix, offset);
      const label = new TextEncoder().encode(labels[i]);
      parts.push(Uint8Array.of(label.length), label);
      offset += 1 + label.length;
    }
    parts.push(Uint8Array.of(0));
    return { bytes: concat(...parts), display: `${name} (${labels.length} labels, ${offset + 1 - at} octets, not compressed)` };
  }
}

function rrSummary(r: DnsRr): string {
  return `${r.name} ${r.type} ${r.data}`;
}

export function dns(p: DnsParams): LayerInstance {
  const names = new NameWriter();
  let pos = 12;

  const q = names.encode(p.question.name, pos);
  const question = buildStruct(
    dnsQuestionDef,
    {
      qname: { raw: q.bytes, display: q.display },
      qtype: { raw: TYPE_CODE[p.question.type], display: `${TYPE_CODE[p.question.type]} (${p.question.type})` },
      qclass: { raw: 1, display: '1 (IN)' },
    },
    {},
    `${p.question.name} ${p.question.type}`,
  );
  pos += question.bytes.length;

  const record = (r: DnsRr): StructInstance => {
    const n = names.encode(r.name, pos);
    const rdataAt = pos + n.bytes.length + 10;
    let rdata: { bytes: Uint8Array; display: string };
    if (r.type === 'A') rdata = { bytes: parseIpv4(r.data), display: r.data };
    else rdata = names.encode(r.data, rdataAt);
    const inst = buildStruct(
      dnsRrDef,
      {
        name: { raw: n.bytes, display: n.display },
        type: { raw: TYPE_CODE[r.type], display: `${TYPE_CODE[r.type]} (${r.type})` },
        class: { raw: 1, display: '1 (IN)' },
        ttl: { raw: r.ttl, display: dnsTtlDisplay(r.ttl) },
        rdlength: { raw: rdata.bytes.length, display: String(rdata.bytes.length) },
        rdata: { raw: rdata.bytes, display: rdata.display },
      },
      r.note ? { notes: { name: r.note } } : {},
      rrSummary(r),
    );
    pos += inst.bytes.length;
    return inst;
  };
  const answer = (p.answer ?? []).map(record);
  const authority = (p.authority ?? []).map(record);
  const additional = (p.additional ?? []).map(record);

  const section = (items: StructInstance[]) => ({
    raw: concat(...items.map((i) => i.bytes)),
    display: items.length ? items.map((i) => i.summary).join('; ') : 'empty',
    ...(items.length ? { items } : {}),
  });
  const bit = (v: boolean | undefined) => ({ raw: v ? 1 : 0, display: v ? '1' : '0' });
  const rcode = p.rcode ?? 0;

  const summary = p.response
    ? `Response ${hex(p.id, 4)}: ${answer.length} answer, ${authority.length} authority, ${additional.length} additional`
    : `Query ${hex(p.id, 4)}: ${p.question.name} ${p.question.type}`;

  return buildStruct(
    dnsDef,
    {
      id: { raw: p.id, display: hex(p.id, 4) },
      qr: { raw: p.response ? 1 : 0, display: p.response ? '1 (response)' : '0 (query)' },
      opcode: { raw: 0, display: '0 (QUERY)' },
      aa: bit(p.aa),
      tc: bit(false),
      rd: bit(p.rd),
      ra: bit(p.ra),
      z: bit(false),
      ad: bit(false),
      cd: bit(false),
      rcode: { raw: rcode, display: dnsRcodeDisplay(rcode) },
      qdcount: { raw: 1, display: '1' },
      ancount: { raw: answer.length, display: String(answer.length) },
      nscount: { raw: authority.length, display: String(authority.length) },
      arcount: { raw: additional.length, display: String(additional.length) },
      question: section([question]),
      answer: section(answer),
      authority: section(authority),
      additional: section(additional),
    },
    p,
    summary,
  );
}

/** Wireshark-style info line for a DNS message. */
export function dnsInfo(p: DnsParams): string {
  const head = `${p.response ? 'Standard query response' : 'Standard query'} ${hex(p.id, 4)} ${p.question.type} ${p.question.name}`;
  if (!p.response) return head;
  const recs = [...(p.answer ?? []), ...(p.authority ?? []), ...(p.additional ?? [])].map((r) => `${r.type} ${r.data}`);
  return `${head} ${recs.join(' ')}`;
}
