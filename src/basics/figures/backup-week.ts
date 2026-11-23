/**
 * One week of nightly backups for the figure on backup: a full backup on Sunday night, then each
 * night a full, incremental or differential one. Which backups does a restore need, how much is
 * stored, and what is lost when one of them is damaged?
 *
 * To keep the arithmetic visible, every day changes different data, so a differential backup is
 * the sum of the changes since Sunday. The sizes are invented.
 */

export type Strategy = 'full' | 'incremental' | 'differential';
export type Kind = 'full' | 'incremental' | 'differential';

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Size of all data, in GB. */
export const DATA_SIZE = 100;
/** Data changed during each day, in GB; Sunday's backup is the first full one. */
export const CHANGES = [0, 5, 3, 8, 4, 6, 2];

export interface Night {
  day: number;
  kind: Kind;
  /** Size of the backup in GB. */
  size: number;
}

export function plan(strategy: Strategy): Night[] {
  return DAYS.map((_, day) => {
    if (day === 0 || strategy === 'full') return { day, kind: 'full', size: DATA_SIZE };
    if (strategy === 'incremental') return { day, kind: 'incremental', size: CHANGES[day] };
    return { day, kind: 'differential', size: CHANGES.slice(1, day + 1).reduce((a, b) => a + b, 0) };
  });
}

/** The backups a restore to the state of `day` needs, oldest first. */
export function chain(strategy: Strategy, day: number): number[] {
  if (day < 0 || day >= DAYS.length) throw new RangeError(`no such day: ${day}`);
  if (strategy === 'full' || day === 0) return [day];
  if (strategy === 'differential') return [0, day];
  return Array.from({ length: day + 1 }, (_, i) => i);
}

export interface Restore {
  needed: number[];
  /** GB to read for the restore. */
  read: number;
  /** The first damaged backup in the chain, if any. */
  broken?: number;
}

export function restore(strategy: Strategy, day: number, damaged: ReadonlySet<number> = new Set()): Restore {
  const nights = plan(strategy);
  const needed = chain(strategy, day);
  const broken = needed.find((d) => damaged.has(d));
  return { needed, read: needed.reduce((s, d) => s + nights[d].size, 0), ...(broken === undefined ? {} : { broken }) };
}

/** The latest day whose state can still be restored, or undefined if none can. */
export function latestRestorable(strategy: Strategy, damaged: ReadonlySet<number>): number | undefined {
  for (let d = DAYS.length - 1; d >= 0; d--) if (restore(strategy, d, damaged).broken === undefined) return d;
  return undefined;
}

export const stored = (strategy: Strategy): number => plan(strategy).reduce((s, n) => s + n.size, 0);
