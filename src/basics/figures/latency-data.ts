/**
 * Typical access times along the memory hierarchy, as orders of magnitude.
 * Real values depend on the processor, memory, drive and network; the notes say how each value is
 * derived. The point of the scale is the ratio between the levels, not the exact numbers.
 */
export interface LatencyLevel {
  id: string;
  name: string;
  /** Typical time for one access, in seconds. */
  seconds: number;
  /** Range or derivation shown next to the value. */
  note: string;
  /** Typical size of this level, for the "small and fast versus large and slow" contrast. */
  size: string;
}

export const LATENCIES: LatencyLevel[] = [
  { id: 'cycle', name: 'One CPU cycle at 3 GHz', seconds: 0.33e-9, note: 'calculated: 1 / 3 GHz', size: 'registers: a few hundred bytes to a few KiB' },
  { id: 'l1', name: 'Level 1 cache hit', seconds: 1e-9, note: 'about 4 to 5 cycles', size: 'tens of KiB per core' },
  { id: 'l2', name: 'Level 2 cache hit', seconds: 4e-9, note: 'about 12 to 16 cycles', size: 'about 0.5 to 2 MiB per core' },
  { id: 'l3', name: 'Level 3 cache hit', seconds: 15e-9, note: 'about 40 to 70 cycles', size: 'tens of MiB, shared' },
  { id: 'ram', name: 'Main memory (DRAM)', seconds: 90e-9, note: 'about 70 to 120 ns', size: 'GiB' },
  { id: 'nvme', name: 'NVMe SSD, random read', seconds: 60e-6, note: 'tens to about 100 microseconds', size: 'hundreds of GB to TB' },
  { id: 'lan', name: 'Round trip in a local network', seconds: 300e-6, note: 'a few hundred microseconds', size: '' },
  { id: 'hdd', name: 'Hard disk, random read', seconds: 8e-3, note: 'seek plus half a rotation; at 7200 rpm the half rotation alone is 4.2 ms', size: 'TB' },
  { id: 'wan', name: 'Round trip Frankfurt to New York', seconds: 80e-3, note: 'light in fibre needs at least about 62 ms for the roughly 6,200 km there and back; real paths are longer', size: '' },
];

/** Human time: one nanosecond becomes one second. */
export const HUMAN_SCALE = 1e9;

const UNITS: [number, string][] = [
  [365 * 24 * 3600, 'years'],
  [30 * 24 * 3600, 'months'],
  [24 * 3600, 'days'],
  [3600, 'hours'],
  [60, 'minutes'],
  [1, 'seconds'],
];

/** "1.5 minutes", "3.2 years": a duration in the largest unit that keeps the number at 1 or more. */
export function humanDuration(seconds: number): string {
  const [size, unit] = UNITS.find(([s]) => seconds >= s) ?? UNITS[UNITS.length - 1];
  const n = seconds / size;
  const shown = n >= 10 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, '');
  return `${shown} ${shown === '1' ? unit.replace(/s$/, '') : unit}`;
}

/** "90 ns", "60 µs", "8 ms": a duration in technical units. */
export function techDuration(seconds: number): string {
  const steps: [number, string][] = [
    [1, 's'],
    [1e-3, 'ms'],
    [1e-6, 'µs'],
    [1e-9, 'ns'],
  ];
  const [size, unit] = steps.find(([s]) => seconds >= s) ?? steps[steps.length - 1];
  const n = seconds / size;
  return `${n >= 10 ? Math.round(n) : Number(n.toFixed(2))} ${unit}`;
}
