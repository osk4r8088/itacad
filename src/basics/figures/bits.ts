/**
 * One byte, read in the ways the topic on number systems describes: as an unsigned number,
 * as a signed number in two's complement, in hexadecimal and in binary.
 * A byte is kept as a number from 0 to 255; bit 7 is the most significant.
 */

export const BITS = 8;
export const MAX = 2 ** BITS - 1;

/** The value of each position, from bit 7 down to bit 0, for unsigned and for signed reading. */
export const WEIGHTS = Array.from({ length: BITS }, (_, i) => 2 ** (BITS - 1 - i));
export const SIGNED_WEIGHTS = WEIGHTS.map((w, i) => (i === 0 ? -w : w));

const check = (byte: number) => {
  if (!Number.isInteger(byte) || byte < 0 || byte > MAX) throw new RangeError(`not a byte: ${byte}`);
  return byte;
};

/** Bit i of the byte, counted from the most significant (i = 0) to the least (i = 7). */
export const bitAt = (byte: number, i: number): 0 | 1 => ((check(byte) >> (BITS - 1 - i)) & 1) as 0 | 1;

export const toggle = (byte: number, i: number): number => check(byte) ^ (1 << (BITS - 1 - i));

export const unsigned = (byte: number): number => check(byte);

/** Two's complement: the highest bit counts -128 instead of +128. */
export const signed = (byte: number): number => (check(byte) >= 2 ** (BITS - 1) ? byte - 2 ** BITS : byte);

export const hex = (byte: number): string => '0x' + check(byte).toString(16).padStart(2, '0');

export const binary = (byte: number): string => {
  const b = check(byte).toString(2).padStart(BITS, '0');
  return `${b.slice(0, 4)} ${b.slice(4)}`;
};

/** Adding one wraps from 255 to 0, like an odometer. */
export const plusOne = (byte: number): { result: number; wrapped: boolean } => {
  const r = check(byte) + 1;
  return { result: r & MAX, wrapped: r > MAX };
};

/** Every bit flipped. */
export const invert = (byte: number): number => ~check(byte) & MAX;

/** The signed value negated, computed as invert and add one; -128 has no positive partner and stays -128. */
export const negate = (byte: number): number => (invert(byte) + 1) & MAX;

/** Reads a byte from user input: decimal from -128 to 255, 0x followed by hex digits, or 0b followed by bits. */
export function parseByte(text: string): number | undefined {
  const s = text.trim().toLowerCase().replace(/[\s_]/g, '');
  let n: number;
  if (/^0x[0-9a-f]{1,2}$/.test(s)) n = parseInt(s.slice(2), 16);
  else if (/^0b[01]{1,8}$/.test(s)) n = parseInt(s.slice(2), 2);
  else if (/^-?\d{1,3}$/.test(s)) n = parseInt(s, 10);
  else return undefined;
  if (n < -(2 ** (BITS - 1)) || n > MAX) return undefined;
  return n < 0 ? n + 2 ** BITS : n;
}

export const PRESETS: { label: string; byte: number }[] = [
  { label: '0', byte: 0 },
  { label: '1', byte: 1 },
  { label: '127, the largest signed', byte: 127 },
  { label: '128 or -128', byte: 128 },
  { label: '255 or -1', byte: 255 },
  { label: '0x41, the letter A', byte: 0x41 },
];
