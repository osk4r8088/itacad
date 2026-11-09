import { useEffect, useMemo, useRef, useState } from 'react';
import { navGroups } from '../exchanges';

/** Protocol name in the top bar; opens a menu of all protocols grouped by layer. Shortcut: "/". */
export function ProtocolSwitcher({ currentId, currentTitle }: { currentId: string; currentTitle: string }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return navGroups()
      .map((g) => ({
        ...g,
        entries: g.entries.filter((e) => !q || e.title.toLowerCase().includes(q) || g.group.toLowerCase().includes(q) || e.summary?.toLowerCase().includes(q)),
      }))
      .filter((g) => g.entries.length > 0);
  }, [filter]);

  const close = (focusButton: boolean) => {
    setOpen(false);
    setFilter('');
    if (focusButton) button.current?.focus();
  };

  // "/" opens the menu from anywhere except text fields.
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

  // Focus the filter on open; close on outside click.
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const links = [...(root.current?.querySelectorAll<HTMLAnchorElement>('.switcher-menu a') ?? [])];
    if (links.length === 0) return;
    const at = links.indexOf(document.activeElement as HTMLAnchorElement);
    const next = e.key === 'ArrowDown' ? (at + 1) % links.length : at <= 0 ? links.length - 1 : at - 1;
    links[next].focus();
  };

  return (
    <div className="switcher" ref={root}>
      <button
        ref={button}
        type="button"
        className="switcher-button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => (open ? close(false) : setOpen(true))}
        title="Choose a protocol (shortcut: /)"
      >
        <h1>{currentTitle}</h1>
        <span className="caret" aria-hidden="true">
          &#9662;
        </span>
      </button>
      {open && (
        <div className="switcher-menu" role="dialog" aria-label="Protocols" onKeyDown={onMenuKey}>
          <input
            ref={input}
            type="search"
            placeholder="Filter protocols"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const first = root.current?.querySelector<HTMLAnchorElement>('.switcher-menu a');
                if (first) {
                  window.location.hash = first.getAttribute('href')!;
                  close(false);
                }
              }
            }}
            aria-label="Filter protocols"
          />
          <div className="switcher-groups">
            {groups.map((g) => (
              <section key={g.group}>
                <h2>{g.group}</h2>
                <ul>
                  {g.entries.map((e) => (
                    <li key={e.title}>
                      {e.id ? (
                        <a href={`#/${e.id}/1`} aria-current={e.id === currentId ? 'page' : undefined} onClick={() => close(false)} title={e.summary}>
                          {e.title}
                        </a>
                      ) : (
                        <span className="planned" title="Planned, not built yet">
                          {e.title}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {groups.length === 0 && <p className="muted small">No protocol matches.</p>}
          </div>
          <p className="switcher-foot muted">
            <a href="#/">Overview</a>
          </p>
        </div>
      )}
    </div>
  );
}
