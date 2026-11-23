import { describe, expect, it } from 'vitest';
import { EXAMPLES, MAX_MATCH, MIN_MATCH, WINDOWS, decode, encode, summarize } from './lz77';

const samples = [...EXAMPLES.map((e) => e.text), '', 'a', 'abcabcabcabc', 'abababababab x abab', 'größe größer größte', 'x'.repeat(600)];

describe('LZ77 references', () => {
  it('uses the length limits of DEFLATE (RFC 1951)', () => {
    expect([MIN_MATCH, MAX_MATCH]).toEqual([3, 258]);
  });

  for (const w of [...WINDOWS, 1, 3]) {
    it(`gives the text back exactly with a window of ${w}`, () => {
      for (const s of samples) expect(decode(encode(s, w)), s.slice(0, 20)).toBe(s);
    });
    it(`keeps every reference inside the window of ${w} and the length limits`, () => {
      for (const s of samples)
        for (const t of encode(s, w))
          if (t.kind === 'ref') {
            expect(t.distance).toBeLessThanOrEqual(w);
            expect(t.distance).toBeLessThanOrEqual(t.at);
            expect(t.length).toBeGreaterThanOrEqual(MIN_MATCH);
            expect(t.length).toBeLessThanOrEqual(MAX_MATCH);
          }
    });
  }

  it('lets a reference overlap what it copies: twenty a are one a and one reference', () => {
    const t = encode('a'.repeat(20), 32);
    expect(t).toEqual([
      { kind: 'literal', char: 'a', at: 0 },
      { kind: 'ref', distance: 1, length: 19, at: 1 },
    ]);
  });

  it('splits a run longer than 258 into several references', () => {
    const refs = encode('x'.repeat(600), 4096).filter((t) => t.kind === 'ref');
    expect(refs.map((r) => (r.kind === 'ref' ? r.length : 0))).toEqual([258, 258, 83]);
  });

  it('finds the repeated words and the repeated log lines', () => {
    const words = encode('to be or not to be, that is the question', 4096);
    expect(words).toContainEqual({ kind: 'ref', distance: 13, length: 5, at: 13 });
    const log = summarize(EXAMPLES[0].text, encode(EXAMPLES[0].text, 4096));
    expect(log.refs).toBeGreaterThanOrEqual(3);
    expect(log.covered).toBeGreaterThan(log.characters / 3);
  });

  it('finds nothing to reference in a string without repetition', () => {
    const s = 'q7Xz!pL2@wR9#mK4';
    expect(summarize(s, encode(s, 4096))).toEqual({ characters: 16, literals: 16, refs: 0, covered: 0 });
  });

  it('finds less with a small window', () => {
    const s = EXAMPLES[0].text;
    expect(summarize(s, encode(s, 8)).covered).toBeLessThan(summarize(s, encode(s, 4096)).covered);
  });

  it('counts characters, not UTF-16 units', () => {
    expect(summarize('größe', encode('größe', 32)).characters).toBe(5);
  });

  it('rejects a reference that points before the start', () => {
    expect(() => decode([{ kind: 'ref', distance: 2, length: 3, at: 0 }])).toThrow(RangeError);
    expect(() => encode('abc', 0)).toThrow(RangeError);
  });
});
