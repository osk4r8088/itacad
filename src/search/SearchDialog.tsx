import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { SearchDoc } from './schema';
import { marks, prepare, search, snippet, type SearchIndex } from './search';

let cached: SearchIndex | undefined;

const EXAMPLES = ['MSS', 'port 443', 'handshake', 'cache', 'TTL'];

function Marked({ text, query }: { text: string; query: string }) {
  return (
    <>
      {marks(text, query).map((m, i) => (m.hit ? <mark key={i}>{m.text}</mark> : m.text))}
    </>
  );
}

/**
 * The search dialog: a text field that controls a list of results (the combobox pattern of WAI-ARIA).
 * Focus stays in the field; arrow keys move the active result, Enter opens it, Escape closes.
 */
export default function SearchDialog({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState<SearchIndex | 'failed' | undefined>(cached);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  const optionId = (i: number) => `${listId}-o${i}`;

  useEffect(() => {
    const d = dialog.current!;
    if (!d.open) d.showModal();
  }, []);

  useEffect(() => {
    if (cached) return;
    let alive = true;
    import('virtual:search-index').then(
      (m) => {
        cached = prepare(m.default as SearchDoc[]);
        if (alive) setIndex(cached);
      },
      () => alive && setIndex('failed'),
    );
    return () => {
      alive = false;
    };
  }, []);

  const groups = useMemo(() => (index && index !== 'failed' ? search(index, query) : []), [index, query]);
  const flat = useMemo(() => groups.flatMap((g) => g.hits), [groups]);
  const total = groups.reduce((n, g) => n + g.total, 0);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, flat]);

  const open = (href: string) => {
    onClose();
    window.location.hash = href;
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length) setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : flat.length - 1)) % flat.length);
    } else if (e.key === 'Home' && flat.length && e.ctrlKey) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'Escape') {
      // Without this, the first Escape only clears a search field that has text.
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter' && flat[active]) {
      e.preventDefault();
      open(flat[active].doc.href);
    }
  };

  const typed = query.trim().length > 0;
  const status = !typed ? '' : index === undefined ? 'Loading the index' : index === 'failed' ? 'The search index could not be loaded' : total === 0 ? 'No results' : `${total} ${total === 1 ? 'result' : 'results'}${total > flat.length ? `, the best ${flat.length} shown` : ''}`;

  let n = -1;
  return (
    <dialog
      ref={dialog}
      className="search-dialog"
      aria-label="Search the site"
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself.
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="search-box">
        <input
          type="search"
          role="combobox"
          aria-label="Search"
          aria-expanded={flat.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={flat[active] ? optionId(active) : undefined}
          placeholder="Protocols, fields, tools, terms"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          autoComplete="off"
          spellCheck={false}
          autoFocus
        />
        <button type="button" className="search-close" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="search-status muted small" role="status">
        {status}
      </p>
      <div className="search-results" id={listId} role="listbox" aria-label="Results" ref={list}>
        {groups.map((g) => (
          <div key={g.kind} role="group" aria-labelledby={`${listId}-${g.kind}`} className="search-group">
            <h2 id={`${listId}-${g.kind}`}>
              {g.label}
              {g.total > g.hits.length && <span className="muted"> {g.hits.length} of {g.total}</span>}
            </h2>
            {g.hits.map((h) => {
              n += 1;
              const i = n;
              return (
                <a key={i} id={optionId(i)} role="option" aria-selected={i === active} href={h.doc.href} tabIndex={-1} onClick={() => onClose()} onMouseMove={() => setActive(i)}>
                  <span className="search-title">
                    <Marked text={h.doc.title} query={query} />
                  </span>
                  {h.doc.context && <span className="search-context muted">{h.doc.context}</span>}
                  {h.doc.text && (
                    <span className="search-text muted">
                      <Marked text={snippet(h.doc.text, query)} query={query} />
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        ))}
      </div>
      {!typed && (
        <p className="search-hint muted small">
          Try{' '}
          {EXAMPLES.map((ex, i) => (
            <span key={ex}>
              {i > 0 && ', '}
              <button type="button" className="link-button" onClick={() => setQuery(ex)}>
                {ex}
              </button>
            </span>
          ))}
          . Arrow keys choose a result, Enter opens it, Escape closes.
        </p>
      )}
    </dialog>
  );
}
