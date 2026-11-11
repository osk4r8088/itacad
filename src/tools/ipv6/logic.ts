import type { Source } from '../../shared/schema';
import { eui64, formatIpv6, multicastMac, parseIpv6, solicitedNode } from '../../shared/lib/ipv6';
import { parseMac } from '../../shared/lib/encode';

/** IPv6 addresses are handled as 128-bit unsigned bigints. */
export type Ipv6 = bigint;

export const MAX_PREFIX = 128;
const ALL = (1n << 128n) - 1n;

export const toBigint = (bytes: Uint8Array): Ipv6 => bytes.reduce((n, b) => (n << 8n) | BigInt(b), 0n);
export const toBytes = (value: Ipv6): Uint8Array => Uint8Array.from({ length: 16 }, (_, i) => Number((value >> BigInt((15 - i) * 8)) & 0xffn));

export const maskOf = (prefix: number): Ipv6 => (prefix === 0 ? 0n : (ALL << BigInt(128 - prefix)) & ALL);
const inPrefix = (a: Ipv6, net: Ipv6, prefix: number) => (a & maskOf(prefix)) === net;

/** 128 characters of 0 and 1. */
export const toBits = (value: Ipv6): string => value.toString(2).padStart(128, '0');

/** The recommended text form (RFC 5952). IPv4-mapped addresses keep their IPv4 part in dotted form (section 5). */
export function compress(value: Ipv6): string {
  const bytes = toBytes(value);
  if (inPrefix(value, 0xffff00000000n, 96)) return `::ffff:${bytes.slice(12).join('.')}`;
  return formatIpv6(bytes);
}

/** All eight groups, each with four hex digits. */
export function expand(value: Ipv6): string {
  return Array.from({ length: 8 }, (_, i) => ((value >> BigInt((7 - i) * 16)) & 0xffffn).toString(16).padStart(4, '0')).join(':');
}

export type ParseResult = { ok: true; address: Ipv6; prefix?: number } | { ok: false; error: string };

/** Accepts an address with an optional /prefix and an optional %zone, which is ignored. */
export function parseInput(text: string): ParseResult {
  const trimmed = text.trim().replace(/^\[(.*)\](\/\d+)?$/, '$1$2');
  if (!trimmed) return { ok: false, error: 'Enter an IPv6 address, for example 2001:db8::1/64.' };
  const match = /^([0-9a-fA-F:.]+)(?:%[\w.-]+)?(?:\/(\S*))?$/.exec(trimmed);
  if (!match) return { ok: false, error: 'An IPv6 address has hex digits separated by colons, for example 2001:db8::1. A prefix length goes after a slash: 2001:db8::/32.' };
  let address: Ipv6;
  try {
    address = toBigint(parseIpv6(match[1]));
  } catch {
    return { ok: false, error: `"${match[1]}" is not a valid IPv6 address: eight groups of up to four hex digits, with "::" at most once for a run of zero groups.` };
  }
  if (match[2] === undefined) return { ok: true, address };
  if (!/^\d{1,3}$/.test(match[2]) || Number(match[2]) > MAX_PREFIX) return { ok: false, error: `"/${match[2]}" is not a prefix length: use 0 to 128.` };
  return { ok: true, address, prefix: Number(match[2]) };
}

/** What changed between the typed text and the recommended form, as short notes. */
export function textNotes(typed: string, value: Ipv6): string[] {
  const addr = typed.trim().replace(/^\[|\].*$/g, '').split(/[/%]/)[0];
  const canonical = compress(value);
  if (addr === canonical) return [];
  const notes: string[] = [];
  if (/[A-F]/.test(addr)) notes.push('hex digits are written in lowercase');
  if (/(^|:)0[0-9a-f]/i.test(addr)) notes.push('leading zeros in a group are left out');
  const runs = addr.includes('::');
  if (!runs && canonical.includes('::')) notes.push('the longest run of zero groups becomes "::"');
  else if (runs && !canonical.includes('::')) notes.push('"::" is not used for a single zero group');
  else if (runs && notes.length === 0) notes.push('"::" replaces the longest run of zero groups, the first one if two are equally long');
  if (notes.length === 0) notes.push('the recommended form differs');
  return notes;
}

