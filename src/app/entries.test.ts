import { describe, expect, it } from 'vitest';
import { PATHS, allEntries, resolveRef, visitedRef } from './entries';
import { parseRoute } from './router';
import type { Level } from '../shared/levels';
import type { EntryRef } from '../shared/refs';

const entries = allEntries();
const key = (ref: EntryRef) => JSON.stringify(ref);

describe('levels and prerequisites', () => {
  it('resolves every entry with a level from 1 to 3', () => {
    for (const e of entries) {
      expect(e, 'unresolved entry').toBeDefined();
      expect([1, 2, 3], e.title).toContain(e.level);
    }
  });

  it('points prerequisites to existing entries at the same or a lower level', () => {
    for (const e of entries)
      for (const ref of e.prereqs) {
        const p = resolveRef(ref);
        expect(p, `${e.title}: ${key(ref)}`).toBeDefined();
        expect(key(p!.ref), `${e.title} needs itself`).not.toBe(key(e.ref));
        expect(p!.level, `${e.title} (level ${e.level}) needs ${p!.title} (level ${p!.level})`).toBeLessThanOrEqual(e.level);
      }
  });

  it('has no cycles of prerequisites', () => {
    const visit = (ref: EntryRef, seen: string[]): void => {
      const k = key(ref);
      expect(seen, `cycle: ${[...seen, k].join(' -> ')}`).not.toContain(k);
      for (const p of resolveRef(ref)!.prereqs) visit(p, [...seen, k]);
    };
    for (const e of entries) visit(e.ref, []);
  });
});

describe('start page paths', () => {
  it.each([1, 2, 3] as Level[])('level %i links only to ready pages at or below its level', (level) => {
    const path = PATHS[level];
    expect(path.steps.length).toBeGreaterThanOrEqual(4);
    for (const step of path.steps) {
      const info = resolveRef(step.ref);
      expect(info, key(step.ref)).toBeDefined();
      expect(info!.planned, info!.title).toBe(false);
      expect(info!.level, info!.title).toBeLessThanOrEqual(level);
      expect(parseRoute(info!.href).page, info!.href).not.toBe('redirect');
      expect(step.why).not.toContain('—');
    }
  });
});

describe('visits for the reader\'s progress', () => {
  it.each([
    ['#/basics/hardware/cpu', { topic: 'cpu' }],
    ['#/basics/os/virtual-memory/term/page-table', { topic: 'virtual-memory' }],
    ['#/protocols/tcp/3', { protocol: 'tcp' }],
    ['#/protocols/tcp/3/tcp/window', { protocol: 'tcp' }],
    ['#/learn/syn-flood/2', { entry: 'syn-flood' }],
    ['#/learn/layers/4', { entry: 'layers' }],
    ['#/tools/subnet', { entry: 'subnet' }],
    ['#/explore/raid', { entry: 'raid' }],
  ])('%s counts as a visit', (hash, ref) => {
    expect(visitedRef(parseRoute(hash))).toEqual(ref);
  });
  it.each(['#/', '#/basics', '#/basics/hardware', '#/basics/glossary', '#/protocols', '#/learn', '#/learn/quizzes/tcp', '#/protocols/nope/1', '#/basics/hardware/nope', '#/learn/subnet', '#/tools/raid'])('%s does not', (hash) => {
    expect(visitedRef(parseRoute(hash))).toBeUndefined();
  });
  it('counts every step of every start page path', () => {
    for (const level of [1, 2, 3] as Level[]) for (const step of PATHS[level].steps) expect(visitedRef(parseRoute(resolveRef(step.ref)!.href)), JSON.stringify(step.ref)).toEqual(step.ref);
  });
});
