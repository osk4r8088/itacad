import type { Source } from '../../shared/schema';

export type Level = '0' | '1' | '5' | '6' | '10';
export const LEVELS: Level[] = ['0', '1', '5', '6', '10'];

export interface LevelInfo {
  name: string;
  minDisks: number;
  /** Disks must come in pairs. */
  evenOnly?: boolean;
  about: string;
  /** Disk I/Os for one small random write (read-modify-write); for RAID 1 with two disks. */
  writePenalty: number;
  reads: string;
}

export const LEVEL_INFO: Record<Level, LevelInfo> = {
  '0': { name: 'RAID 0, striping', minDisks: 2, writePenalty: 1, reads: 'All disks in parallel', about: 'Blocks are spread over all disks. Fast and uses the full capacity, but has no redundancy: one failed disk loses the whole array.' },
  '1': { name: 'RAID 1, mirroring', minDisks: 2, writePenalty: 2, reads: 'From any copy', about: 'Every disk holds the same data. Survives the failure of all disks but one, at the cost of all but one disk\'s capacity.' },
  '5': { name: 'RAID 5, striping with parity', minDisks: 3, writePenalty: 4, reads: 'All disks in parallel', about: 'Each stripe has one parity block, the XOR of its data blocks, rotating over the disks. Survives one failed disk; the missing blocks are recomputed from the others.' },
  '6': { name: 'RAID 6, striping with double parity', minDisks: 4, writePenalty: 6, reads: 'All disks in parallel', about: 'Each stripe has two parity blocks: P, the XOR like RAID 5, and Q, a Reed-Solomon code. Survives any two failed disks.' },
  '10': { name: 'RAID 10, striped mirrors', minDisks: 4, evenOnly: true, writePenalty: 2, reads: 'From any copy, striped', about: 'Disks are paired as mirrors, and data is striped over the pairs. Survives one failure per pair, but not both disks of one pair.' },
};

/** Disk I/Os for one small random write: one per copy for mirrors, read-modify-write for parity. */
export function writePenalty(level: Level, n: number): number {
  return level === '1' ? n : LEVEL_INFO[level].writePenalty;
}

export function validDisks(level: Level, n: number): boolean {
  const info = LEVEL_INFO[level];
  return n >= info.minDisks && (!info.evenOnly || n % 2 === 0);
}

/** Usable capacity in units of one disk. */
export function dataDisks(level: Level, n: number): number {
  switch (level) {
    case '0':
      return n;
    case '1':
      return 1;
    case '5':
      return n - 1;
    case '6':
      return n - 2;
    case '10':
      return n / 2;
  }
}

/** Failed disks the array survives in any case, and at best. */
export function tolerance(level: Level, n: number): { guaranteed: number; best: number } {
  switch (level) {
    case '0':
      return { guaranteed: 0, best: 0 };
    case '1':
      return { guaranteed: n - 1, best: n - 1 };
    case '5':
      return { guaranteed: 1, best: 1 };
    case '6':
      return { guaranteed: 2, best: 2 };
    case '10':
      return { guaranteed: 1, best: n / 2 };
  }
}

// ---- layout

export type Block = { kind: 'data'; index: number } | { kind: 'p' } | { kind: 'q' };

/**
 * Blocks of one stripe per disk, as Linux md lays them out: left-symmetric for RAID 5 and 6
 * (parity starts on the last disk and moves one disk left per stripe, data continues after it),
 * the "near" layout for RAID 10 (pairs of adjacent disks mirror each other).
 */
export function stripe(level: Level, n: number, s: number): Block[] {
  const k = dataDisks(level, n);
  const first = s * k;
  switch (level) {
    case '0':
      return Array.from({ length: n }, (_, d) => ({ kind: 'data', index: first + d }));
    case '1':
      return Array.from({ length: n }, () => ({ kind: 'data', index: s }));
    case '10':
      return Array.from({ length: n }, (_, d) => ({ kind: 'data', index: first + Math.floor(d / 2) }));
    case '5': {
      const p = n - 1 - (s % n);
      const out: Block[] = new Array(n);
      out[p] = { kind: 'p' };
      for (let i = 0; i < k; i++) out[(p + 1 + i) % n] = { kind: 'data', index: first + i };
      return out;
    }
    case '6': {
      const p = n - 1 - (s % n);
      const q = (p + 1) % n;
      const out: Block[] = new Array(n);
      out[p] = { kind: 'p' };
      out[q] = { kind: 'q' };
      for (let i = 0; i < k; i++) out[(p + 2 + i) % n] = { kind: 'data', index: first + i };
      return out;
    }
  }
}