// ---- address types

export interface Block {
  prefix: string;
  length: number;
  name: string;
  about: string;
  source: Source;
  /** From the IANA special-purpose registry, where listed. */
  globallyReachable?: boolean;
}

const IANA: Source = { spec: 'IANA IPv6 Special-Purpose Address Space registry' };

/** Most specific match wins. Global unicast (2000::/3) is the default inside its range. */
export const BLOCKS: Block[] = [
  { prefix: '::', length: 128, name: 'Unspecified', about: 'Means "no address": the source of packets from a host that has none yet, for example in Duplicate Address Detection. Never a destination.', source: { rfc: 4291, section: '2.5.2' }, globallyReachable: false },
  { prefix: '::1', length: 128, name: 'Loopback', about: 'The host itself, like 127.0.0.1. Never leaves the host.', source: { rfc: 4291, section: '2.5.3' }, globallyReachable: false },
  { prefix: '::ffff:0:0', length: 96, name: 'IPv4-mapped', about: 'An IPv4 address in IPv6 form. Dual-stack software uses it to handle IPv4 connections through an IPv6 socket; it never appears in IPv6 packets on the wire.', source: { rfc: 4291, section: '2.5.5.2' }, globallyReachable: false },
  { prefix: '64:ff9b::', length: 96, name: 'IPv4-IPv6 translation (NAT64 well-known prefix)', about: 'The last 32 bits are an IPv4 address. A NAT64 gateway translates packets to these addresses into IPv4 packets.', source: { rfc: 6052 }, globallyReachable: true },
  { prefix: '64:ff9b:1::', length: 48, name: 'IPv4-IPv6 translation, local use', about: 'Like 64:ff9b::/96, for translation inside one network.', source: { rfc: 8215 }, globallyReachable: false },
  { prefix: '100::', length: 64, name: 'Discard-only', about: 'Traffic to these addresses is dropped on purpose, for example to blackhole an attack.', source: { rfc: 6666 }, globallyReachable: false },
  { prefix: '100:0:0:1::', length: 64, name: 'Dummy prefix', about: 'For configurations that need a prefix where no real one exists.', source: { rfc: 9780 }, globallyReachable: false },
  { prefix: '2001::', length: 23, name: 'IETF protocol assignments', about: 'Reserved for addresses that IETF protocols need. The more specific blocks inside it are listed separately.', source: { rfc: 2928 } },
  { prefix: '2001::', length: 32, name: 'Teredo', about: 'IPv6 over UDP over IPv4 through NAT. The address encodes the Teredo server and, obfuscated, the client\'s public IPv4 address and port.', source: { rfc: 4380 } },
  { prefix: '2001:2::', length: 48, name: 'Benchmarking', about: 'For lab tests of network equipment; must not appear on the Internet.', source: { rfc: 5180 }, globallyReachable: false },
  { prefix: '2001:3::', length: 32, name: 'AMT', about: 'Automatic Multicast Tunneling.', source: { rfc: 7450 }, globallyReachable: true },
  { prefix: '2001:4:112::', length: 48, name: 'AS112-v6', about: 'Anycast name servers that absorb reverse DNS queries for private addresses.', source: { rfc: 7535 }, globallyReachable: true },
  { prefix: '2001:10::', length: 28, name: 'Deprecated (previously ORCHID)', about: 'No longer assigned; replaced by ORCHIDv2.', source: { rfc: 4843 } },
  { prefix: '2001:20::', length: 28, name: 'ORCHIDv2', about: 'Identifiers derived from cryptographic hashes, used as host identities, not as locators.', source: { rfc: 7343 }, globallyReachable: true },
  { prefix: '2001:30::', length: 28, name: 'Drone Remote ID entity tags', about: 'Identifiers for unmanned aircraft.', source: { rfc: 9374 }, globallyReachable: true },
  { prefix: '2001:db8::', length: 32, name: 'Documentation', about: 'For examples in documentation and books, like this site. Never routed.', source: { rfc: 3849 }, globallyReachable: false },
  { prefix: '2002::', length: 16, name: '6to4', about: 'Automatic IPv6 over IPv4 tunnels; the next 32 bits are the IPv4 address of the tunnel endpoint. Rarely used today.', source: { rfc: 3056 } },
  { prefix: '2620:4f:8000::', length: 48, name: 'Direct delegation AS112 service', about: 'Anycast name servers for the AS112 project.', source: { rfc: 7534 }, globallyReachable: true },
  { prefix: '3fff::', length: 20, name: 'Documentation', about: 'The second documentation prefix, added in 2024 because 2001:db8::/32 is too small to show realistic large networks. Never routed.', source: { rfc: 9637 }, globallyReachable: false },
  { prefix: '5f00::', length: 16, name: 'Segment Routing (SRv6) SIDs', about: 'Segment identifiers inside an SRv6 domain.', source: { rfc: 9602 }, globallyReachable: false },
  { prefix: 'fc00::', length: 7, name: 'Unique local', about: 'For use inside a site or between cooperating sites, like the IPv4 private ranges, but meant to be unique: fd00::/8 with a random 40-bit global ID. Not routed on the Internet.', source: { rfc: 4193 }, globallyReachable: false },
  { prefix: 'fec0::', length: 10, name: 'Site-local (deprecated)', about: 'The original site-scoped addresses, deprecated because "site" was never well defined. Unique local addresses replaced them.', source: { rfc: 3879 } },
  { prefix: 'fe80::', length: 10, name: 'Link-local unicast', about: 'Valid only on one link and never forwarded by routers. Every IPv6 interface has one; Neighbor Discovery runs on them. Because the same address can exist on several links, it needs a zone such as %eth0 to be unambiguous.', source: { rfc: 4291, section: '2.5.6' }, globallyReachable: false },
  { prefix: 'ff00::', length: 8, name: 'Multicast', about: 'Addresses a group of interfaces. IPv6 has no broadcast; multicast groups such as all-nodes (ff02::1) take its place.', source: { rfc: 4291, section: '2.7' } },
  { prefix: '2000::', length: 3, name: 'Global unicast', about: 'The range IANA allocates to the regional registries, which assign it to providers and organizations. Routed on the Internet.', source: { rfc: 4291, section: '2.5.4' }, globallyReachable: true },
];

