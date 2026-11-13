import { describe, expect, it } from 'vitest';
import { byteCount, encodeCodePoint, encodeText, hex } from './utf8';

describe('UTF-8 encoder of the figure', () => {
  it('encodes the examples of the character encoding topic', () => {
    expect(encodeCodePoint(0x41).bytes.map(hex)).toEqual(['41']);
    expect(encodeCodePoint(0xe9).bytes.map(hex)).toEqual(['c3', 'a9']);
    expect(encodeCodePoint(0x20ac).bytes.map(hex)).toEqual(['e2', '82', 'ac']);
    expect(encodeCodePoint(0x1f600).bytes.map(hex)).toEqual(['f0', '9f', '98', '80']);
  });

  it('agrees with the platform encoder at the range borders and in between', () => {
    const encoder = new TextEncoder();
    const samples = [0, 0x7f, 0x80, 0x7ff, 0x800, 0xd7ff, 0xe000, 0xffff, 0x10000, 0x10348, 0x10ffff];
    for (let cp = 1; cp < 0x10ffff; cp += 977) samples.push(cp);
    for (const cp of samples) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      expect(encodeCodePoint(cp).bytes, `U+${cp.toString(16)}`).toEqual([...encoder.encode(String.fromCodePoint(cp))]);
    }
  });

  it('uses 1 to 4 bytes with the ranges of RFC 3629', () => {
    expect([0x7f, 0x80, 0x7ff, 0x800, 0xffff, 0x10000, 0x10ffff].map(byteCount)).toEqual([1, 2, 2, 3, 3, 4, 4]);
  });

  it('splits bits into prefix and payload that add up to eight', () => {
    for (const cp of [0x41, 0xe9, 0x20ac, 0x10348]) {
      for (const b of encodeCodePoint(cp).bits) expect(b.prefix.length + b.payload.length).toBe(8);
    }
    expect(encodeCodePoint(0x20ac).bits.map((b) => b.prefix)).toEqual(['1110', '10', '10']);
  });

  it('gives no bytes for a lone surrogate', () => {
    expect(encodeCodePoint(0xd800).bytes).toEqual([]);
    expect(encodeText('\ud800')[0].bytes).toEqual([]);
  });

  it('walks a text by code point, not by UTF-16 unit', () => {
    const encoded = encodeText('A\u{10348}');
    expect(encoded.map((e) => e.label)).toEqual(['U+0041', 'U+10348']);
  });
});
