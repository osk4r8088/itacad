import { useState } from 'react';
import { KEYS_PER_PAGE, ROWS_PER_PAGE, SIZES, formatCount, lookupPages, scanPages, treeLevels } from './index-math';

/** A full table scan against an index lookup, counted in pages read, for a chosen table size. */
export default function IndexLookup() {
  const [at, setAt] = useState(4);
  const rows = SIZES[at];
  const scan = scanPages(rows);
  const lookup = lookupPages(rows);
  const levels = treeLevels(rows);
  // Bars on a logarithmic scale; otherwise the lookup would be invisible.
  const scale = (pages: number) => `${Math.max(2, (Math.log10(pages + 1) / Math.log10(scanPages(SIZES[SIZES.length - 1]) + 1)) * 100)}%`;

  return (
    <div className="idx-figure">
      <label className="idx-input">
        <span>Rows in the table: {formatCount(rows)}</span>
        <input type="range" min={0} max={SIZES.length - 1} value={at} onChange={(e) => setAt(Number(e.target.value))} />
      </label>
      <div className="idx-bars" aria-live="polite">
        <div className="idx-row">
          <span className="idx-name">Full table scan</span>
          <span className="idx-track">
            <span className="idx-bar kind-scan" style={{ width: scale(scan) }} />
          </span>
          <span className="idx-count">{formatCount(scan)} {scan === 1 ? 'page' : 'pages'}</span>
        </div>
        <div className="idx-row">
          <span className="idx-name">Index lookup</span>
          <span className="idx-track">
            <span className="idx-bar kind-index" style={{ width: scale(lookup) }} />
          </span>
          <span className="idx-count">{lookup} pages</span>
        </div>
      </div>
      <p className="idx-about">
        {scan <= lookup ? (
          <>
            The whole table fits into {formatCount(scan)} {scan === 1 ? 'page' : 'pages'}, so reading it directly is as cheap as going through the index ({lookup} pages), or cheaper. For small tables a database ignores its indexes for exactly this reason.
          </>
        ) : (
          <>
            The scan reads all {formatCount(scan)} pages of the table. The lookup walks {levels} {levels === 1 ? 'level' : 'levels'} of the B-tree and then reads the one table page with the row: {lookup} pages, about{' '}
            <strong>{formatCount(Math.round(scan / lookup))} times</strong> fewer. Ten times more rows mean ten times more work for the scan and at most one more level for the index.
          </>
        )}
      </p>
      <p className="idx-note">
        Assumed for this picture: {ROWS_PER_PAGE} rows per table page, {KEYS_PER_PAGE} keys per index page, one matching row. The bars use a logarithmic scale. Real numbers depend on the row size, the database and how much is already in memory.
      </p>
    </div>
  );
}
