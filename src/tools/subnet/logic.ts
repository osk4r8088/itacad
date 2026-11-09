import type { Source } from '../../shared/schema';

/** IPv4 addresses are handled as unsigned 32-bit integers. */
export type Ipv4 = number;

export const MAX_PREFIX = 32;

export function parseIpv4(text: string): Ipv4 | undefined {
  const parts = text.trim().split('.');
  if (parts.length !== 4) return undefined;
  let value = 0;
  for (const p of parts) {
    // Leading zeros are rejected: some parsers (inet_aton) read them as octal, so "010" is ambiguous.
    if (!/^(0|[1-9]\d{0,2})$/.test(p)) return undefined;
    const n = Number(p);
    if (n > 255) return undefined;
    value = value * 256 + n;
  }
  return value;
}

export function formatIpv4(value: Ipv4): string {
  return [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join('.');
}

/** 32 characters of 0 and 1, most significant bit first. */
export function toBits(value: Ipv4): string {
  return value.toString(2).padStart(32, '0');
}

export function maskOf(prefix: number): Ipv4 {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

/** Prefix length of a subnet mask, or undefined if the one bits are not contiguous. */
export function prefixOfMask(mask: Ipv4): number | undefined {
  const bits = toBits(mask);
  if (!/^1*0*$/.test(bits)) return undefined;
  const firstZero = bits.indexOf('0');
  return firstZero === -1 ? 32 : firstZero;
}

export type ParseResult = { ok: true; address: Ipv4; prefix?: number } | { ok: false; error: string };

/** Accepts "192.0.2.77", "192.0.2.77/26" or "192.0.2.77 255.255.255.192". */
export function parseInput(text: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'Enter an IPv4 address, for example 192.0.2.77/26.' };
  const match = /^([^\s/]+)\s*(?:\/\s*(\S+)|\s+(\S+))?$/.exec(trimmed);
  if (!match) return { ok: false, error: 'Use the form 192.0.2.77/26 or 192.0.2.77 255.255.255.192.' };
  const address = parseIpv4(match[1]);
  if (address === undefined) return { ok: false, error: `"${match[1]}" is not an IPv4 address: four numbers from 0 to 255, separated by dots, without leading zeros.` };
  if (match[2] !== undefined) {
    if (!/^\d{1,2}$/.test(match[2]) || Number(match[2]) > MAX_PREFIX) return { ok: false, error: `"/${match[2]}" is not a prefix length: use 0 to 32.` };
    return { ok: true, address, prefix: Number(match[2]) };
  }
  if (match[3] !== undefined) {
    const mask = parseIpv4(match[3]);
    if (mask === undefined) return { ok: false, error: `"${match[3]}" is not a subnet mask.` };
    const prefix = prefixOfMask(mask);
    if (prefix === undefined) return { ok: false, error: `${match[3]} is not a valid subnet mask: its one bits must be contiguous from the left.` };
    return { ok: true, address, prefix };
  }
  return { ok: true, address };
}

export interface AddressBlock {
  name: string;
  /** First address and prefix length of the block. */
  network: Ipv4;
  prefix: number;
  source: Source;
}

const block = (cidr: string, name: string, source: Source): AddressBlock => {
  const [addr, len] = cidr.split('/');
  return { name, network: parseIpv4(addr)!, prefix: Number(len), source };
};

/**
 * Special-purpose IPv4 blocks, from the IANA IPv4 Special-Purpose Address Registry (RFC 6890),
 * plus multicast and the reserved class E range. More specific blocks come first.
 */
export const SPECIAL_BLOCKS: AddressBlock[] = [
  block('255.255.255.255/32', 'Limited broadcast', { rfc: 919, section: '7', note: 'and RFC 8190' }),
  block('0.0.0.0/8', '"This network"', { rfc: 1122, section: '3.2.1.3' }),
  block('10.0.0.0/8', 'Private', { rfc: 1918, section: '3' }),
  block('100.64.0.0/10', 'Shared address space (carrier-grade NAT)', { rfc: 6598 }),
  block('127.0.0.0/8', 'Loopback', { rfc: 1122, section: '3.2.1.3' }),
  block('169.254.0.0/16', 'Link-local', { rfc: 3927 }),
  block('172.16.0.0/12', 'Private', { rfc: 1918, section: '3' }),
  block('192.0.0.0/24', 'IETF protocol assignments', { rfc: 6890 }),
  block('192.0.2.0/24', 'Documentation (TEST-NET-1)', { rfc: 5737 }),
  block('192.88.99.0/24', '6to4 relay anycast (deprecated)', { rfc: 7526 }),
  block('192.168.0.0/16', 'Private', { rfc: 1918, section: '3' }),
  block('198.18.0.0/15', 'Benchmarking', { rfc: 2544 }),
  block('198.51.100.0/24', 'Documentation (TEST-NET-2)', { rfc: 5737 }),
  block('203.0.113.0/24', 'Documentation (TEST-NET-3)', { rfc: 5737 }),
  block('224.0.0.0/4', 'Multicast', { rfc: 5771 }),
  block('240.0.0.0/4', 'Reserved for future use', { rfc: 1112, section: '4' }),
];

export function contains(b: AddressBlock, address: Ipv4): boolean {
  return ((address & maskOf(b.prefix)) >>> 0) === b.network;
}

/** The special-purpose block the address belongs to; undefined means a public unicast address. */
export function classify(address: Ipv4): AddressBlock | undefined {
  return SPECIAL_BLOCKS.find((b) => contains(b, address));
}

/**
 * Address class from the leading bits: A to C from RFC 791, D (multicast) and E (reserved) from RFC 1112.
 * Replaced by CIDR (RFC 4632), still common in exams and old documentation.
 */
export function historicalClass(address: Ipv4): 'A' | 'B' | 'C' | 'D' | 'E' {
  const first = Math.floor(address / 2 ** 24);
  if (first < 128) return 'A'; // 0xxxxxxx
  if (first < 192) return 'B'; // 10xxxxxx
  if (first < 224) return 'C'; // 110xxxxx
  if (first < 240) return 'D'; // 1110xxxx, multicast
  return 'E'; // 1111xxxx, reserved
}

export interface Subnet {
  address: Ipv4;
  prefix: number;
  mask: Ipv4;
  /** Inverted mask, as used in Cisco ACLs and OSPF network statements. */
  wildcard: Ipv4;
  network: Ipv4;
  broadcast: Ipv4;
  /** All addresses in the block, including network and broadcast. */
  total: number;
  /** First and last address that can be given to a host, and their count. */
  firstHost: Ipv4;
  lastHost: Ipv4;
  hosts: number;
  /** How the host range is defined for this prefix length. */
  rule: 'normal' | 'point-to-point' | 'single-host';
}

export function subnet(address: Ipv4, prefix: number): Subnet {
  const mask = maskOf(prefix);
  const wildcard = ~mask >>> 0;
  const network = (address & mask) >>> 0;
  const broadcast = (network | wildcard) >>> 0;
  const total = 2 ** (32 - prefix);
  const base = { address, prefix, mask, wildcard, network, broadcast, total };
  // /32: one address, a host route. /31: both addresses are hosts on a point-to-point link (RFC 3021).
  if (prefix === 32) return { ...base, firstHost: network, lastHost: network, hosts: 1, rule: 'single-host' };
  if (prefix === 31) return { ...base, firstHost: network, lastHost: broadcast, hosts: 2, rule: 'point-to-point' };
  return { ...base, firstHost: network + 1, lastHost: broadcast - 1, hosts: total - 2, rule: 'normal' };
}

/** Where the address sits inside its subnet. */
export function roleOf(s: Subnet): 'network' | 'broadcast' | 'host' {
  if (s.rule !== 'normal') return 'host';
  if (s.address === s.network) return 'network';
  if (s.address === s.broadcast) return 'broadcast';
  return 'host';
}

export const SOURCES: Source[] = [
  { rfc: 4632, note: 'CIDR: prefix notation and aggregation' },
  { rfc: 950, note: 'Internet standard subnetting procedure' },
  { rfc: 1122, section: '3.2.1.3', note: 'addressing rules, network and broadcast addresses' },
  { rfc: 3021, note: '31-bit prefixes on point-to-point links' },
  { rfc: 1918, note: 'private address space' },
  { rfc: 6890, note: 'special-purpose address registries' },
  { rfc: 791, section: '3.2', note: 'original address classes A to C' },
  { rfc: 1112, section: '4', note: 'class D multicast, class E reserved' },
];
