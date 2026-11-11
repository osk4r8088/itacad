import { useState } from 'react';
import { ISSUES_URL, type HubEntry } from '../shared/hub';
import type { Level } from '../shared/levels';
import { LevelBadge } from '../shared/components/LevelBadge';
import { LevelFilter } from '../shared/components/LevelFilter';

/** Cards for tools or learning content, with a level filter. Planned entries link to their GitHub issue. */
export function HubCards({ entries, link }: { entries: HubEntry[]; link: (id: string) => string }) {
  const [level, setLevel] = useState<Level | null>(null);
  const shown = level === null ? entries : entries.filter((e) => e.level === level);
  return (
    <>
      <LevelFilter value={level} onChange={setLevel} />
      <ul className="cards">
        {shown.map((e) => (
          <li key={e.id}>
            {e.status === 'ready' ? (
              <a className="card" href={link(e.id)}>
                <strong>{e.title}</strong>
                <span>{e.summary}</span>
                <LevelBadge level={e.level} />
              </a>
            ) : (
              <a className="card planned" href={e.issue ? `${ISSUES_URL}/${e.issue}` : ISSUES_URL} title="Planned, opens the issue on GitHub">
                <strong>{e.title}</strong>
                <span>{e.summary}</span>
                <span className="tag">Planned{e.issue ? `, issue #${e.issue}` : ''}</span>
              </a>
            )}
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className="muted">Nothing at this level here yet.</p>}
    </>
  );
}
