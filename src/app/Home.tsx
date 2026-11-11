import { SECTIONS, START_HERE } from './sections';

/** Start page: a few first steps, then one tile per section. Everything comes from the section registry. */
export function Home() {
  return (
    <div className="index home">
      <p className="lead">
        Learn how IT really works, at your own depth: step through real protocol exchanges down to every header field, use tools for everyday tasks, and explore models that show how things work inside.
      </p>

      <section className="start-here" aria-labelledby="h-start">
        <h2 id="h-start">Start here</h2>
        <ul>
          {START_HERE.map((s) => (
            <li key={s.href}>
              <a href={s.href}>{s.title}</a>
              <span className="muted"> {s.why}</span>
            </li>
          ))}
        </ul>
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
