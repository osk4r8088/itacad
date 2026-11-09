import { randomBytes } from '../../protocols/exchanges/common';
import { base64, canonicalCompare, dsDigest, encodeRdata, hexUpper, keyTag, labels, rrsigTime, type Rdata, type Record, type RrType } from './wire';

// The example zone example.com. Addresses match the rest of the site: www.example.com is
// 203.0.113.80 (as in the DNS, TLS and HTTP exchanges) and ns1.example.com is 203.0.113.53.

export const ORIGIN = 'example.com.';
const TTL = 3600;

const KEY: Rdata = { type: 'DNSKEY', flags: 257, protocol: 3, algorithm: 15, publicKey: randomBytes(32, 0xd5ec) };
export const KEY_TAG = keyTag(encodeRdata(KEY));
const DKIM_KEY = base64(randomBytes(32, 0xd41a));

const inception = Date.UTC(2026, 10, 1) / 1000;
const expiration = Date.UTC(2026, 11, 1) / 1000;

const r = (owner: string, rdata: Rdata, ttl = TTL): Record => ({ owner, ttl, rdata });

const ZONE_RECORDS: Record[] = [
  r('example.com.', { type: 'SOA', mname: 'ns1.example.com.', rname: 'hostmaster.example.com.', serial: 2026110901, refresh: 7200, retry: 3600, expire: 1209600, minimum: 3600 }),
  r('example.com.', { type: 'NS', target: 'ns1.example.com.' }),
  r('example.com.', { type: 'NS', target: 'ns2.example.net.' }),
  r('example.com.', { type: 'A', address: '203.0.113.80' }),
  r('example.com.', { type: 'AAAA', address: '2001:db8::80' }),
  r('example.com.', { type: 'MX', preference: 10, exchange: 'mail.example.com.' }),
  r('example.com.', { type: 'MX', preference: 20, exchange: 'mail.example.net.' }),
  r('example.com.', { type: 'TXT', strings: ['v=spf1 mx -all'] }),
  r('example.com.', { type: 'CAA', flags: 0, tag: 'issue', value: 'ca.example.net' }),
  r('example.com.', KEY),
  r('ns1.example.com.', { type: 'A', address: '203.0.113.53' }),
  r('www.example.com.', { type: 'A', address: '203.0.113.80' }),
  r('www.example.com.', { type: 'AAAA', address: '2001:db8::80' }),
  r('www.example.com.', { type: 'HTTPS', priority: 1, target: '.', alpn: ['h2', 'h3'], ipv4hint: ['203.0.113.80'], ipv6hint: ['2001:db8::80'] }),
  r('www.example.com.', {
    type: 'RRSIG',
    typeCovered: 'A',
    algorithm: 15,
    labels: 3,
    originalTtl: TTL,
    expiration,
    inception,
    keyTag: KEY_TAG,
    signer: 'example.com.',
    signature: randomBytes(64, 0x5196),
  }),
  r('blog.example.com.', { type: 'CNAME', target: 'www.example.com.' }),
  r('mail.example.com.', { type: 'A', address: '203.0.113.25' }),
  r('_imaps._tcp.example.com.', { type: 'SRV', priority: 0, weight: 1, port: 993, target: 'mail.example.com.' }),
  r('_dmarc.example.com.', { type: 'TXT', strings: ['v=DMARC1; p=reject; rua=mailto:dmarc-reports@example.com'] }),
  r('2026a._domainkey.example.com.', { type: 'TXT', strings: [`v=DKIM1; k=ed25519; p=${DKIM_KEY}`] }),
];

/** Owner names in canonical order, and the types at each, for the NSEC chain. */
function nsecChain(records: Record[]): Record[] {
  const owners = [...new Set(records.map((x) => x.owner))].sort(canonicalCompare);
  return owners.map((owner, i) => {
    const types = new Set<RrType>([...records.filter((x) => x.owner === owner).map((x) => x.rdata.type), 'RRSIG', 'NSEC']);
    return r(owner, { type: 'NSEC', next: owners[(i + 1) % owners.length], types: [...types] }, 3600);
  });
}

/** The NSEC record of the apex; a signed zone has one per name, forming a ring. */
export const NSEC_CHAIN = nsecChain(ZONE_RECORDS);

