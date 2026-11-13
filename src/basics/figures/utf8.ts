/** One code point of a text, encoded as UTF-8 (RFC 3629, section 3). */
export interface EncodedCodePoint {
  char: string;
  codePoint: number;
  /** U+ notation with at least four hexadecimal digits. */
  label: string;
  /** The encoded bytes; empty for a lone surrogate, which has no UTF-8 form. */
  bytes: number[];
  /** Per byte: the fixed prefix bits and the payload bits taken from the code point. */
  bits: { prefix: string; payload: string }[];
}

const PREFIXES: Record<number, string[]> = {
  1: ['0'],
  2: ['110', '10'],
  3: ['1110', '10', '10'],
  4: ['11110', '10', '10', '10'],
};

export function byteCount(codePoint: number): 1 | 2 | 3 | 4 {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

export const isSurrogate = (codePoint: number) => codePoint >= 0xd800 && codePoint <= 0xdfff;

export function encodeCodePoint(codePoint: number): EncodedCodePoint {
  const label = `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
  if (isSurrogate(codePoint)) return { char: '', codePoint, label, bytes: [], bits: [] };
  const n = byteCount(codePoint);
  const prefixes = PREFIXES[n];
  const payloadLength = prefixes.reduce((sum, p) => sum + 8 - p.length, 0);
  const payload = codePoint.toString(2).padStart(payloadLength, '0');
  let at = 0;
  const bits = prefixes.map((prefix) => {
    const part = payload.slice(at, at + 8 - prefix.length);
    at += part.length;
    return { prefix, payload: part };
  });
  return {
    char: String.fromCodePoint(codePoint),
    codePoint,
    label,
    bytes: bits.map((b) => parseInt(b.prefix + b.payload, 2)),
    bits,
  };
}

/** Splits a text into code points (not UTF-16 units) and encodes each one. */
export function encodeText(text: string): EncodedCodePoint[] {
  return Array.from(text, (ch) => encodeCodePoint(ch.codePointAt(0)!));
}

export const hex = (byte: number) => byte.toString(16).padStart(2, '0');
