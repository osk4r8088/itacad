import { describe, expect, it } from 'vitest';
import wordListText from './eff_large_wordlist.txt?raw';
import { alphabet, CHARSETS, entropyBits, formatDuration, generatePassphrase, generatePassword, LOOKALIKES, parseWordList, randomBelow, secondsToExhaust, type RandomFill } from './generate';
import { analyze } from './analyze';
import { DICTIONARY_NAMES, SCORE_NAMES } from './names';
import * as common from '@zxcvbn-ts/language-common';
import * as en from '@zxcvbn-ts/language-en';

/** A fake random source that returns the given values in order. */
const seq = (...values: number[]): RandomFill => {
  let i = 0;
  return (a) => {
    a[0] = values[i++ % values.length];
    return a;
  };
};

describe('randomBelow', () => {
  it('maps values below the limit with modulo', () => {
    expect(randomBelow(10, seq(0))).toBe(0);
    expect(randomBelow(10, seq(17))).toBe(7);
  });
  it('rejects values from the incomplete top block (no modulo bias)', () => {
    // 2^32 = 4294967296; for n = 10 the limit is 4294967290, so 4294967295 is rejected and 3 is used.
    expect(randomBelow(10, seq(4294967295, 3))).toBe(3);
  });
  it('covers the whole range with the real random source', () => {
    const seen = new Set(Array.from({ length: 2000 }, () => randomBelow(6)));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('passwords', () => {
  it('uses only characters of the chosen sets', () => {
    const o = { length: 64, sets: ['lower', 'digits'] as const, avoidLookalikes: false };
    const pw = generatePassword({ ...o, sets: [...o.sets] });
    expect(pw).toHaveLength(64);
    expect(pw).toMatch(/^[a-z0-9]+$/);
  });
  it('has 32 symbols and can drop look-alike characters', () => {
    expect(CHARSETS.symbols.chars).toHaveLength(32);
    const a = alphabet({ length: 1, sets: ['lower', 'upper', 'digits', 'symbols'], avoidLookalikes: true });
    for (const c of LOOKALIKES) expect(a).not.toContain(c);
    expect(alphabet({ length: 1, sets: ['lower', 'upper', 'digits', 'symbols'], avoidLookalikes: false })).toHaveLength(94);
  });
  it('computes entropy as length times log2 of the alphabet', () => {
    expect(entropyBits(16, 94)).toBeCloseTo(104.87, 2);
    expect(entropyBits(6, 7776)).toBeCloseTo(77.55, 2);
    expect(entropyBits(10, 1)).toBe(0);
  });
});

describe('EFF word list', () => {
  const list = parseWordList(wordListText);
  it('has 7776 unique words, one per roll of five dice', () => {
    expect(list).toHaveLength(7776);
    expect(new Set(list.map((w) => w.word)).size).toBe(7776);
    expect(list[0]).toEqual({ roll: '11111', word: 'abacus' });
    expect(list.at(-1)).toEqual({ roll: '66666', word: 'zoom' });
    expect(list.every((w) => /^[1-6]{5}$/.test(w.roll))).toBe(true);
  });
  it('builds passphrases from the list', () => {
    const { phrase, picks } = generatePassphrase(list, { words: 3, separator: '-' }, seq(0, 1, 7775));
    expect(phrase).toBe('abacus-abdomen-zoom');
    expect(picks.map((p) => p.roll)).toEqual(['11111', '11112', '66666']);
  });
});

describe('durations', () => {
  it('formats seconds in the largest fitting unit', () => {
    expect(formatDuration(0.5)).toBe('less than a second');
    expect(formatDuration(90)).toBe('1 minute');
    expect(formatDuration(3 * 86400)).toBe('3 days');
    expect(formatDuration(2 * 365.25 * 86400)).toBe('2 years');
    expect(formatDuration(1e20)).toBe('centuries');
  });
  it('computes time to try all possibilities', () => {
    expect(secondsToExhaust(10, 1024)).toBe(1);
  });
});

describe('analyze (zxcvbn)', () => {
  it('rates a common password as very weak and names the problem', () => {
    const r = analyze('password1');
    expect(r.score).toBe(0);
    expect(r.sequence.some((m) => m.pattern === 'dictionary')).toBe(true);
  });
  it('sees through common substitutions', () => {
    expect(analyze('P@ssw0rd').score).toBeLessThanOrEqual(1);
  });
  it('recognizes keyboard patterns and dates', () => {
    expect(analyze('qwertyuiop').sequence.some((m) => m.pattern === 'spatial' || m.pattern === 'dictionary')).toBe(true);
    expect(analyze('19.07.1994').sequence.some((m) => m.pattern === 'date')).toBe(true);
  });
  it('has a name for every score and every large dictionary', () => {
    expect(SCORE_NAMES).toHaveLength(5);
    const big = Object.entries({ ...common.dictionary, ...en.dictionary }).filter(([, words]) => (words as unknown[]).length > 1000);
    for (const [name] of big) expect(DICTIONARY_NAMES, name).toHaveProperty([name]);
  });
  it('rates a generated passphrase as very strong', () => {
    const list = parseWordList(wordListText);
    const { phrase } = generatePassphrase(list, { words: 6, separator: '-' });
    expect(analyze(phrase).score).toBe(4);
  });
});