export const ZONE: Record[] = [...ZONE_RECORDS, NSEC_CHAIN[0]];

/** Records that live in other zones but belong to the story. */
export const OTHER: { zone: string; about: string; record: Record }[] = [
  {
    zone: 'com.',
    about: 'Published by the parent zone com, set through the registrar: the hash of the example.com key.',
    record: r('example.com.', { type: 'DS', keyTag: KEY_TAG, algorithm: 15, digestType: 2, digest: dsDigest('example.com.', encodeRdata(KEY)) }, 86400),
  },
  {
    zone: 'com.',
    about: 'The delegation in the parent zone, with glue for the name server inside example.com.',
    record: r('example.com.', { type: 'NS', target: 'ns1.example.com.' }, 172800),
  },
  {
    zone: '113.0.203.in-addr.arpa.',
    about: 'Reverse zone of 203.0.113.0/24, run by whoever holds the address block.',
    record: r('80.113.0.203.in-addr.arpa.', { type: 'PTR', target: 'www.example.com.' }),
  },
];

/** A note for records whose data is example data rather than a real key or signature. */
export function illustrative(rec: Record): string | undefined {
  if (rec.rdata.type === 'RRSIG') return 'The signature is random example data. A real one is computed with the private key of the zone; key tag, times, labels and all other fields are consistent.';
  if (rec.rdata.type === 'DNSKEY') return 'The public key is random example data of the right length for Ed25519. The key tag and the DS digest in the parent are computed from it.';
  if (rec.owner.includes('._domainkey.')) return 'The DKIM key is random example data of the right length for Ed25519 (RFC 8463).';
  return undefined;
}

// ---- presentation format (zone file)

const quote = (s: string) => `"${s.replace(/["\\]/g, (c) => `\\${c}`)}"`;

export function presentRdata(rd: Rdata): string {
  switch (rd.type) {
    case 'A':
    case 'AAAA':
      return rd.address;
    case 'NS':
    case 'CNAME':
    case 'PTR':
      return rd.target;
    case 'MX':
      return `${rd.preference} ${rd.exchange}`;
    case 'TXT':
      return rd.strings.map(quote).join(' ');
    case 'SOA':
      return `${rd.mname} ${rd.rname} ${rd.serial} ${rd.refresh} ${rd.retry} ${rd.expire} ${rd.minimum}`;
    case 'SRV':
      return `${rd.priority} ${rd.weight} ${rd.port} ${rd.target}`;
    case 'CAA':
      return `${rd.flags} ${rd.tag} ${quote(rd.value)}`;
    case 'DS':
      return `${rd.keyTag} ${rd.algorithm} ${rd.digestType} ${hexUpper(rd.digest)}`;
    case 'DNSKEY':
      return `${rd.flags} ${rd.protocol} ${rd.algorithm} ${base64(rd.publicKey)}`;
    case 'RRSIG':
      return `${rd.typeCovered} ${rd.algorithm} ${rd.labels} ${rd.originalTtl} ${rrsigTime(rd.expiration)} ${rrsigTime(rd.inception)} ${rd.keyTag} ${rd.signer} ${base64(rd.signature)}`;
    case 'NSEC':
      return `${rd.next} ${rd.types.join(' ')}`;
    case 'HTTPS': {
      const params = [rd.alpn && `alpn=${rd.alpn.join(',')}`, rd.ipv4hint && `ipv4hint=${rd.ipv4hint.join(',')}`, rd.ipv6hint && `ipv6hint=${rd.ipv6hint.join(',')}`].filter(Boolean);
      return [rd.priority, rd.target, ...params].join(' ');
    }
  }
}

/** One record as a zone file line: owner, TTL, class, type, RDATA. */
export function present(rec: Record): { owner: string; ttl: string; cls: string; type: string; rdata: string } {
  return { owner: rec.owner, ttl: String(rec.ttl), cls: 'IN', type: rec.rdata.type, rdata: presentRdata(rec.rdata) };
}

/** Owner relative to the origin, as written in a zone file: "@" for the apex, "www" for www.example.com. */
export function relative(owner: string, origin = ORIGIN): string {
  if (owner === origin) return '@';
  return owner.endsWith(`.${origin}`) ? owner.slice(0, -origin.length - 1) : owner;
}

export function labelCount(owner: string): number {
  return labels(owner).length;
}