const PARSED = BLOCKS.map((b) => ({ ...b, net: toBigint(parseIpv6(b.prefix)) }));

/** Every block the address falls into, most specific first. */
export function blocksOf(a: Ipv6): Block[] {
  return PARSED.filter((b) => inPrefix(a, b.net, b.length)).sort((x, y) => y.length - x.length);
}

export const OUTSIDE_ALLOCATED =
  'Not in a special-purpose block and outside 2000::/3. RFC 4291 counts all such unicast space as global unicast, but IANA has not allocated any of it: the IPv6 address space registry lists it as reserved by the IETF.';

// ---- multicast

const SCOPES: Record<number, string> = {
  1: 'interface-local',
  2: 'link-local',
  3: 'realm-local',
  4: 'admin-local',
  5: 'site-local',
  8: 'organization-local',
  14: 'global',
};

const WELL_KNOWN: Record<string, string> = {
  'ff02::1': 'all nodes on the link',
  'ff02::2': 'all routers on the link',
  'ff02::16': 'all MLDv2-capable routers',
  'ff02::fb': 'mDNS',
  'ff02::1:2': 'all DHCPv6 relay agents and servers',
  'ff05::1:3': 'all DHCPv6 servers (site)',
};

export interface MulticastInfo {
  scope: string;
  transient: boolean;
  prefixBased: boolean;
  wellKnown?: string;
  /** For solicited-node groups: the low 24 bits of the addresses the group stands for, as 6 hex digits. */
  solicitedFor?: string;
}

