/**
 * A small round-robin scheduler for the figure on processes: a few processes alternate between
 * using the processor and waiting for input or output, and one or two cores serve them in turn.
 *
 * The model follows the textbook picture (OSTEP, chapter 7): one first-in, first-out ready queue,
 * a fixed time slice, and a process that gives up the core early when it has to wait.
 * Time is counted in ticks; a tick has no fixed length here.
 */

/** A stretch of work: computing on a core, or waiting for a disk, the network or the user. */
export type Phase = { cpu: number } | { wait: number; for: string };

export interface ProcessSpec {
  id: string;
  name: string;
  /** What kind of program this is, in a few words. */
  kind: string;
  phases: Phase[];
}

export type State = 'running' | 'ready' | 'blocked' | 'done';

export interface Tick {
  /** Which process runs on each core during this tick, or null when the core is idle. */
  cores: (string | null)[];
  /** The state of every process during this tick. */
  states: Record<string, State>;
  /** What a blocked process is waiting for. */
  waitingFor: Record<string, string>;
}

export interface Run {
  ticks: Tick[];
  /** Number of times a core switched from one process to a different one. */
  switches: number;
  /** The tick after which each process had finished. */
  finished: Record<string, number>;
  /** Share of core ticks spent running a process, from 0 to 1. */
  utilization: number;
}

export const PROCESSES: ProcessSpec[] = [
  { id: 'A', name: 'Compiler', kind: 'computes without pause', phases: [{ cpu: 9 }] },
  {
    id: 'B',
    name: 'Editor',
    kind: 'short bursts, then waits for keys',
    phases: [{ cpu: 1 }, { wait: 4, for: 'a key press' }, { cpu: 1 }, { wait: 4, for: 'a key press' }, { cpu: 1 }],
  },
  {
    id: 'C',
    name: 'Backup',
    kind: 'reads the disk in between',
    phases: [{ cpu: 2 }, { wait: 3, for: 'the disk' }, { cpu: 3 }, { wait: 3, for: 'the disk' }, { cpu: 1 }],
  },
  { id: 'D', name: 'Web server', kind: 'answers a request', phases: [{ cpu: 3 }, { wait: 2, for: 'the network' }, { cpu: 2 }] },
];

interface Live {
  spec: ProcessSpec;
  phase: number;
  left: number;
}

const isCpu = (p: Phase): p is { cpu: number } => 'cpu' in p;

/** Total processor time a process needs. */
export function cpuTime(spec: ProcessSpec): number {
  return spec.phases.reduce((sum, p) => sum + (isCpu(p) ? p.cpu : 0), 0);
}

/**
 * Simulates round robin on `cores` cores with a time slice of `slice` ticks.
 * All processes are ready at tick 0, in the order given. Within a tick, processes whose wait ends
 * join the queue first, then cores whose process used up its slice or has to wait are handed on,
 * then idle cores take the next process from the queue.
 */
export function simulate(processes: ProcessSpec[], cores: number, slice: number, limit = 200): Run {
  if (cores < 1 || slice < 1) throw new RangeError('cores and slice must be at least 1');
  const live = new Map<string, Live>();
  for (const spec of processes) {
    if (spec.phases.length === 0 || !isCpu(spec.phases[0])) throw new RangeError(`${spec.id} must start with processor work`);
    live.set(spec.id, { spec, phase: 0, left: (spec.phases[0] as { cpu: number }).cpu });
  }
  const queue: string[] = processes.map((p) => p.id);
  const blocked = new Set<string>();
  const done = new Set<string>();
  const onCore: (string | null)[] = Array(cores).fill(null);
  const usedSlice: number[] = Array(cores).fill(0);
  const lastOnCore: (string | null)[] = Array(cores).fill(null);
  const finished: Record<string, number> = {};
  const ticks: Tick[] = [];
  let switches = 0;
  let busy = 0;

  /** Moves a process to its next phase; returns where it goes. */
  const advance = (id: string): 'ready' | 'blocked' | 'done' => {
    const l = live.get(id)!;
    l.phase += 1;
    const next = l.spec.phases[l.phase];
    if (next === undefined) return 'done';
    l.left = isCpu(next) ? next.cpu : next.wait;
    return isCpu(next) ? 'ready' : 'blocked';
  };

  for (let t = 0; t < limit && done.size < processes.length; t++) {
    // 1. Waits that have ended: the process becomes ready.
    for (const spec of processes) {
      const l = live.get(spec.id)!;
      if (blocked.has(spec.id) && l.left === 0) {
        blocked.delete(spec.id);
        const to = advance(spec.id);
        if (to === 'ready') queue.push(spec.id);
        else if (to === 'done') {
          done.add(spec.id);
          finished[spec.id] = t;
        } else blocked.add(spec.id);
      }
    }
    // 2. Cores whose process finished its burst or used up its slice.
    for (let c = 0; c < cores; c++) {
      const id = onCore[c];
      if (id === null) continue;
      const l = live.get(id)!;
      if (l.left === 0) {
        onCore[c] = null;
        const to = advance(id);
        if (to === 'blocked') blocked.add(id);
        else if (to === 'ready') queue.push(id);
        else {
          done.add(id);
          finished[id] = t;
        }
      } else if (usedSlice[c] >= slice && queue.length > 0) {
        onCore[c] = null;
        queue.push(id);
      } else if (usedSlice[c] >= slice) {
        usedSlice[c] = 0; // nobody is waiting: it simply keeps the core for another slice
      }
    }
    // 3. Idle cores take the next ready process.
    for (let c = 0; c < cores; c++) {
      if (onCore[c] !== null || queue.length === 0) continue;
      const id = queue.shift()!;
      onCore[c] = id;
      usedSlice[c] = 0;
      if (lastOnCore[c] !== null && lastOnCore[c] !== id) switches += 1;
      lastOnCore[c] = id;
    }
    if (done.size === processes.length) break;

    // 4. Record the tick, then let it pass.
    const states: Record<string, State> = {};
    const waitingFor: Record<string, string> = {};
    for (const spec of processes) {
      const l = live.get(spec.id)!;
      if (done.has(spec.id)) states[spec.id] = 'done';
      else if (onCore.includes(spec.id)) states[spec.id] = 'running';
      else if (blocked.has(spec.id)) {
        states[spec.id] = 'blocked';
        waitingFor[spec.id] = (l.spec.phases[l.phase] as { for: string }).for;
      } else states[spec.id] = 'ready';
    }
    ticks.push({ cores: [...onCore], states, waitingFor });
    for (let c = 0; c < cores; c++) {
      const id = onCore[c];
      if (id === null) continue;
      live.get(id)!.left -= 1;
      usedSlice[c] += 1;
      busy += 1;
    }
    for (const id of blocked) live.get(id)!.left -= 1;
  }

  return { ticks, switches, finished, utilization: ticks.length ? busy / (ticks.length * cores) : 0 };
}

/** One sentence per process for the chosen tick, in plain words. */
export function describeTick(run: Run, processes: ProcessSpec[], t: number): string[] {
  const tick = run.ticks[t];
  if (!tick) return [];
  return processes.map((p) => {
    const s = tick.states[p.id];
    switch (s) {
      case 'running':
        return `${p.name} (${p.id}) runs on core ${tick.cores.indexOf(p.id) + 1}.`;
      case 'ready':
        return `${p.name} (${p.id}) is ready and waits for a free core.`;
      case 'blocked':
        return `${p.name} (${p.id}) is blocked, waiting for ${tick.waitingFor[p.id]}.`;
      case 'done':
        return `${p.name} (${p.id}) has finished.`;
    }
  });
}
