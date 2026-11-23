import { describe, expect, it } from 'vitest';
import { CHANGES, DATA_SIZE, DAYS, chain, latestRestorable, plan, restore, stored, type Strategy } from './backup-week';

const strategies: Strategy[] = ['full', 'incremental', 'differential'];
const days = DAYS.map((_, i) => i);

describe('a week of backups', () => {
  it('starts every strategy with a full backup on Sunday', () => {
    for (const s of strategies) expect(plan(s)[0]).toEqual({ day: 0, kind: 'full', size: DATA_SIZE });
  });

  it('matches the table on the page: what each kind copies and what a restore needs', () => {
    expect(chain('full', 3)).toEqual([3]);
    expect(chain('incremental', 3)).toEqual([0, 1, 2, 3]);
    expect(chain('differential', 3)).toEqual([0, 3]);
    for (const s of strategies) expect(chain(s, 0)).toEqual([0]);
  });

  it('answers the quiz: an incremental restore of Wednesday needs Sunday to Wednesday', () => {
    expect(chain('incremental', DAYS.indexOf('Wednesday')).map((d) => DAYS[d])).toEqual(['Sunday', 'Monday', 'Tuesday', 'Wednesday']);
  });

  it('copies only the day for incremental, everything since Sunday for differential', () => {
    const inc = plan('incremental');
    const diff = plan('differential');
    for (const d of days.slice(1)) {
      expect(inc[d].size).toBe(CHANGES[d]);
      expect(diff[d].size).toBe(inc.slice(1, d + 1).reduce((s, n) => s + n.size, 0));
      if (d > 1) expect(diff[d].size).toBeGreaterThan(diff[d - 1].size);
    }
  });

  it('stores least with incremental and most with full backups', () => {
    expect(stored('incremental')).toBeLessThan(stored('differential'));
    expect(stored('differential')).toBeLessThan(stored('full'));
    expect(stored('full')).toBe(DATA_SIZE * DAYS.length);
  });

  it('reads the same data for any restore without damage: the full set plus all changes up to that day', () => {
    for (const s of strategies) {
      for (const d of days) {
        const r = restore(s, d);
        expect(r.broken).toBeUndefined();
        if (s === 'full' || d === 0) expect(r.read).toBe(DATA_SIZE);
        else expect(r.read).toBe(DATA_SIZE + CHANGES.slice(1, d + 1).reduce((a, b) => a + b, 0));
      }
    }
  });

  it('breaks every later incremental restore when one increment is damaged', () => {
    const damaged = new Set([2]);
    for (const d of days) expect(restore('incremental', d, damaged).broken).toBe(d >= 2 ? 2 : undefined);
    expect(latestRestorable('incremental', damaged)).toBe(1);
  });

  it('loses only that night with a damaged differential, and everything with a damaged full backup', () => {
    expect(latestRestorable('differential', new Set([6]))).toBe(5);
    expect(latestRestorable('differential', new Set([2]))).toBe(6);
    for (const s of ['incremental', 'differential'] as Strategy[]) expect(latestRestorable(s, new Set([0]))).toBeUndefined();
    expect(latestRestorable('full', new Set([0]))).toBe(6);
  });

  it('rejects days outside the week', () => {
    expect(() => chain('full', 7)).toThrow(RangeError);
  });
});
