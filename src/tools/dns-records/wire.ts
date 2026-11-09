import { sha256 } from './sha256';

// Wire format of resource records (RFC 1035 section 3.2.1) and their RDATA.

export const TYPE_CODES = {
  A: 1,
  NS: 2,
  CNAME: 5,
  SOA: 6,
  PTR: 12,
  MX: 15,
  TXT: 16,
  AAAA: 28,
  SRV: 33,
  DS: 43,
  RRSIG: 46,
  NSEC: 47,
  DNSKEY: 48,
  HTTPS: 65,
  CAA: 257,
} as const;
export type RrType = keyof typeof TYPE_CODES;

export type Rdata =
  | { type: 'A'; address: string }
  | { type: 'AAAA'; address: string }
  | { type: 'NS' | 'CNAME' | 'PTR'; target: string }
  | { type: 'MX'; preference: number; exchange: string }
  | { type: 'TXT'; strings: string[] }
  | { type: 'SOA'; mname: string; rname: string; serial: number; refresh: number; retry: number; expire: number; minimum: number }
  | { type: 'SRV'; priority: number; weight: number; port: number; target: string }
  | { type: 'CAA'; flags: number; tag: string; value: string }
  | { type: 'DS'; keyTag: number; algorithm: number; digestType: number; digest: Uint8Array }
  | { type: 'DNSKEY'; flags: number; protocol: number; algorithm: number; publicKey: Uint8Array }
  | { type: 'RRSIG'; typeCovered: RrType; algorithm: number; labels: number; originalTtl: number; expiration: number; inception: number; keyTag: number; signer: string; signature: Uint8Array }
  | { type: 'NSEC'; next: string; types: RrType[] }
  | { type: 'HTTPS'; priority: number; target: string; alpn?: string[]; ipv4hint?: string[]; ipv6hint?: string[] };

