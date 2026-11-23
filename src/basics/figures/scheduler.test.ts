import { describe, expect, it } from 'vitest';
import { PROCESSES, cpuTime, describeTick, simulate, type ProcessSpec } from './scheduler';

const settings = [1, 2].flatMap((cores) => [1, 2, 4].map((slice) => ({ cores, slice })));

describe('the round-robin simulation', () => {
  for (const { cores, slice } of settings) {
    describe(`${cores} core(s), slice ${slice}`, () => {
      const run = simulate(PROCESSES, cores, slice);

      it('finishes every process', () => {
        for (const p of PROCESSES) expect(run.finished[p.id], p.id).toBeDefined();
      });

      it('gives every process exactly the processor time it needs', () => {
        for (const p of PROCESSES) {
          const ran = run.ticks.filter((t) => t.cores.includes(p.id)).length;
          expect(ran, p.id).toBe(cpuTime(p));
        }
      });

      it('never runs one process on two cores, and agrees with the state table', () => {
        for (const t of run.ticks) {
          const busy = t.cores.filter((c) => c !== null);
          expect(new Set(busy).size).toBe(busy.length);
          for (const p of PROCESSES) expect(t.states[p.id] === 'running', p.id).toBe(t.cores.includes(p.id));
        }
      });

      it('never leaves a core idle while a process is ready', () => {
        for (const t of run.ticks) {
          const idle = t.cores.some((c) => c === null);
          const ready = PROCESSES.some((p) => t.states[p.id] === 'ready');
          expect(idle && ready).toBe(false);
        }
      });

      it('blocks a process for exactly as long as each of its waits', () => {
        for (const p of PROCESSES) {
          const waited = run.ticks.filter((t) => t.states[p.id] === 'blocked').length;
          const needed = p.phases.reduce((s, ph) => s + ('wait' in ph ? ph.wait : 0), 0);
          expect(waited, p.id).toBe(needed);
        }
      });

    });
  }

  it('takes the core away after one slice when others are ready', () => {
    const busy: ProcessSpec[] = ['P', 'Q', 'R'].map((id) => ({ id, name: id, kind: '', phases: [{ cpu: 7 }] }));
    for (const slice of [1, 2, 3, 4]) {
      let streak = 0;
      let prev: string | null = null;
      let longest = 0;
      for (const t of simulate(busy, 1, slice).ticks) {
        streak = t.cores[0] === prev ? streak + 1 : 1;
        prev = t.cores[0];
        const othersLeft = busy.some((p) => t.states[p.id] === 'ready');
        if (othersLeft) longest = Math.max(longest, streak);
      }
      expect(longest, `slice ${slice}`).toBe(slice);
    }
  });

  it('finishes sooner with two cores than with one', () => {
    for (const slice of [1, 2, 4]) expect(simulate(PROCESSES, 2, slice).ticks.length).toBeLessThan(simulate(PROCESSES, 1, slice).ticks.length);
  });

  it('switches more often with a shorter slice', () => {
    expect(simulate(PROCESSES, 1, 1).switches).toBeGreaterThan(simulate(PROCESSES, 1, 4).switches);
  });

  it('lets a lone process keep the core after its slice when nobody else is ready', () => {
    const solo: ProcessSpec[] = [{ id: 'X', name: 'X', kind: '', phases: [{ cpu: 5 }] }];
    const run = simulate(solo, 1, 2);
    expect(run.ticks.map((t) => t.cores[0])).toEqual(['X', 'X', 'X', 'X', 'X']);
    expect(run.switches).toBe(0);
    expect(run.utilization).toBe(1);
  });

  it('serves the queue in order: with a slice of 1, three computing processes take turns', () => {
    const three: ProcessSpec[] = ['P', 'Q', 'R'].map((id) => ({ id, name: id, kind: '', phases: [{ cpu: 2 }] }));
    expect(simulate(three, 1, 1).ticks.map((t) => t.cores[0]).join('')).toBe('PQRPQR');
  });

  it('describes a tick in one sentence per process', () => {
    const run = simulate(PROCESSES, 1, 2);
    const lines = describeTick(run, PROCESSES, 0);
    expect(lines).toHaveLength(PROCESSES.length);
    expect(lines[0]).toBe('Compiler (A) runs on core 1.');
    expect(lines[1]).toMatch(/ready/);
    expect(describeTick(run, PROCESSES, 999)).toEqual([]);
  });

  it('rejects settings and processes it cannot simulate', () => {
    expect(() => simulate(PROCESSES, 0, 2)).toThrow(RangeError);
    expect(() => simulate([{ id: 'W', name: 'W', kind: '', phases: [{ wait: 1, for: 'x' }] }], 1, 1)).toThrow(RangeError);
  });
});
