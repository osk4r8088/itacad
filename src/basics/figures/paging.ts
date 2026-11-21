/**
 * Address translation for the virtual memory figure: two processes, their page tables and a small
 * physical memory. The rules are those of the topic (4 KiB pages, a 12-bit offset, rights per page,
 * present bit); the numbers are invented for the picture. Real x86-64 page tables are a tree of four
 * levels; the figure shows only the entries in use, as one list per process.
 */

export const PAGE_SIZE = 4096;
export const OFFSET_BITS = 12;
/** Physical memory of the picture: 16 frames of 4 KiB, 64 KiB in all. */
export const FRAME_COUNT = 16;
/** Largest user address accepted in the input: 47 bits, the user half of a 4-level x86-64 address space. */
export const MAX_ADDRESS = 2 ** 47 - 1;

export type ProcessId = 'A' | 'B';
export type Access = 'read' | 'write';

export interface PageEntry {
  /** Virtual page number: the address without its 12 offset bits. */
  page: number;
  /** What the page holds, for the reader. */
  what: string;
  /** Frame in physical memory; absent when the page is not present. */
  frame?: number;
  writable: boolean;
  executable: boolean;
  /** Why a page is not present, shown when it is touched. */
  absent?: string;
}

export const PAGE_TABLES: Record<ProcessId, PageEntry[]> = {
  A: [
    { page: 0x00400, what: 'Program code', frame: 3, writable: false, executable: true },
    { page: 0x00401, what: 'Data', frame: 7, writable: true, executable: false },
    { page: 0x00402, what: 'Heap', frame: 12, writable: true, executable: false },
    { page: 0x7f3a2, what: 'Shared library code', frame: 9, writable: false, executable: true },
    { page: 0x7ffd1, what: 'Stack', frame: 14, writable: true, executable: false },
  ],
  B: [
    { page: 0x00400, what: 'Program code', frame: 5, writable: false, executable: true },
    { page: 0x00401, what: 'Data', frame: 1, writable: true, executable: false },
    { page: 0x00402, what: 'Heap', writable: true, executable: false, absent: 'moved to disk because memory ran short (swapped out)' },
    { page: 0x7f81c, what: 'Shared library code', frame: 9, writable: false, executable: true },
    { page: 0x7ffd1, what: 'Stack', frame: 10, writable: true, executable: false },
  ],
};

/** What each frame holds, derived from the page tables; frame 0 belongs to the kernel in this picture. */
export function frameOwners(): { frame: number; owners: string[] }[] {
  return Array.from({ length: FRAME_COUNT }, (_, frame) => {
    const owners: string[] = frame === 0 ? ['Kernel'] : [];
    for (const p of ['A', 'B'] as ProcessId[]) for (const e of PAGE_TABLES[p]) if (e.frame === frame) owners.push(`${p}: ${e.what}`);
    return { frame, owners };
  });
}

/** Address presets per process; the shared library sits at a different address in each process. */
export interface Preset {
  label: string;
  address: number;
  access: Access;
}

export function presets(p: ProcessId): Preset[] {
  const library = PAGE_TABLES[p].find((e) => e.what === 'Shared library code')!.page;
  return [
    { label: 'Read code', address: 0x00400a2c, access: 'read' },
    { label: 'Write data', address: 0x00401010, access: 'write' },
    { label: 'Read heap', address: 0x00402100, access: 'read' },
    { label: 'Read shared library', address: library * PAGE_SIZE + 0x150, access: 'read' },
    { label: 'Write stack', address: 0x7ffd1ff8, access: 'write' },
    { label: 'Write code', address: 0x00400a2c, access: 'write' },
    { label: 'Null pointer', address: 0x00000010, access: 'read' },
  ];
}

export type Outcome =
  | { kind: 'ok'; entry: PageEntry; frame: number; physical: number }
  | { kind: 'not-present'; entry: PageEntry }
  | { kind: 'unmapped' }
  | { kind: 'protection'; entry: PageEntry };

export interface Translation {
  address: number;
  page: number;
  offset: number;
  outcome: Outcome;
}

export const pageOf = (address: number) => Math.floor(address / PAGE_SIZE);
export const offsetOf = (address: number) => address % PAGE_SIZE;

/** What the MMU and, on a fault, the kernel make of one access. */
export function translate(p: ProcessId, address: number, access: Access): Translation {
  const page = pageOf(address);
  const offset = offsetOf(address);
  const entry = PAGE_TABLES[p].find((e) => e.page === page);
  const outcome: Outcome = !entry
    ? { kind: 'unmapped' }
    : entry.frame === undefined
      ? { kind: 'not-present', entry }
      : access === 'write' && !entry.writable
        ? { kind: 'protection', entry }
        : { kind: 'ok', entry, frame: entry.frame, physical: entry.frame * PAGE_SIZE + offset };
  return { address, page, offset, outcome };
}

/** "0x00400a2c": eight hex digits for the addresses of the picture, more when needed. */
export const hexAddress = (n: number) => `0x${n.toString(16).padStart(8, '0')}`;
/** "0x00400": the page number with five digits, so that it lines up with the address above it. */
export const hexPage = (n: number) => `0x${n.toString(16).padStart(5, '0')}`;
export const hexOffset = (n: number) => `0x${n.toString(16).padStart(3, '0')}`;
/** "0x3a2c": a physical address of the 64 KiB picture memory, frame digit and offset. */
export const hexPhysical = (n: number) => `0x${n.toString(16).padStart(4, '0')}`;
export const rights = (e: PageEntry) => `r${e.writable ? 'w' : '-'}${e.executable ? 'x' : '-'}`;

/** Reads a typed address: hex with or without 0x, underscores allowed. Undefined if it is not one. */
export function parseAddress(text: string): number | undefined {
  const t = text.trim().toLowerCase().replace(/_/g, '').replace(/^0x/, '');
  if (!/^[0-9a-f]{1,12}$/.test(t)) return undefined;
  const n = parseInt(t, 16);
  return n <= MAX_ADDRESS ? n : undefined;
}
