import { useState } from 'react';
import { navGroups } from '../catalog';
import { href } from '../../app/router';
import type { Level } from '../../shared/levels';
import { LevelBadge } from '../../shared/components/LevelBadge';
import { LevelFilter } from '../../shared/components/LevelFilter';

/** Overview: all protocols, grouped by layer from top (application) to bottom (link), filterable by level. */
export function ProtocolIndex() {
  const [level, setLevel] = useState<Level | null>(null);
  const groups = navGroups()
    .map((g) => ({ ...g, entries: level === null ? g.entries : g.entries.filter((e) => e.level === level) }))
    .filter((g) => g.entries.length > 0);
  return (
    <div className="index">
      <p className="lead">
        Step through real protocol exchanges. Each step shows the message on the network, in a packet flow table and a sequence diagram, and as a packet with every header field, layer by layer.
      </p>
      <LevelFilter value={level} onChange={setLevel} />
      <div className="layer-map">
        {groups.map((g) => (
          <section key={g.group} className="layer-row">
            <h2>{g.group}</h2>
            <ul className="cards">
              {g.entries.map((e) => (
                <li key={e.title}>
                  {e.id ? (
                    <a className="card" href={href.exchange(e.id)}>
                      <strong>{e.title}</strong>
                      <span>{e.summary}</span>
                      {e.level && <LevelBadge level={e.level} />}
                    </a>
                  ) : (
                    <div className="card planned" aria-disabled="true">
                      <strong>{e.title}</strong>
                      <span>Planned</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="muted small">Shortcut on protocol pages: press / to switch protocol, arrow keys to step.</p>
    </div>
  );
}
