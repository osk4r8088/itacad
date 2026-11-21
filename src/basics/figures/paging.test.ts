import { describe, expect, it } from 'vitest';
import { FRAME_COUNT, OFFSET_BITS, PAGE_SIZE, PAGE_TABLES, frameOwners, hexAddress, hexPhysical, offsetOf, pageOf, parseAddress, presets, rights, translate, type ProcessId } from './paging';

const both: ProcessId[] = ['A', 'B'];

describe('the numbers of the topic', () => {
  it('uses 4 KiB pages with a 12-bit offset', () => {
    expect(PAGE_SIZE).toBe(4096);
    expect(2 ** OFFSET_BITS).toBe(PAGE_SIZE);
  });
  it('splits an address into page and offset; the offset is the last three hex digits', () => {
    expect(pageOf(0x00400a2c)).toBe(0x00400);
    expect(offsetOf(0x00400a2c)).toBe(0xa2c);
    expect(hexAddress(0x00400a2c).slice(-3)).toBe('a2c');
  });
});

describe('the page tables of the picture', () => {
  it('stay inside physical memory and give each frame at most one page per process', () => {
    for (const p of both) {
      const frames = PAGE_TABLES[p].flatMap((e) => (e.frame === undefined ? [] : [e.frame]));
      for (const f of frames) expect(f).toBeGreaterThan(0);
      for (const f of frames) expect(f).toBeLessThan(FRAME_COUNT);
      expect(new Set(frames).size).toBe(frames.length);
      const pages = PAGE_TABLES[p].map((e) => e.page);
      expect(new Set(pages).size).toBe(pages.length);
    }
  });
  it('shares frames between the processes only for the library, at different virtual addresses', () => {
    const shared = PAGE_TABLES.A.filter((a) => a.frame !== undefined && PAGE_TABLES.B.some((b) => b.frame === a.frame));
    expect(shared.map((e) => e.what)).toEqual(['Shared library code']);
    const other = PAGE_TABLES.B.find((b) => b.frame === shared[0].frame)!;
    expect(other.page).not.toBe(shared[0].page);
    expect(rights(shared[0])).toBe('r-x');
  });
  it('gives a reason for every page that is not present, and no frame', () => {
    for (const p of both) for (const e of PAGE_TABLES[p]) expect(e.frame === undefined, `${p} ${e.what}`).toBe(e.absent !== undefined);
  });
  it('never makes a page both writable and executable', () => {
    for (const p of both) for (const e of PAGE_TABLES[p]) expect(e.writable && e.executable, `${p} ${e.what}`).toBe(false);
  });
  it('names the owners of every frame', () => {
    const owners = frameOwners();
    expect(owners).toHaveLength(FRAME_COUNT);
    expect(owners[0].owners).toEqual(['Kernel']);
    expect(owners[9].owners).toEqual(['A: Shared library code', 'B: Shared library code']);
  });
});

describe('translate', () => {
  it('maps the same virtual address to different frames in the two processes', () => {
    const a = translate('A', 0x00400a2c, 'read');
    const b = translate('B', 0x00400a2c, 'read');
    expect(a.outcome).toMatchObject({ kind: 'ok', frame: 3, physical: 0x3a2c });
    expect(b.outcome).toMatchObject({ kind: 'ok', frame: 5, physical: 0x5a2c });
    expect(hexPhysical(0x3a2c)).toBe('0x3a2c');
  });
  it('reaches one frame from both processes through the shared library', () => {
    const a = presets('A').find((p) => p.label === 'Read shared library')!;
    const b = presets('B').find((p) => p.label === 'Read shared library')!;
    expect(a.address).not.toBe(b.address);
    expect(translate('A', a.address, 'read').outcome).toMatchObject({ kind: 'ok', physical: 0x9150 });
    expect(translate('B', b.address, 'read').outcome).toMatchObject({ kind: 'ok', physical: 0x9150 });
  });
  it('turns a page that is not present into a page fault the kernel handles', () => {
    expect(translate('B', 0x00402100, 'read').outcome.kind).toBe('not-present');
    expect(translate('A', 0x00402100, 'read').outcome.kind).toBe('ok');
  });
  it('refuses writes to code and accesses to unmapped pages', () => {
    expect(translate('A', 0x00400a2c, 'write').outcome.kind).toBe('protection');
    expect(translate('A', 0x00000010, 'read').outcome.kind).toBe('unmapped');
    expect(translate('B', 0x12345678, 'write').outcome.kind).toBe('unmapped');
  });
  it('gives each preset the outcome its label promises', () => {
    const expected: Record<string, Record<ProcessId, string>> = {
      'Read code': { A: 'ok', B: 'ok' },
      'Write data': { A: 'ok', B: 'ok' },
      'Read heap': { A: 'ok', B: 'not-present' },
      'Read shared library': { A: 'ok', B: 'ok' },
      'Write stack': { A: 'ok', B: 'ok' },
      'Write code': { A: 'protection', B: 'protection' },
      'Null pointer': { A: 'unmapped', B: 'unmapped' },
    };
    for (const p of both) for (const preset of presets(p)) expect(translate(p, preset.address, preset.access).outcome.kind, `${p} ${preset.label}`).toBe(expected[preset.label][p]);
  });
});

describe('parseAddress', () => {
  it('reads hex with or without 0x, upper or lower case, with underscores', () => {
    expect(parseAddress('0x00400a2c')).toBe(0x00400a2c);
    expect(parseAddress('400A2C')).toBe(0x400a2c);
    expect(parseAddress(' 0x7ffd_1ff8 ')).toBe(0x7ffd1ff8);
  });
  it('refuses what is not a user address', () => {
    for (const t of ['', '0x', 'xyz', '-1', '0x1g', '0x800000000000', '0x1234567890abc']) expect(parseAddress(t), t).toBeUndefined();
    expect(parseAddress('0x7fffffffffff')).toBe(2 ** 47 - 1);
  });
});
