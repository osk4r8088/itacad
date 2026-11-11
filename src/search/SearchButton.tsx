import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';

// The dialog, the ranking and the index load when the search is opened for the first time.
const SearchDialog = lazy(() => import('./SearchDialog'));

/** Opens the site search. Shortcut: "/", from anywhere except text fields. */
export function SearchButton() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  // After closing, the focus goes back to where the search was opened. This waits for the dialog to be gone:
  // while a modal dialog is open, nothing outside it can take the focus.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) button.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button ref={button} type="button" className="search-button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-keyshortcuts="/" title="Search the site (shortcut: /)">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M10 10l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span className="search-button-label">Search</span>
        <kbd aria-hidden="true">/</kbd>
      </button>
      {open && (
        <Suspense fallback={null}>
          <SearchDialog onClose={close} />
        </Suspense>
      )}
    </>
  );
}
