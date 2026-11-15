import { describe, expect, it } from 'vitest';
import { KEYS_PER_PAGE, SIZES, lookupPages, scanPages, treeLevels } from './index-math';

describe('index figure arithmetic', () => {
  it('reads every page in a scan', () => {
    expect(scanPages(100)).toBe(1);
    expect(scanPages(101)).toBe(2);
    expect(scanPages(1e6)).toBe(10_000);
    expect(scanPages(0)).toBe(1);
  });

  it('gives the tree levels quoted in the topic', () => {
    expect(treeLevels(1e6)).toBe(3);
    expect(treeLevels(1e9)).toBe(4);
  });

  it('adds a level exactly when the capacity is exceeded', () => {
    expect(treeLevels(1)).toBe(1);
    expect(treeLevels(KEYS_PER_PAGE)).toBe(1);
    expect(treeLevels(KEYS_PER_PAGE + 1)).toBe(2);
    expect(treeLevels(KEYS_PER_PAGE ** 2)).toBe(2);
    expect(treeLevels(KEYS_PER_PAGE ** 2 + 1)).toBe(3);
  });

  it('keeps the lookup tiny while the scan grows with the table', () => {
    const lookups = SIZES.map(lookupPages);
    expect(Math.max(...lookups)).toBeLessThanOrEqual(6);
    for (let i = 1; i < SIZES.length; i++) {
      expect(scanPages(SIZES[i])).toBe(scanPages(SIZES[i - 1]) * 10);
      expect(lookups[i]).toBeGreaterThanOrEqual(lookups[i - 1]);
    }
  });
});
