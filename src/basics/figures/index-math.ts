/**
 * Page counts for the index figure. A database reads whole pages; the two sizes are
 * illustrative round numbers, not those of a particular product.
 */
export const ROWS_PER_PAGE = 100;
export const KEYS_PER_PAGE = 200;

/** Pages a full table scan reads: all of them. */
export const scanPages = (rows: number) => Math.max(1, Math.ceil(rows / ROWS_PER_PAGE));

/** Levels of a B-tree that holds the given number of keys, at least one. */
export function treeLevels(rows: number): number {
  let levels = 1;
  let capacity = KEYS_PER_PAGE;
  while (capacity < rows) {
    capacity *= KEYS_PER_PAGE;
    levels++;
  }
  return levels;
}

/** Pages a lookup of one row through the index reads: one per level, plus the table page of the row. */
export const lookupPages = (rows: number) => treeLevels(rows) + 1;

/** Table sizes offered by the slider: powers of ten from one hundred to ten billion. */
export const SIZES = [1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10];

export const formatCount = (n: number) => n.toLocaleString('en-US');