export interface Record {
  /** Fully qualified, with the trailing dot. */
  owner: string;
  ttl: number;
  rdata: Rdata;
}

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const u8 = (n: number) => Uint8Array.of(n & 0xff);
const u16 = (n: number) => Uint8Array.of((n >> 8) & 0xff, n & 0xff);
const u32 = (n: number) => Uint8Array.of((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function labels(name: string): string[] {
  return name === '.' ? [] : name.replace(/\.$/, '').split('.');
}

/** A domain name as labels: a length octet and the label each, then the zero octet of the root. No compression. */
export function encodeName(name: string, lowercase = false): Uint8Array {
  const parts = labels(lowercase ? name.toLowerCase() : name).map((l) => {
    if (l.length === 0 || l.length > 63) throw new Error(`invalid label in ${name}`);
    return concat(u8(l.length), ascii(l));
  });
  return concat(...parts, u8(0));
}

export function encodeIpv4(ip: string): Uint8Array {
  return Uint8Array.from(ip.split('.').map(Number));
}

/** Parses an IPv6 address with optional "::" into 16 octets. */
export function encodeIpv6(ip: string): Uint8Array {
  const [head, tail] = ip.split('::');
  const groups = (s: string | undefined) => (s ? s.split(':').map((g) => parseInt(g, 16)) : []);
  const h = groups(head);
  const t = tail === undefined ? [] : groups(tail);
  const missing = 8 - h.length - t.length;
  if (missing < 0 || (tail === undefined && missing !== 0)) throw new Error(`invalid IPv6 address ${ip}`);
  return concat(...[...h, ...new Array(missing).fill(0), ...t].map(u16));
}

/** Type bit maps of NSEC (RFC 4034 section 4.1.2): per window of 256 types, a bitmap up to the highest type present. */
export function typeBitmaps(types: RrType[]): Uint8Array {
  const codes = [...new Set(types.map((t) => TYPE_CODES[t]))].sort((a, b) => a - b);
  const windows = new Map<number, number[]>();
  for (const c of codes) windows.set(c >> 8, [...(windows.get(c >> 8) ?? []), c & 0xff]);
  const parts: Uint8Array[] = [];
  for (const [win, bits] of windows) {
    const len = (Math.max(...bits) >> 3) + 1;
    const map = new Uint8Array(len);
    for (const b of bits) map[b >> 3] |= 0x80 >> (b & 7);
    parts.push(u8(win), u8(len), map);
  }
  return concat(...parts);
}

function svcParams(r: Extract<Rdata, { type: 'HTTPS' }>): Uint8Array {
  // SvcParams in ascending key order (RFC 9460 section 2.2): alpn = 1, ipv4hint = 4, ipv6hint = 6.
  const params: Uint8Array[] = [];
  const param = (key: number, value: Uint8Array) => params.push(concat(u16(key), u16(value.length), value));
  if (r.alpn) param(1, concat(...r.alpn.map((id) => concat(u8(id.length), ascii(id)))));
  if (r.ipv4hint) param(4, concat(...r.ipv4hint.map(encodeIpv4)));
  if (r.ipv6hint) param(6, concat(...r.ipv6hint.map(encodeIpv6)));
  return concat(...params);
}

/** RDATA parts in wire order, each with the field id it belongs to. */
export function rdataParts(r: Rdata): [string, Uint8Array][] {
  switch (r.type) {
    case 'A':
      return [['address', encodeIpv4(r.address)]];
    case 'AAAA':
      return [['address', encodeIpv6(r.address)]];
    case 'NS':
    case 'CNAME':
    case 'PTR':
      return [['target', encodeName(r.target)]];
    case 'MX':
      return [
        ['preference', u16(r.preference)],
        ['exchange', encodeName(r.exchange)],
      ];
    case 'TXT':
      return [['strings', concat(...r.strings.map((s) => concat(u8(s.length), ascii(s))))]];
    case 'SOA':
      return [
        ['mname', encodeName(r.mname)],
        ['rname', encodeName(r.rname)],
        ['serial', u32(r.serial)],
        ['refresh', u32(r.refresh)],
        ['retry', u32(r.retry)],
        ['expire', u32(r.expire)],
        ['minimum', u32(r.minimum)],
      ];
    case 'SRV':
      return [
        ['priority', u16(r.priority)],
        ['weight', u16(r.weight)],
        ['port', u16(r.port)],
        ['target', encodeName(r.target)],
      ];
    case 'CAA':
      return [
        ['flags', u8(r.flags)],
        ['tagLength', u8(r.tag.length)],
        ['tag', ascii(r.tag)],
        ['value', ascii(r.value)],
      ];
    case 'DS':
      return [
        ['keyTag', u16(r.keyTag)],
        ['algorithm', u8(r.algorithm)],
        ['digestType', u8(r.digestType)],
        ['digest', r.digest],
      ];
    case 'DNSKEY':
      return [
        ['flags', u16(r.flags)],
        ['protocol', u8(r.protocol)],
        ['algorithm', u8(r.algorithm)],
        ['publicKey', r.publicKey],
      ];
    case 'RRSIG':
      return [
        ['typeCovered', u16(TYPE_CODES[r.typeCovered])],
        ['algorithm', u8(r.algorithm)],
        ['labels', u8(r.labels)],
        ['originalTtl', u32(r.originalTtl)],
        ['expiration', u32(r.expiration)],
        ['inception', u32(r.inception)],
        ['keyTag', u16(r.keyTag)],
        ['signer', encodeName(r.signer)],
        ['signature', r.signature],
      ];
    case 'NSEC':
      return [
        ['next', encodeName(r.next)],
        ['typeBitmaps', typeBitmaps(r.types)],
      ];
    case 'HTTPS':
      return [
        ['priority', u16(r.priority)],
        ['target', encodeName(r.target)],
        ['params', svcParams(r)],
      ];
  }
}

export function encodeRdata(r: Rdata): Uint8Array {
  return concat(...rdataParts(r).map(([, b]) => b));
}

/** A whole record on the wire: NAME, TYPE, CLASS (IN = 1), TTL, RDLENGTH, RDATA. */
export function encodeRecord(rec: Record): Uint8Array {
  const rdata = encodeRdata(rec.rdata);
  return concat(encodeName(rec.owner), u16(TYPE_CODES[rec.rdata.type]), u16(1), u32(rec.ttl), u16(rdata.length), rdata);
}

/** Key tag of a DNSKEY (RFC 4034 appendix B), from its RDATA. */
export function keyTag(dnskeyRdata: Uint8Array): number {
  let ac = 0;
  for (let i = 0; i < dnskeyRdata.length; i++) ac += i & 1 ? dnskeyRdata[i] : dnskeyRdata[i] << 8;
  ac += (ac >> 16) & 0xffff;
  return ac & 0xffff;
}

/** SHA-256 DS digest (RFC 4034 section 5.1.4, digest type 2): over the canonical owner name and the DNSKEY RDATA. */
export function dsDigest(owner: string, dnskeyRdata: Uint8Array): Uint8Array {
  return sha256(concat(encodeName(owner, true), dnskeyRdata));
}

/**
 * Canonical DNS name order (RFC 4034 section 6.1): compare labels from the right,
 * case-insensitively, as octet strings; a name sorts before its subdomains.
 */
export function canonicalCompare(a: string, b: string): number {
  const la = labels(a.toLowerCase()).reverse();
  const lb = labels(b.toLowerCase()).reverse();
  for (let i = 0; i < Math.min(la.length, lb.length); i++) {
    if (la[i] === lb[i]) continue;
    const x = ascii(la[i]);
    const y = ascii(lb[i]);
    for (let j = 0; j < Math.min(x.length, y.length); j++) if (x[j] !== y[j]) return x[j] - y[j];
    return x.length - y.length;
  }
  return la.length - lb.length;
}

export const base64 = (b: Uint8Array) => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
};
export const hexUpper = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();

/** RRSIG time stamps in presentation format, YYYYMMDDHHmmSS in UTC (RFC 4034 section 3.2). */
export function rrsigTime(seconds: number): string {
  return new Date(seconds * 1000).toISOString().replace(/[-:T]/g, '').slice(0, 14);
}
