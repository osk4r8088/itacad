import type { Source } from '../../shared/schema';
import { formatIpv4, maskOf, subnet, type Ipv4, type Subnet } from '../subnet/logic';

export interface Need {
  name: string;
  hosts: number;
}

/** Usable host addresses in a prefix of this length. /31 only counts as two when point-to-point links are allowed. */
export function usable(prefix: number, allow31: boolean): number {
  if (prefix === 32) return 0;
  if (prefix === 31) return allow31 ? 2 : 0;
  return 2 ** (32 - prefix) - 2;
}

/** The longest prefix (smallest subnet) that has room for this many hosts, or undefined if none does. */
export function prefixFor(hosts: number, allow31: boolean): number | undefined {
  for (let p = 31; p >= 0; p--) if (usable(p, allow31) >= hosts) return p;
  return undefined;
}

export interface Allocation {
  need: Need;
  /** Position in the input list, for showing the original order. */
  index: number;
  subnet: Subnet;
  /** Usable addresses not needed by this network. */
  wasted: number;
}

export interface Free {
  network: Ipv4;
  prefix: number;
}

export type PlanResult =
  | { ok: true; allocations: Allocation[]; free: Free[]; used: number; total: number }
  | { ok: false; error: string; allocations: Allocation[] };

/**
 * Largest-first allocation: sort by required size, then give each network the next free block of its size.
 * Because every block is a power of two and the sizes only shrink, each next block is already aligned.
 */
export function plan(network: Ipv4, prefix: number, needs: Need[], allow31: boolean): PlanResult {
  const base = (network & maskOf(prefix)) >>> 0;
  const end = base + 2 ** (32 - prefix);
  const sized = needs.map((need, index) => ({ need, index, p: prefixFor(need.hosts, allow31) }));
  for (const s of sized) {
    if (!Number.isInteger(s.need.hosts) || s.need.hosts < 1) return { ok: false, error: `"${s.need.name || `Network ${s.index + 1}`}" needs a host count of at least 1.`, allocations: [] };
    if (s.p === undefined) return { ok: false, error: `"${s.need.name}" needs ${s.need.hosts} hosts; no IPv4 subnet is that large.`, allocations: [] };
  }
  const order = [...sized].sort((a, b) => a.p! - b.p! || a.index - b.index);
  const allocations: Allocation[] = [];
  let cursor = base;
  for (const s of order) {
    const size = 2 ** (32 - s.p!);
    const start = Math.ceil(cursor / size) * size;
    if (start + size > end) {
      const needed = order.reduce((n, o) => n + 2 ** (32 - o.p!), 0);
      return {
        ok: false,
        error: `${formatIpv4(base)}/${prefix} has ${(end - base).toLocaleString('en-US')} addresses, but the networks need ${needed.toLocaleString('en-US')} in total. "${s.need.name}" (/${s.p}, ${size.toLocaleString('en-US')} addresses) no longer fits. Use a larger block or fewer hosts.`,
        allocations,
      };
    }
    const sub = subnet(start, s.p!);
    allocations.push({ need: s.need, index: s.index, subnet: sub, wasted: sub.hosts - s.need.hosts });
    cursor = start + size;
  }
  return { ok: true, allocations, free: freeBlocks(cursor, end), used: cursor - base, total: end - base };
}

/** The range from start to end as the fewest aligned CIDR blocks. */
export function freeBlocks(start: Ipv4, end: Ipv4): Free[] {
  const out: Free[] = [];
  let at = start;
  while (at < end) {
    let size = 1;
    // grow while aligned and still inside the range
    while (at % (size * 2) === 0 && at + size * 2 <= end) size *= 2;
    out.push({ network: at, prefix: 32 - Math.log2(size) });
    at += size;
  }
  return out;
}

export const SOURCES: Source[] = [
  { rfc: 4632, note: 'CIDR: prefixes of any length, aligned blocks' },
  { rfc: 950, note: 'subnetting' },
  { rfc: 1878, note: 'variable length subnet table for IPv4' },
  { rfc: 1122, section: '3.2.1.3', note: 'network and broadcast addresses are not host addresses' },
  { rfc: 3021, note: '31-bit prefixes on point-to-point links' },
];