export function multicastInfo(a: Ipv6): MulticastInfo | undefined {
  if (!inPrefix(a, 0xffn << 120n, 8)) return undefined;
  const flags = Number((a >> 116n) & 0xfn);
  const scope = Number((a >> 112n) & 0xfn);
  const text = compress(a);
  const solicited = inPrefix(a, toBigint(parseIpv6('ff02::1:ff00:0')), 104);
  return {
    scope: SCOPES[scope] ?? `${scope} (reserved or unassigned)`,
    transient: (flags & 1) === 1,
    prefixBased: (flags & 2) === 2,
    ...(WELL_KNOWN[text] ? { wellKnown: WELL_KNOWN[text] } : {}),
    ...(solicited ? { solicitedFor: (a & 0xffffffn).toString(16).padStart(6, '0') } : {}),
  };
}

// ---- derived values

export interface Prefix {
  network: Ipv6;
  last: Ipv6;
  prefix: number;
  /** log2 of the number of addresses. */
  hostBits: number;
}

export function prefixOf(a: Ipv6, prefix: number): Prefix {
  const network = a & maskOf(prefix);
  return { network, last: network | (~maskOf(prefix) & ALL), prefix, hostBits: 128 - prefix };
}

/** The low 64 bits, and the MAC address they were built from if they look like modified EUI-64. */
export function interfaceId(a: Ipv6): { iid: string; fromMac?: string } {
  const b = toBytes(a).slice(8);
  const iid = Array.from({ length: 4 }, (_, i) => ((b[i * 2] << 8) | b[i * 2 + 1]).toString(16).padStart(4, '0')).join(':');
  if (b[3] === 0xff && b[4] === 0xfe) {
    const mac = [b[0] ^ 0x02, b[1], b[2], b[5], b[6], b[7]].map((x) => x.toString(16).padStart(2, '0')).join(':');
    return { iid, fromMac: mac };
  }
  return { iid };
}

/** Address from a /64 prefix and a MAC address, with the modified EUI-64 interface identifier. */
export function fromMac(prefix64: Ipv6, mac: string): Ipv6 | undefined {
  if (!/^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(mac.trim())) return undefined;
  const iid = toBigint(Uint8Array.from([...new Uint8Array(8), ...eui64(parseMac(mac.trim()))]));
  return (prefix64 & maskOf(64)) | iid;
}

export const solicitedNodeOf = (a: Ipv6) => {
  const group = solicitedNode(formatIpv6(toBytes(a)));
  return { group, mac: multicastMac(group) };
};

/** Reverse DNS name: one label per hex digit, least significant first, under ip6.arpa (RFC 3596). */
export function reverseName(a: Ipv6): string {
  return `${a.toString(16).padStart(32, '0').split('').reverse().join('.')}.ip6.arpa`;
}

/** 2^bits as text, exact when it is small enough to read. */
export function countText(bits: number): string {
  if (bits <= 32) return (2n ** BigInt(bits)).toLocaleString('en-US');
  return `2^${bits}`;
}

export const SOURCES: Source[] = [
  { rfc: 4291, note: 'IPv6 addressing architecture' },
  { rfc: 5952, note: 'recommended text representation' },
  { rfc: 4193, note: 'unique local addresses' },
  { rfc: 4861, note: 'Neighbor Discovery, solicited-node multicast' },
  { rfc: 2464, section: '7', note: 'multicast addresses on Ethernet' },
  { rfc: 3596, section: '2.5', note: 'reverse DNS under ip6.arpa' },
  { rfc: 6890, note: 'special-purpose address registries' },
  IANA,
];
