import { describe, expect, it } from 'vitest';
import { BITS, MAX, PRESETS, SIGNED_WEIGHTS, WEIGHTS, binary, bitAt, hex, invert, negate, parseByte, plusOne, signed, toggle, unsigned } from './bits';

const all = Array.from({ length: MAX + 1 }, (_, i) => i);

describe('one byte', () => {
  it('has 8 bits, 256 patterns and the weights 128 down to 1', () => {
    expect(BITS).toBe(8);
    expect(MAX + 1).toBe(256);
    expect(WEIGHTS).toEqual([128, 64, 32, 16, 8, 4, 2, 1]);
    expect(SIGNED_WEIGHTS[0]).toBe(-128);
  });

  it('is the sum of the weights of its set bits, unsigned and signed', () => {
    for (const b of all) {
      const bits: number[] = WEIGHTS.map((_, i) => bitAt(b, i));
      expect(bits.reduce((s, v, i) => s + v * WEIGHTS[i], 0)).toBe(unsigned(b));
      expect(bits.reduce((s, v, i) => s + v * SIGNED_WEIGHTS[i], 0)).toBe(signed(b));
    }
  });

  it('reads the same pattern as 255 or -1, 128 or -128, and 127 either way', () => {
    expect([unsigned(255), signed(255)]).toEqual([255, -1]);
    expect([unsigned(128), signed(128)]).toEqual([128, -128]);
    expect([unsigned(127), signed(127)]).toEqual([127, 127]);
  });

  it('covers -128 to 127 when signed, each value once', () => {
    const values = all.map(signed);
    expect(Math.min(...values)).toBe(-128);
    expect(Math.max(...values)).toBe(127);
    expect(new Set(values).size).toBe(256);
  });

  it('writes two hex digits and eight bits, one hex digit per four bits', () => {
    expect(hex(0)).toBe('0x00');
    expect(hex(255)).toBe('0xff');
    expect(binary(0x41)).toBe('0100 0001');
    for (const b of all) {
      const [hi, lo] = binary(b).split(' ');
      expect(hex(b)).toBe('0x' + parseInt(hi, 2).toString(16) + parseInt(lo, 2).toString(16));
    }
  });

  it('toggles exactly one bit, and toggling twice gives the byte back', () => {
    for (const b of [0, 1, 0x5a, 255]) {
      for (let i = 0; i < BITS; i++) {
        const t = toggle(b, i);
        expect(bitAt(t, i)).not.toBe(bitAt(b, i));
        expect(toggle(t, i)).toBe(b);
        for (let j = 0; j < BITS; j++) if (j !== i) expect(bitAt(t, j)).toBe(bitAt(b, j));
      }
    }
  });

  it('wraps from 255 to 0 when adding one, and only there', () => {
    expect(plusOne(255)).toEqual({ result: 0, wrapped: true });
    expect(plusOne(127)).toEqual({ result: 128, wrapped: false });
    for (const b of all.slice(0, 255)) expect(plusOne(b).wrapped).toBe(false);
  });

  it('negates as invert plus one, except -128, which has no positive partner', () => {
    for (const b of all) {
      expect(invert(invert(b))).toBe(b);
      if (signed(b) === -128) expect(signed(negate(b))).toBe(-128);
      else expect(signed(negate(b))).toBe(0 - signed(b) || 0);
    }
  });

  it('reads decimal, hex and binary input, and rejects what does not fit', () => {
    expect(parseByte('65')).toBe(65);
    expect(parseByte('-1')).toBe(255);
    expect(parseByte('-128')).toBe(128);
    expect(parseByte('0x41')).toBe(65);
    expect(parseByte('0b0100_0001')).toBe(65);
    expect(parseByte(' 0B1111 1111 ')).toBe(255);
    for (const bad of ['256', '-129', '0x100', '0b111111111', 'abc', '', '1.5']) expect(parseByte(bad), bad).toBeUndefined();
  });

  it('labels its presets with the values they show', () => {
    for (const p of PRESETS) expect(p.label.startsWith(String(p.byte)) || p.label.startsWith(hex(p.byte))).toBe(true);
    expect(() => unsigned(256)).toThrow(RangeError);
  });
});
