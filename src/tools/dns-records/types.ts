import type { FieldDef, Source } from '../../shared/schema';
import { TYPE_CODES, type RrType } from './wire';

export type Group = 'Addresses' | 'Names and aliases' | 'Zone' | 'Mail' | 'Services' | 'Security';
export const GROUPS: Group[] = ['Addresses', 'Names and aliases', 'Zone', 'Mail', 'Services', 'Security'];

export interface TypeInfo {
  type: RrType;
  code: number;
  group: Group;
  title: string;
  purpose: string;
  /** RDATA fields in wire order. */
  fields: FieldDef[];
  rules: string[];
  source: Source;
}

const f = (id: string, name: string, bits: number | 'variable', about: string, source?: Source): FieldDef => ({ id, name, bits, about, ...(source ? { source } : {}) });
const name = (id: string, label: string, about: string): FieldDef => f(id, label, 'variable', `${about} A domain name in label format; inside a message it may be compressed, except where noted.`);

const INFO: Omit<TypeInfo, 'code'>[] = [
  {
    type: 'A',
    group: 'Addresses',
    title: 'IPv4 address',
    purpose: 'Maps a name to an IPv4 address. The record behind almost every lookup.',
    fields: [f('address', 'ADDRESS', 32, 'The IPv4 address, 4 octets in network byte order.')],
    rules: ['A name can have several A records; clients usually try them in the order received, and resolvers often rotate it (simple load distribution).'],
    source: { rfc: 1035, section: '3.4.1' },
  },
  {
    type: 'AAAA',
    group: 'Addresses',
    title: 'IPv6 address',
    purpose: 'Maps a name to an IPv6 address. Clients with IPv6 ask for AAAA and A and usually prefer IPv6 (Happy Eyeballs, RFC 8305).',
    fields: [f('address', 'ADDRESS', 128, 'The IPv6 address, 16 octets.')],
    rules: ['The type number is 28; the name means "four times A" because the address is four times as long.'],
    source: { rfc: 3596, section: '2.2' },
  },
  {
    type: 'CNAME',
    group: 'Names and aliases',
    title: 'Alias',
    purpose: 'Says that this name is an alias: the canonical name holds the real data. A resolver restarts the lookup with the target and returns both records.',
    fields: [name('target', 'CNAME', 'The canonical name.')],
    rules: [
      'A name with a CNAME must have no other data (RFC 2181 section 10.1). DNSSEC records are the exception.',
      'Therefore no CNAME at the zone apex: the apex always has SOA and NS. Providers offer "ALIAS" or "flattening" instead, which answers with A records.',
      'MX and NS must not point to a name that is a CNAME (RFC 2181 section 10.3).',
    ],
    source: { rfc: 1035, section: '3.3.1' },
  },
  {
    type: 'PTR',
    group: 'Names and aliases',
    title: 'Reverse lookup',
    purpose: 'Maps an address back to a name. The address is written in reverse under in-addr.arpa (IPv4) or ip6.arpa (IPv6), because DNS names are most specific on the left.',
    fields: [name('target', 'PTRDNAME', 'The name the address points to.')],
    rules: [
      'The reverse zone belongs to whoever holds the address block, usually the provider, not the owner of the forward domain.',
      'Mail servers check that the PTR of a sending IP and the A record of that name match (forward-confirmed reverse DNS).',
    ],
    source: { rfc: 1035, section: '3.3.12' },
  },
  {
    type: 'SOA',
    group: 'Zone',
    title: 'Start of authority',
    purpose: 'Exactly one per zone, at its apex. Names the primary name server and the responsible mailbox, and holds the timers for secondary servers and negative caching.',
    fields: [
      name('mname', 'MNAME', 'The primary name server of the zone.'),
      name('rname', 'RNAME', 'The mailbox of the person responsible, with the first dot standing for @: hostmaster.example.com means hostmaster@example.com.'),
      f('serial', 'SERIAL', 32, 'Version of the zone. Secondaries transfer the zone when the serial increases. A common convention is YYYYMMDDnn.'),
      f('refresh', 'REFRESH', 32, 'Seconds between checks of secondaries for a new serial.'),
      f('retry', 'RETRY', 32, 'Seconds before a secondary retries a failed check.'),
      f('expire', 'EXPIRE', 32, 'Seconds after which a secondary that cannot reach the primary stops answering for the zone.'),
      f('minimum', 'MINIMUM', 32, 'Today: the TTL for negative answers (name or type does not exist), RFC 2308 section 4.', { rfc: 2308, section: '4' }),
    ],
    rules: ['Forgetting to increase the serial after an edit is a classic: the secondaries keep serving the old data.'],
    source: { rfc: 1035, section: '3.3.13' },
  },
  {
    type: 'NS',
    group: 'Zone',
    title: 'Name server',
    purpose: 'Names the authoritative name servers of a zone. The same NS records in the parent zone form the delegation that resolvers follow.',
    fields: [name('target', 'NSDNAME', 'A name server for the zone.')],
    rules: [
      'If a name server lies inside the zone it serves (ns1.example.com for example.com), the parent must also hold its address: glue records, otherwise resolvers could never reach it.',
      'At least two name servers, ideally in different networks.',
    ],
    source: { rfc: 1035, section: '3.3.11' },
  },
  {
    type: 'MX',
    group: 'Mail',
    title: 'Mail exchanger',
    purpose: 'Names the servers that accept mail for the domain. Sending servers try them in order of preference, lowest first.',
    fields: [f('preference', 'PREFERENCE', 16, 'Lower values are preferred. Servers with the same value share the load.'), name('exchange', 'EXCHANGE', 'The mail server. Must have A or AAAA records, not be a CNAME.')],
    rules: ['Without any MX record, mail goes to the A or AAAA record of the domain itself (implicit MX, RFC 5321 section 5.1).', 'A "null MX" (preference 0, exchange ".") says the domain accepts no mail (RFC 7505).'],
    source: { rfc: 1035, section: '3.3.9' },
  },
  {
    type: 'TXT',
    group: 'Mail',
    title: 'Text',
    purpose: 'Free text, used by many protocols: SPF lists who may send mail for the domain, DKIM publishes signing keys, DMARC the policy for failed checks, and services use it for domain verification.',
    fields: [f('strings', 'TXT-DATA', 'variable', 'One or more character strings, each a length octet and up to 255 octets of text. Longer texts, such as DKIM keys, are split into several strings and joined by the reader.')],
    rules: [
      'SPF: only one record starting with v=spf1 per name, otherwise the result is an error (RFC 7208 section 4.5).',
      'DKIM keys live at <selector>._domainkey.<domain> (RFC 6376 section 3.6.2), DMARC policies at _dmarc.<domain> (RFC 9989).',
    ],
    source: { rfc: 1035, section: '3.3.14' },
  },
  {
    type: 'SRV',
    group: 'Services',
    title: 'Service location',
    purpose: 'Says which host and port offer a service, found under _service._proto.<domain>. Used for SIP, XMPP, LDAP and Kerberos in Active Directory, and mail client configuration.',
    fields: [
      f('priority', 'Priority', 16, 'Lower values are tried first.'),
      f('weight', 'Weight', 16, 'Among records with the same priority, a relative share of the load.'),
      f('port', 'Port', 16, 'The port of the service.'),
      name('target', 'Target', 'The host offering the service; must have A or AAAA records. Not compressed.'),
    ],
    rules: ['A target of "." means the service is decidedly not available at this domain.'],
    source: { rfc: 2782 },
  },
  {
    type: 'HTTPS',
    group: 'Services',
    title: 'HTTPS service binding',
    purpose: 'Tells a browser before connecting how to reach an HTTPS service: supported protocols such as HTTP/3 (alpn), address hints and keys for Encrypted Client Hello. Saves a round trip and allows HTTP/3 from the first connection.',
    fields: [
      f('priority', 'SvcPriority', 16, '0 is AliasMode (the record only points to another name, allowed at the apex unlike CNAME); 1 and higher is ServiceMode, lower values preferred.'),
      name('target', 'TargetName', 'Where the service runs. "." in ServiceMode means the owner name itself. Not compressed.'),
      f('params', 'SvcParams', 'variable', 'Key-value pairs in ascending key order, each with a 2-octet key, a 2-octet length and the value: alpn (key 1) lists protocol ids, ipv4hint (4) and ipv6hint (6) addresses.'),
    ],
    rules: ['The general form is SVCB (type 64); HTTPS (type 65) is its version for HTTPS with the same format.'],
    source: { rfc: 9460 },
  },
  {
    type: 'CAA',
    group: 'Security',
    title: 'Certification authority authorization',
    purpose: 'Lists which certificate authorities may issue certificates for the domain. CAs must check it before issuing.',
    fields: [
      f('flags', 'Flags', 8, 'Bit 0 (128) is the critical flag: a CA that does not understand the tag must not issue.'),
      f('tagLength', 'Tag Length', 8, 'Length of the tag.'),
      f('tag', 'Tag', 'variable', 'issue (who may issue certificates), issuewild (wildcard certificates), iodef (where to report violations).'),
      f('value', 'Value', 'variable', 'For issue: the domain of the CA. Runs to the end of the RDATA, without a length octet.'),
    ],
    rules: ['CAA is checked by the CA at issuance only; browsers do not look at it.'],
    source: { rfc: 8659 },
  },
  {
    type: 'DNSKEY',
    group: 'Security',
    title: 'DNSSEC public key',
    purpose: 'A public key of the zone. Resolvers use it to verify the RRSIG signatures of the zone.',
    fields: [
      f('flags', 'Flags', 16, 'Bit 7 (256): zone key. Bit 15 (1): secure entry point, the key the parent DS points to. 257 is a key-signing key (KSK), 256 a zone-signing key (ZSK).'),
      f('protocol', 'Protocol', 8, 'Always 3.'),
      f('algorithm', 'Algorithm', 8, '15 is Ed25519 (RFC 8080), 13 is ECDSA P-256 with SHA-256, 8 is RSA with SHA-256.'),
      f('publicKey', 'Public Key', 'variable', 'The key itself, in the format of the algorithm (32 octets for Ed25519).'),
    ],
    rules: ['Many zones use one key as KSK and a second as ZSK; a single combined key (CSK) is also common, as here.'],
    source: { rfc: 4034, section: '2' },
  },
  {
    type: 'DS',
    group: 'Security',
    title: 'Delegation signer',
    purpose: 'A hash of the child zone\'s key, published in the parent zone. It links the chain of trust from the parent (com) down to the child (example.com).',
    fields: [
      f('keyTag', 'Key Tag', 16, 'A short checksum over the DNSKEY RDATA (RFC 4034 appendix B), to find the matching key quickly.'),
      f('algorithm', 'Algorithm', 8, 'Algorithm of the referenced DNSKEY.'),
      f('digestType', 'Digest Type', 8, '2 is SHA-256 (RFC 4509), 4 is SHA-384.'),
      f('digest', 'Digest', 'variable', 'Hash over the owner name and the DNSKEY RDATA.'),
    ],
    rules: ['The DS lives in the parent zone, set through the registrar. If it does not match the child\'s keys, validating resolvers reject the whole domain (SERVFAIL).'],
    source: { rfc: 4034, section: '5' },
  },
  {
    type: 'RRSIG',
    group: 'Security',
    title: 'DNSSEC signature',
    purpose: 'A signature over one RRset (all records of one name and type), made with the zone\'s private key and valid for a period.',
    fields: [
      f('typeCovered', 'Type Covered', 16, 'The type of the signed RRset.'),
      f('algorithm', 'Algorithm', 8, 'Algorithm of the signing key.'),
      f('labels', 'Labels', 8, 'Number of labels of the owner name, without the root; lets resolvers detect wildcard expansion.'),
      f('originalTtl', 'Original TTL', 32, 'The TTL as published, since caches count TTLs down.'),
      f('expiration', 'Signature Expiration', 32, 'End of validity, seconds since 1970 (serial arithmetic).'),
      f('inception', 'Signature Inception', 32, 'Start of validity.'),
      f('keyTag', 'Key Tag', 16, 'Key tag of the DNSKEY that made the signature.'),
      f('signer', 'Signer\'s Name', 'variable', 'The zone that signed. Not compressed.'),
      f('signature', 'Signature', 'variable', 'The signature over the RRSIG fields and the canonical RRset.'),
    ],
    rules: ['Signatures expire: a zone that is no longer re-signed fails validation after the expiration time.'],
    source: { rfc: 4034, section: '3' },
  },
  {
    type: 'NSEC',
    group: 'Security',
    title: 'Next secure',
    purpose: 'Proves that a name or type does not exist: it names the next existing name in canonical order and lists the types that exist at this name.',
    fields: [name('next', 'Next Domain Name', 'The next owner name in the zone in canonical order. Not compressed.'), f('typeBitmaps', 'Type Bit Maps', 'variable', 'The types present at the owner name, as bitmaps per window of 256 types.')],
    rules: ['Walking the NSEC chain reveals every name in the zone. NSEC3 (RFC 5155) uses hashed names to make that harder.'],
    source: { rfc: 4034, section: '4' },
  },
];

export const TYPES: TypeInfo[] = INFO.map((i) => ({ ...i, code: TYPE_CODES[i.type] }));

export const typeInfo = (t: RrType) => TYPES.find((x) => x.type === t)!;

/** The fixed fields in front of every RDATA (RFC 1035 section 4.1.3). */
export const RR_FIELDS: FieldDef[] = [
  f('name', 'NAME', 'variable', 'The owner name. Written in full here; inside a message it is usually compressed to a pointer to an earlier occurrence.', { rfc: 1035, section: '4.1.3' }),
  f('type', 'TYPE', 16, 'The record type as a number, for example 1 for A.', { rfc: 1035, section: '3.2.2' }),
  f('class', 'CLASS', 16, 'Practically always 1, IN (Internet).', { rfc: 1035, section: '3.2.4' }),
  f('ttl', 'TTL', 32, 'Seconds a resolver may cache the record. Lower it well before planned changes, so old answers expire quickly.', { rfc: 1035, section: '4.1.3' }),
  f('rdlength', 'RDLENGTH', 16, 'Length of the RDATA in octets.', { rfc: 1035, section: '4.1.3' }),
];
