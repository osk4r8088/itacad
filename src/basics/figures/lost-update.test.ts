import { describe, expect, it } from 'vitest';
import { SCENARIOS, START, run } from './lost-update';

const byId = (id: string) => run(SCENARIOS.find((s) => s.id === id)!.schedule);

describe('two sales at the same time', () => {
  it('loses one sale when both read 5 and write 4 at read committed', () => {
    const r = byId('lost');
    expect(r.final).toBe(START - 1);
    const writes = r.events.filter((e) => /writes/.test(e.result)).map((e) => e.result.match(/writes (\d+)/)![1]);
    expect(writes).toEqual(['4', '4']);
    expect(r.events.some((e) => e.kind === 'wait' && e.session === 2)).toBe(true);
  });

  it('counts both sales with an atomic update: the second waits, then subtracts from the new value', () => {
    const r = byId('atomic');
    expect(r.final).toBe(START - 2);
    const resumed = r.events.find((e) => e.kind === 'resume')!;
    expect(resumed.session).toBe(2);
    expect(resumed.result).toMatch(/writes 3/);
  });

  it('counts both sales when reading with FOR UPDATE: the second read waits and then sees 4', () => {
    const r = byId('for-update');
    expect(r.final).toBe(START - 2);
    expect(r.events.find((e) => e.kind === 'resume')!.result).toMatch(/reads 4/);
  });

  it('aborts the second writer at repeatable read, and the retry counts both sales', () => {
    const r = byId('repeatable');
    const error = r.events.find((e) => e.kind === 'error')!;
    expect(error.session).toBe(2);
    expect(error.result).toBe('ERROR: could not serialize access due to concurrent update');
    expect(r.events.some((e) => /nothing of it is saved/.test(e.result))).toBe(true);
    expect(r.events.some((e) => /retries/.test(e.result))).toBe(true);
    expect(r.final).toBe(START - 2);
  });

  it('never commits a value that was not written, and ends every scenario with both sessions done', () => {
    for (const sc of SCENARIOS) {
      const r = run(sc.schedule);
      const commits = r.events.filter((e) => /commits/.test(e.result));
      expect(commits.length, sc.id).toBe(2);
      for (const e of r.events) expect(e.committed).toBeGreaterThanOrEqual(START - 2);
    }
  });

  it('shows the same result when the sessions run one after the other', () => {
    for (const sc of SCENARIOS) {
      const one = sc.schedule.filter(([s]) => s === 1);
      const two = sc.schedule.filter(([s]) => s === 2);
      // Without overlap, every way of selling twice leaves 3.
      const serial = [...one, ...two.slice(-4)];
      expect(run(serial).final, sc.id).toBe(START - 2);
    }
  });
});