// ---- GF(2^8) arithmetic for the RAID 6 Q syndrome (polynomial x^8 + x^4 + x^3 + x^2 + 1, generator 2)

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

export function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}
export function gfInv(a: number): number {
  if (a === 0) throw new Error('0 has no inverse');
  return EXP[255 - LOG[a]];
}
/** g^i with the generator g = 2. */
export const gfPow2 = (i: number) => EXP[((i % 255) + 255) % 255];

export function parityP(data: number[]): number {
  return data.reduce((a, b) => a ^ b, 0);
}
/** Q = g^0 * D0 xor g^1 * D1 xor ... in GF(2^8). */
export function parityQ(data: number[]): number {
  return data.reduce((q, d, i) => q ^ gfMul(gfPow2(i), d), 0);
}

// ---- contents and reconstruction (one byte per block, enough to show the arithmetic)

const TEXT = 'NETKIT RAID DEMO, ONE BYTE PER BLOCK. ';
export const dataByte = (index: number) => TEXT.charCodeAt(index % TEXT.length);

export interface StripeValues {
  blocks: Block[];
  /** Value of each block, per disk. */
  values: number[];
}

export function stripeValues(level: Level, n: number, s: number): StripeValues {
  const blocks = stripe(level, n, s);
  const data = blocks.filter((b): b is Extract<Block, { kind: 'data' }> => b.kind === 'data');
  const ordered = level === '5' || level === '6' ? data.sort((a, b) => a.index - b.index).map((b) => dataByte(b.index)) : [];
  const values = blocks.map((b) => (b.kind === 'data' ? dataByte(b.index) : b.kind === 'p' ? parityP(ordered) : parityQ(ordered)));
  return { blocks, values };
}

export type Recovery = { ok: true; value: number; how: string } | { ok: false; how: string };

/** The value of every block in a stripe after some disks failed: read, recomputed, or lost. */
export function recover(level: Level, n: number, s: number, failed: Set<number>): (Recovery & { read: boolean })[] {
  const { blocks, values } = stripeValues(level, n, s);
  const alive = (d: number) => !failed.has(d);
  const read = (d: number) => ({ ok: true as const, value: values[d], how: `read from disk ${d}`, read: true });
  const lost = (how: string) => ({ ok: false as const, how, read: false });
  const calc = (value: number, how: string) => ({ ok: true as const, value, how, read: false });

  if (level === '0') return blocks.map((_, d) => (alive(d) ? read(d) : lost('no redundancy in RAID 0')));
  if (level === '1' || level === '10') {
    return blocks.map((b, d) => {
      if (alive(d)) return read(d);
      const copy = blocks.findIndex((o, e) => e !== d && alive(e) && o.kind === 'data' && b.kind === 'data' && o.index === b.index);
      return copy >= 0 ? calc(values[copy], `copy on disk ${copy}`) : lost('every copy is on a failed disk');
    });
  }

  // RAID 5 and 6: data blocks in logical order with their disk numbers
  const dataDisksOrdered = blocks
    .map((b, d) => ({ b, d }))
    .filter((x): x is { b: Extract<Block, { kind: 'data' }>; d: number } => x.b.kind === 'data')
    .sort((x, y) => x.b.index - y.b.index)
    .map((x) => x.d);
  const pDisk = blocks.findIndex((b) => b.kind === 'p');
  const qDisk = blocks.findIndex((b) => b.kind === 'q');
  const missing = blocks.map((_, d) => d).filter((d) => failed.has(d));
  const limit = level === '5' ? 1 : 2;
  if (missing.length > limit) return blocks.map((_, d) => (alive(d) ? read(d) : lost(`more than ${limit} blocks of this stripe are missing`)));

  const D = dataDisksOrdered.map((d) => (alive(d) ? values[d] : undefined));
  const lostData = D.map((v, i) => (v === undefined ? i : -1)).filter((i) => i >= 0);
  const P = alive(pDisk) ? values[pDisk] : undefined;
  const Q = qDisk >= 0 && alive(qDisk) ? values[qDisk] : undefined;
  const others = (skip: number[]) => D.map((v, i) => (skip.includes(i) ? 0 : (v as number)));
  const result = new Map<number, Recovery>();

  if (lostData.length === 1 && P !== undefined) {
    const x = lostData[0];
    result.set(dataDisksOrdered[x], { ok: true, value: P ^ parityP(others([x])), how: 'XOR of P and the other data blocks' });
  } else if (lostData.length === 1 && Q !== undefined) {
    // P is lost too: Dx = (Q xor Qx) * g^-x, where Qx is Q over the other data blocks.
    const x = lostData[0];
    result.set(dataDisksOrdered[x], { ok: true, value: gfMul(Q ^ parityQ(others([x])), gfInv(gfPow2(x))), how: 'from Q in GF(2^8), since P is lost too' });
  } else if (lostData.length === 2 && P !== undefined && Q !== undefined) {
    // Two data blocks x < y (H. P. Anvin, "The mathematics of RAID-6", section 4).
    const [x, y] = lostData;
    const pxy = P ^ parityP(others([x, y]));
    const qxy = Q ^ parityQ(others([x, y]));
    const denom = gfInv(gfPow2(y - x) ^ 1);
    const A = gfMul(gfPow2(y - x), denom);
    const B = gfMul(gfInv(gfPow2(x)), denom);
    const dx = gfMul(A, pxy) ^ gfMul(B, qxy);
    result.set(dataDisksOrdered[x], { ok: true, value: dx, how: 'from P and Q in GF(2^8)' });
    result.set(dataDisksOrdered[y], { ok: true, value: pxy ^ dx, how: 'from P and Q in GF(2^8)' });
  }
  const full = D.map((v, i) => (v === undefined ? (result.get(dataDisksOrdered[i]) as { value: number } | undefined)?.value : v));
  if (full.every((v) => v !== undefined)) {
    if (!alive(pDisk)) result.set(pDisk, { ok: true, value: parityP(full as number[]), how: 'recomputed as XOR of the data' });
    if (qDisk >= 0 && !alive(qDisk)) result.set(qDisk, { ok: true, value: parityQ(full as number[]), how: 'recomputed from the data' });
  }
  return blocks.map((_, d) => (alive(d) ? read(d) : { ...(result.get(d) ?? { ok: false as const, how: 'cannot be recomputed' }), read: false }));
}

