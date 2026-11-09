import { ISSUES_URL, type HubEntry } from '../shared/hub';

/** Cards for tools or learning content. Planned entries link to their GitHub issue. */
export function HubCards({ entries, link }: { entries: HubEntry[]; link: (id: string) => string }) {
  return (
    <ul className="cards">
      {entries.map((e) => (
        <li key={e.id}>
          {e.status === 'ready' ? (
            <a className="card" href={link(e.id)}>
              <strong>{e.title}</strong>
              <span>{e.summary}</span>
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
  );
}
