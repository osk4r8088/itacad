import { useState } from 'react';
import { SECTIONS } from './sections';
import { PATHS, resolveRef } from './entries';
import { LEVELS, type Level } from '../shared/levels';

/** Start page: a suggested path for the reader's level, then one tile per section. Everything comes from the registries. */
export function Home() {
  const [level, setLevel] = useState<Level>(1);
  const path = PATHS[level];
  return (
    <div className="index home">
      <p className="lead">
        Learn how IT really works, at your own depth: from what is inside a computer, through the protocols every network runs on, down to every header field.
      </p>

      <section className="start-here" aria-labelledby="h-start">
        <h2 id="h-start">Start here: pick your level</h2>
        <div className="level-filter" role="group" aria-label="Your level">
          {([1, 2, 3] as Level[]).map((l) => (
            <button key={l} type="button" className="chip" aria-pressed={level === l} onClick={() => setLevel(l)}>
              {l} {LEVELS[l].name}
            </button>
          ))}
        </div>
        <p className="muted">{path.about}</p>
        <ol>
          {path.steps.map((step) => {
            const info = resolveRef(step.ref)!;
            return (
              <li key={info.href}>
                <a href={info.href}>{info.title}</a>
                <span className="muted"> {step.why}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <ul className="section-tiles" aria-label="Sections">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <section className="section-tile" aria-labelledby={`tile-${s.id}`}>
              <h2 id={`tile-${s.id}`}>
                <a href={s.href}>{s.title}</a>
              </h2>
              <p>{s.about}</p>
              <ul className="tile-highlights" aria-label={`Highlights in ${s.title}`}>
                {s.highlights().map((h) => (
                  <li key={h.href}>
                    <a href={h.href}>{h.title}</a>
                  </li>
                ))}
              </ul>
              <a className="tile-all" href={s.href}>
                All {s.count()} {s.unit}
              </a>
            </section>
          </li>
        ))}
      </ul>
    </div>
  );
}