/** State of the whole array for a set of failed disks. */
export function arrayState(level: Level, n: number, failed: Set<number>): 'optimal' | 'degraded' | 'failed' {
  if (failed.size === 0) return 'optimal';
  const lostAny = Array.from({ length: n }, (_, s) => recover(level, n, s, failed)).some((r) => r.some((x) => !x.ok));
  return lostAny ? 'failed' : 'degraded';
}

// ---- rebuild risk

/**
 * Probability of at least one unrecoverable read error (URE) while reading `bytes`,
 * for a datasheet rate of one error per `bitsPerError` bits read: 1 - e^(-bits / rate).
 */
export function ureProbability(bytes: number, bitsPerError: number): number {
  return 1 - Math.exp(-(bytes * 8) / bitsPerError);
}

/** Bytes that must be read without error to rebuild one failed disk, and whether a URE is still correctable. */
export function rebuildRead(level: Level, n: number, diskBytes: number): { bytes: number; correctable: boolean } | undefined {
  switch (level) {
    case '0':
      return undefined;
    case '1':
    case '10':
      return { bytes: diskBytes, correctable: level === '1' && n > 2 };
    case '5':
      return { bytes: (n - 1) * diskBytes, correctable: false };
    case '6':
      return { bytes: (n - 1) * diskBytes, correctable: true };
  }
}

export const SOURCES: Source[] = [
  { spec: 'Patterson, Gibson, Katz: A Case for Redundant Arrays of Inexpensive Disks (RAID), SIGMOD 1988', url: 'https://www2.eecs.berkeley.edu/Pubs/TechRpts/1987/CSD-87-391.pdf', note: 'the original RAID levels' },
  { spec: 'SNIA Common RAID Disk Data Format (DDF) 2.0', url: 'https://www.snia.org/sites/default/files/SNIA_DDF_Technical_Position_v2.0.pdf', note: 'RAID level and layout definitions' },
  { spec: 'H. Peter Anvin: The mathematics of RAID-6', url: 'https://www.kernel.org/pub/linux/kernel/people/hpa/raid6.pdf', note: 'P and Q syndromes in GF(2^8), as used by Linux' },
  { spec: 'Linux kernel: dm-raid documentation', url: 'https://docs.kernel.org/admin-guide/device-mapper/dm-raid.html', note: 'RAID 5/6 layouts and the RAID 10 near layout' },
];
