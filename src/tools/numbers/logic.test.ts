import { describe, expect, it } from 'vitest';
import { bits, bytesBigEndian, changeWidth, flipBit, format, parse, valueOf, weight, maxUnsigned, minSigned, maxSigned } from './logic';

const ok = (r: ReturnType<typeof parse>) => {
  if (!r.ok) throw new Error(r.error);
  return r.pattern;
};

describe('parse', () => {
  it('reads all bases with and without prefixes, spaces and underscores', () => {
    expect(ok(parse('200', 10, 8, false))).toBe(200n);
    expect(ok(parse('0xC8', 16, 8, false))).toBe(200n);
    expect(ok(parse('c8', 16, 8, false))).toBe(200n);
    expect(ok(parse('1100 1000', 2, 8, false))).toBe(200n);
    expect(ok(parse('0b1100_1000', 2, 8, false))).toBe(200n);
    expect(ok(parse('310', 8, 8, false))).toBe(200n);
    expect(ok(parse('0o310', 8, 8, false))).toBe(200n);
  });

  it('stores negative decimals as two\'s complement', () => {
    expect(ok(parse('-1', 10, 8, true))).toBe(0xffn);
    expect(ok(parse('-56', 10, 8, true))).toBe(200n);
    expect(ok(parse('-128', 10, 8, true))).toBe(0x80n);
    expect(ok(parse('-1', 10, 64, true))).toBe(0xffffffffffffffffn);
  });

  it('rejects values outside the range of the width', () => {
    expect(parse('256', 10, 8, false)).toMatchObject({ ok: false, error: expect.stringContaining('0 to 255') });
    expect(parse('128', 10, 8, true)).toMatchObject({ ok: false, error: expect.stringContaining('-128 to 127') });
    expect(parse('-129', 10, 8, true).ok).toBe(false);
    expect(parse('-1', 10, 8, false)).toMatchObject({ ok: false, error: expect.stringContaining('Signed') });
    expect(parse('1ff', 16, 8, false)).toMatchObject({ ok: false, error: expect.stringContaining('9 bits') });
  });

  it('rejects wrong digits', () => {
    expect(parse('102', 2, 8, false).ok).toBe(false);
    expect(parse('8', 8, 8, false).ok).toBe(false);
    expect(parse('fg', 16, 8, false).ok).toBe(false);
    expect(parse('', 10, 8, false).ok).toBe(false);
    expect(parse('-0x5', 16, 8, true).ok).toBe(false);
  });

  it('handles 64-bit values exactly', () => {
    expect(ok(parse('18446744073709551615', 10, 64, false))).toBe(maxUnsigned(64));
    expect(ok(parse('9223372036854775807', 10, 64, true))).toBe(maxSigned(64));
    expect(parse('18446744073709551616', 10, 64, false).ok).toBe(false);
  });
});

describe('format', () => {
  it('writes all bases, binary and hex with all digits of the width', () => {
    expect(format(200n, 10, 8, false)).toBe('200');
    expect(format(200n, 10, 8, true)).toBe('-56');
    expect(format(200n, 16, 8, false)).toBe('c8');
    expect(format(200n, 2, 8, false)).toBe('1100 1000');
    expect(format(200n, 8, 8, false)).toBe('310');
    expect(format(0x0800n, 16, 16, false)).toBe('08 00');
    expect(format(5n, 2, 16, false)).toBe('0000 0000 0000 0101');
  });
});

describe('two\'s complement', () => {
  it('has the classic ranges', () => {
    expect([minSigned(8), maxSigned(8), maxUnsigned(8)]).toEqual([-128n, 127n, 255n]);
    expect([minSigned(16), maxSigned(16)]).toEqual([-32768n, 32767n]);
    expect([minSigned(32), maxSigned(32), maxUnsigned(32)]).toEqual([-2147483648n, 2147483647n, 4294967295n]);
  });
  it('reads the same bits differently', () => {
    expect(valueOf(0xffn, 8, false)).toBe(255n);
    expect(valueOf(0xffn, 8, true)).toBe(-1n);
    expect(valueOf(0x7fn, 8, true)).toBe(127n);
  });
  it('gives the sign bit a negative weight', () => {
    expect(weight(7, 8, true)).toBe(-128n);
    expect(weight(7, 8, false)).toBe(128n);
    // -56 = -128 + 64 + 8
    expect(weight(7, 8, true) + weight(6, 8, true) + weight(3, 8, true)).toBe(-56n);
  });
});

describe('bits and bytes', () => {
  it('lists bits from most significant', () => {
    expect(bits(5n, 8)).toEqual([0, 0, 0, 0, 0, 1, 0, 1]);
    expect(flipBit(5n, 7)).toBe(133n);
    expect(flipBit(5n, 0)).toBe(4n);
  });
  it('splits into octets in network byte order', () => {
    expect(bytesBigEndian(0x12345678n, 32)).toEqual([0x12, 0x34, 0x56, 0x78]);
    expect(bytesBigEndian(0xc0000201n, 32)).toEqual([192, 0, 2, 1]);
  });
});

describe('changeWidth', () => {
  it('keeps values that fit, sign-extending negatives', () => {
    expect(changeWidth(0xffn, 8, 16, true)).toEqual({ pattern: 0xffffn, truncated: false });
    expect(changeWidth(0xffn, 8, 16, false)).toEqual({ pattern: 0xffn, truncated: false });
    expect(changeWidth(0xfffen, 16, 8, true)).toEqual({ pattern: 0xfen, truncated: false });
  });
  it('keeps the low bits when the value does not fit', () => {
    expect(changeWidth(0x1234n, 16, 8, false)).toEqual({ pattern: 0x34n, truncated: true });
  });
});
