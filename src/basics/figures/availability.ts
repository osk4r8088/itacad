/** Availability arithmetic for the calculator figure. Availabilities are fractions between 0 and 1. */

export const YEAR = 365 * 24 * 3600;
export const MONTH = 30 * 24 * 3600;
export const DAY = 24 * 3600;

/** Seconds of downtime an availability allows within a period. */
export const downtime = (availability: number, periodSeconds: number) => (1 - availability) * periodSeconds;

/** All of n components are needed: the availabilities multiply. */
export const inSeries = (availability: number, n: number) => availability ** n;

/** Any one of n independent components is enough: only a failure of all of them is an outage. */
export const inParallel = (availability: number, n: number) => 1 - (1 - availability) ** n;

/** A duration in the two largest fitting units, for example "8 h 46 min". */
export function formatDuration(seconds: number): string {
  if (seconds < 0.001) return 'less than a millisecond';
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  if (Math.round(seconds * 10) / 10 < 60) return `${trim(seconds)} s`;
  const units: [number, string][] = [
    [86400, 'd'],
    [3600, 'h'],
    [60, 'min'],
    [1, 's'],
  ];
  const pick = (value: number) => units.findIndex(([size]) => value >= size);
  // Round to the smaller of the two units shown, then choose the units again in case that carried over.
  const grain = (units[pick(seconds) + 1] ?? units[pick(seconds)])[0];
  const rounded = Math.round(seconds / grain) * grain;
  const at = pick(rounded);
  const [size, name] = units[at];
  const whole = Math.floor(rounded / size);
  const next = units[at + 1];
  const rest = next ? Math.floor((rounded - whole * size) / next[0]) : 0;
  return rest === 0 ? `${whole} ${name}` : `${whole} ${name} ${rest} ${next[1]}`;
}

const trim = (n: number) => String(Math.round(n * 10) / 10);

/** A fraction as a percentage with enough digits to show the nines, without trailing zeros. */
export function formatPercent(availability: number): string {
  const percent = availability * 100;
  if (percent >= 100) return availability === 1 ? '100 %' : 'more than 99.9999999 %';
  return `${Number(percent.toFixed(7))} %`;
}
