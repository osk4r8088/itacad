import { describe, expect, it } from 'vitest';
import { PATHS, allEntries, resolveRef } from './entries';
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
