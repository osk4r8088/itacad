import { KIND_LABELS, type DocKind, type SearchDoc } from './schema';

/** Lower case without accents, so "Übertragung" and "ubertragung" meet. */
export const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Prepared {
  doc: SearchDoc;
  title: string;
  titleWords: string[];
  context: string;
  keywords: string;
  text: string;
}

export interface SearchIndex {
  docs: Prepared[];
}

const words = (text: string) => text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

export function prepare(docs: SearchDoc[]): SearchIndex {
  return {
    docs: docs.map((doc) => {
      const title = fold(doc.title);
      return { doc, title, titleWords: words(title), context: fold(doc.context ?? ''), keywords: fold(doc.keywords ?? ''), text: fold(doc.text ?? '') };
    }),
  };
}

export interface Hit {
  doc: SearchDoc;
  score: number;
}

export interface HitGroup {
  kind: DocKind;
  label: string;
  hits: Hit[];
  /** How many matched in this group, including those not shown. */
  total: number;
}

/** Pages rank before their parts when both match equally. */
const KIND_BONUS: Record<DocKind, number> = { protocol: 6, basics: 5, tool: 6, explore: 6, lesson: 5, field: 3, term: 4, port: 3, step: 1, question: 0 };

/** True if `token` starts a word of `text`. */
const startsWord = (text: string, token: string) => {
  for (let at = text.indexOf(token); at >= 0; at = text.indexOf(token, at + 1)) if (at === 0 || !/[\p{L}\p{N}]/u.test(text[at - 1])) return true;
  return false;
};

/**
 * Scores one entry, or returns 0 when a word of the query is missing from it.
 * Titles count most: the whole query as the title, then as its start, then word by word.
 * Context and keywords count less, and the long text least.
 */
function score(p: Prepared, query: string, tokens: string[]): number {
  let total = 0;
  for (const t of tokens) {
    let best = 0;
    if (p.titleWords.includes(t)) best = 12;
    else if (p.titleWords.some((w) => w.startsWith(t))) best = 8;
    else if (p.title.includes(t)) best = 5;
    else if (startsWord(p.keywords, t)) best = 4;
    else if (startsWord(p.context, t)) best = 3;
    else if (startsWord(p.text, t)) best = 1.5;
    else if (p.keywords.includes(t) || p.context.includes(t) || p.text.includes(t)) best = 1;
    if (best === 0) return 0;
    total += best;
  }
  total /= tokens.length;
  // In a long title, such as a quiz question, the query is one word among many and says less.
  const weight = Math.min(1, 24 / p.title.length);
  if (p.title === query) total += 100;
  else if (p.title.startsWith(query)) total += 40 * weight;
  else if (startsWord(p.title, query)) total += 25 * weight;
  else if (tokens.length > 1 && (p.text.includes(query) || p.keywords.includes(query))) total += 4;
  // A short title that matches is more likely what was meant than a long sentence that contains the word.
  total += Math.max(0, 3 - p.title.length / 20);
  return total + KIND_BONUS[p.doc.kind];
}

/** Splits a query into the words that all have to match. Dots, dashes and slashes stay inside a word ("802.1q", "solicited-node"). */
export const tokensOf = (query: string) => fold(query).split(/\s+/).filter(Boolean);

export function search(index: SearchIndex, query: string, perGroup = 6): HitGroup[] {
  const tokens = tokensOf(query);
  if (tokens.length === 0) return [];
  const q = tokens.join(' ');
  const byKind = new Map<DocKind, Hit[]>();
  for (const p of index.docs) {
    const s = score(p, q, tokens);
    if (s <= 0) continue;
    const list = byKind.get(p.doc.kind) ?? [];
    list.push({ doc: p.doc, score: s });
    byKind.set(p.doc.kind, list);
  }
  const order = Object.keys(KIND_LABELS) as DocKind[];
  return [...byKind.entries()]
    .map(([kind, hits]) => {
      hits.sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title));
      return { kind, label: KIND_LABELS[kind], hits: hits.slice(0, perGroup), total: hits.length };
    })
    .sort((a, b) => b.hits[0].score - a.hits[0].score || order.indexOf(a.kind) - order.indexOf(b.kind));
}

/** A piece of `text` around the first word of the query found in it, cut at word boundaries. */
export function snippet(text: string, query: string, length = 140): string {
  if (text.length <= length) return text;
  const folded = fold(text);
  // Folding keeps the length for the texts of this site (no characters that fold to several).
  const at = folded.length === text.length ? Math.min(...tokensOf(query).map((t) => folded.indexOf(t)).filter((i) => i >= 0), Infinity) : Infinity;
  let start = at === Infinity ? 0 : Math.max(0, at - 40);
  if (start > 0) start = text.indexOf(' ', start) + 1 || start;
  let end = Math.min(text.length, start + length);
  if (end < text.length) end = text.lastIndexOf(' ', end) > start ? text.lastIndexOf(' ', end) : end;
  return `${start > 0 ? '... ' : ''}${text.slice(start, end)}${end < text.length ? ' ...' : ''}`;
}

/** Cuts `text` into pieces, marking those that match a word of the query, for highlighting. */
export function marks(text: string, query: string): { text: string; hit: boolean }[] {
  const folded = fold(text);
  const tokens = tokensOf(query);
  if (folded.length !== text.length || tokens.length === 0) return [{ text, hit: false }];
  const ranges: [number, number][] = [];
  for (const t of tokens) for (let at = folded.indexOf(t); at >= 0; at = folded.indexOf(t, at + t.length)) ranges.push([at, at + t.length]);
  ranges.sort((a, b) => a[0] - b[0]);
  const out: { text: string; hit: boolean }[] = [];
  let pos = 0;
  for (const [from, to] of ranges) {
    if (from < pos) continue;
    if (from > pos) out.push({ text: text.slice(pos, from), hit: false });
    out.push({ text: text.slice(from, to), hit: true });
    pos = to;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), hit: false });
  return out;
}
