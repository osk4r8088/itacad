import type { Source } from '../../shared/schema';

// Numbers are stored as the raw bit pattern of a fixed width (unsigned BigInt 0 .. 2^width - 1).
// "Signed" only changes how the pattern is read as a decimal number: two's complement.

export const WIDTHS = [8, 16, 32, 64] as const;
export type Width = (typeof WIDTHS)[number];

export type Base = 2 | 8 | 10 | 16;

export const BASES: { base: Base; name: string; prefix: string }[] = [
  { base: 10, name: 'Decimal', prefix: '' },
  { base: 16, name: 'Hexadecimal', prefix: '0x' },
  { base: 2, name: 'Binary', prefix: '0b' },
  { base: 8, name: 'Octal', prefix: '0o' },
];

const DIGITS: Record<Base, RegExp> = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^\d+$/, 16: /^[0-9a-f]+$/i };
const PREFIX: Record<Base, RegExp> = { 2: /^0b/i, 8: /^0o/i, 10: /^$/, 16: /^0x/i };

export const maxUnsigned = (w: Width) => (1n << BigInt(w)) - 1n;
export const minSigned = (w: Width) => -(1n << BigInt(w - 1));
export const maxSigned = (w: Width) => (1n << BigInt(w - 1)) - 1n;

/** The bit pattern of a value in two's complement with the given width (the low `width` bits). */
export function toPattern(value: bigint, w: Width): bigint {
  return BigInt.asUintN(w, value);
}

/** The value of a bit pattern, read as unsigned or as two's complement. */
export function valueOf(pattern: bigint, w: Width, signed: boolean): bigint {
  return signed ? BigInt.asIntN(w, pattern) : pattern;
}

export function fits(value: bigint, w: Width, signed: boolean): boolean {
  return signed ? value >= minSigned(w) && value <= maxSigned(w) : value >= 0n && value <= maxUnsigned(w);
}

export type ParseResult = { ok: true; pattern: bigint } | { ok: false; error: string };

/**
 * Parses text in one base into a bit pattern.
 * Decimal input is a value (negative only when signed). Binary, octal and hex input is the bit pattern itself.
 * Spaces and underscores between digits are ignored; the base prefix (0x, 0b, 0o) is optional.
 */
export function parse(text: string, base: Base, w: Width, signed: boolean): ParseResult {
  let t = text.trim().replace(/[\s_]/g, '');
  const name = BASES.find((b) => b.base === base)!.name.toLowerCase();
  if (!t) return { ok: false, error: `Enter a ${name} number.` };
  let negative = false;
  if (base === 10 && t.startsWith('-')) {
    negative = true;
    t = t.slice(1);
  }
  t = t.replace(PREFIX[base], '');
  if (!DIGITS[base].test(t)) {
    const allowed = { 2: '0 and 1', 8: '0 to 7', 10: '0 to 9', 16: '0 to 9 and a to f' }[base];
    return { ok: false, error: `Not a ${name} number: use the digits ${allowed}.` };
  }
  const prefix = { 2: '0b', 8: '0o', 10: '', 16: '0x' }[base];
  const magnitude = BigInt(prefix + t);
  if (base === 10) {
    const value = negative ? -magnitude : magnitude;
    if (negative && !signed) return { ok: false, error: 'Negative numbers need a signed interpretation. Switch on "Signed (two\'s complement)".' };
    if (!fits(value, w, signed)) {
      const range = signed ? `${minSigned(w)} to ${maxSigned(w)}` : `0 to ${maxUnsigned(w)}`;
      return { ok: false, error: `${value} does not fit into ${w} bits ${signed ? 'signed' : 'unsigned'} (range ${range}).` };
    }
    return { ok: true, pattern: toPattern(value, w) };
  }
  if (magnitude > maxUnsigned(w)) return { ok: false, error: `This needs ${magnitude.toString(2).length} bits, more than ${w}. Choose a larger width.` };
  return { ok: true, pattern: magnitude };
}

/** The bit pattern written in a base: binary and hex with all digits of the width, grouped for reading. */
export function format(pattern: bigint, base: Base, w: Width, signed: boolean): string {
  if (base === 10) return valueOf(pattern, w, signed).toString();
  if (base === 2) return group(pattern.toString(2).padStart(w, '0'), 4);
  if (base === 16) return group(pattern.toString(16).padStart(w / 4, '0'), 2);
  return pattern.toString(8);
}

function group(digits: string, size: number): string {
  const out: string[] = [];
  for (let i = 0; i < digits.length; i += size) out.push(digits.slice(i, i + size));
  return out.join(' ');
}

/** Bits from most to least significant. */
export function bits(pattern: bigint, w: Width): number[] {
  return pattern
    .toString(2)
    .padStart(w, '0')
    .split('')
    .map(Number);
}

export function flipBit(pattern: bigint, bitIndex: number): bigint {
  return pattern ^ (1n << BigInt(bitIndex));
}

/** Octets in network byte order (most significant first, big endian). */
export function bytesBigEndian(pattern: bigint, w: Width): number[] {
  const out: number[] = [];
  for (let i = w / 8 - 1; i >= 0; i--) out.push(Number((pattern >> BigInt(i * 8)) & 0xffn));
  return out;
}

/**
 * Converts a value to another width. If the value fits, it is kept (negative values are
 * sign-extended); otherwise the low bits are kept, as a CPU does when it truncates.
 */
export function changeWidth(pattern: bigint, from: Width, to: Width, signed: boolean): { pattern: bigint; truncated: boolean } {
  const value = valueOf(pattern, from, signed);
  if (fits(value, to, signed)) return { pattern: toPattern(value, to), truncated: false };
  return { pattern: BigInt.asUintN(to, pattern), truncated: true };
}

/** Changing the interpretation keeps the bits; the decimal value may change. */
export function weight(bitIndex: number, w: Width, signed: boolean): bigint {
  const v = 1n << BigInt(bitIndex);
  return signed && bitIndex === w - 1 ? -v : v;
}

export const SOURCES: Source[] = [{ rfc: 791, section: 'Appendix B', note: 'data transmission order: network byte order is big endian' }];
