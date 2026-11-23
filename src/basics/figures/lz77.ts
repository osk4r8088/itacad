/**
 * The LZ77 idea for the figure on compression: replace a string that appeared shortly before with a
 * reference "copy `length` characters from `distance` back". DEFLATE (RFC 1951) uses references of
 * 3 to 258 bytes into a window of the previous 32 KiB; the figure uses the same minimum and maximum
 * length and a window that can be made small to show what it limits.
 *
 * The search is greedy: at each position it takes the longest match in the window, and of equally
 * long ones the nearest. Real compressors search more cleverly, and then code the result with Huffman codes.
 */

export const MIN_MATCH = 3;
export const MAX_MATCH = 258;

export type Token = { kind: 'literal'; char: string; at: number } | { kind: 'ref'; distance: number; length: number; at: number };

export function encode(text: string, window: number): Token[] {
  if (window < 1) throw new RangeError('window must be at least 1');
  const chars = [...text];
  const tokens: Token[] = [];
  let i = 0;
  while (i < chars.length) {
    let best = 0;
    let bestDistance = 0;
    for (let d = 1; d <= Math.min(window, i); d++) {
      let n = 0;
      // A match may run into the part it is copying, as in "aaaaaa": the copy reads what it has just written.
      while (n < MAX_MATCH && i + n < chars.length && chars[i + n - d] === chars[i + n]) n++;
      if (n > best) {
        best = n;
        bestDistance = d;
      }
    }
    if (best >= MIN_MATCH) {
      tokens.push({ kind: 'ref', distance: bestDistance, length: best, at: i });
      i += best;
    } else {
      tokens.push({ kind: 'literal', char: chars[i], at: i });
      i += 1;
    }
  }
  return tokens;
}

export function decode(tokens: Token[]): string {
  const out: string[] = [];
  for (const t of tokens) {
    if (t.kind === 'literal') out.push(t.char);
    else {
      if (t.distance < 1 || t.distance > out.length) throw new RangeError(`reference before the start: ${t.distance}`);
      for (let k = 0; k < t.length; k++) out.push(out[out.length - t.distance]);
    }
  }
  return out.join('');
}

export interface Summary {
  characters: number;
  literals: number;
  refs: number;
  /** Characters that were written as part of a reference. */
  covered: number;
}

export function summarize(text: string, tokens: Token[]): Summary {
  const refs = tokens.filter((t) => t.kind === 'ref');
  return {
    characters: [...text].length,
    literals: tokens.length - refs.length,
    refs: refs.length,
    covered: refs.reduce((s, t) => s + (t.kind === 'ref' ? t.length : 0), 0),
  };
}

export const WINDOWS = [8, 32, 4096];

export const EXAMPLES: { label: string; text: string }[] = [
  { label: 'A log', text: 'GET /index.html 200\nGET /style.css 200\nGET /index.html 304\nGET /logo.png 404' },
  { label: 'Repeated words', text: 'to be or not to be, that is the question' },
  { label: 'One letter', text: 'aaaaaaaaaaaaaaaaaaaa' },
  { label: 'No repetition', text: 'q7Xz!pL2@wR9#mK4' },
];
