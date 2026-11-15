/** Helpers for the hash figure. The digest itself comes from the Web Crypto API of the browser. */

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const BITS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/** The number of bits in which two hexadecimal strings of equal length differ. */
export function differingBits(a: string, b: string): number {
  if (a.length !== b.length) throw new Error('hashes of different length');
  let count = 0;
  for (let i = 0; i < a.length; i++) count += BITS[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  return count;
}

/** Per hexadecimal digit: whether it differs between the two strings. */
export const differingDigits = (a: string, b: string) => Array.from(a, (ch, i) => ch !== b[i]);
