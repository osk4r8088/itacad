import { describe, expect, it } from 'vitest';
import { DAY, MONTH, YEAR, downtime, formatDuration, formatPercent, inParallel, inSeries } from './availability';

describe('availability arithmetic of the figure', () => {
  it('gives the downtime per year of the table in the topic', () => {
    expect(downtime(0.99, YEAR) / 86400).toBeCloseTo(3.65, 5);
    expect(downtime(0.999, YEAR) / 3600).toBeCloseTo(8.76, 5);
    expect(downtime(0.9999, YEAR) / 60).toBeCloseTo(52.56, 5);
    expect(downtime(0.99999, YEAR) / 60).toBeCloseTo(5.256, 5);
  });

  it('gives the downtime per day and per month', () => {
    expect(downtime(0.99, DAY) / 60).toBeCloseTo(14.4, 5);
    expect(downtime(0.999, MONTH) / 60).toBeCloseTo(43.2, 5);
  });

  it('multiplies components in a chain and combines spares', () => {
    expect(inSeries(0.999, 3)).toBeCloseTo(0.997003, 6);
    expect(inParallel(0.99, 2)).toBeCloseTo(0.9999, 10);
    expect(inSeries(0.999, 1)).toBe(0.999);
    expect(inParallel(0.999, 1)).toBeCloseTo(0.999, 12);
  });

  it('formats durations in two units', () => {
    expect(formatDuration(downtime(0.999, YEAR))).toBe('8 h 46 min');
    expect(formatDuration(downtime(0.99, YEAR))).toBe('3 d 16 h');
    expect(formatDuration(downtime(0.9999, YEAR))).toBe('52 min 34 s');
    expect(formatDuration(downtime(0.99999, DAY))).toBe('864 ms');
    expect(formatDuration(3600)).toBe('1 h');
    expect(formatDuration(3599.9)).toBe('1 h');
    expect(formatDuration(0)).toBe('less than a millisecond');
    expect(formatDuration(12.34)).toBe('12.3 s');
  });

  it('formats percentages without trailing zeros', () => {
    expect(formatPercent(0.999)).toBe('99.9 %');
    expect(formatPercent(inSeries(0.999, 3))).toBe('99.7002999 %');
    expect(formatPercent(inParallel(0.99, 2))).toBe('99.99 %');
    expect(formatPercent(1)).toBe('100 %');
  });
});
