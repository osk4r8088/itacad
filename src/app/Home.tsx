import { CATALOG } from '../protocols/catalog';
import { LESSONS } from '../learn/registry';
import { HubCards } from './HubCards';
import { SECTION_INFO, toolsFor } from '../tools/registry';
import { href } from './router';

/** Start page: one block per section, rendered from the catalog and the registries. */
export function Home() {
  const featured = CATALOG.filter((e) => e.featured);
  return (
    <div className="index home">
      <p className="lead">
        Learn how IT really works, at your own depth: step through real protocol exchanges down to every header field, use tools for everyday tasks, and explore models that show how things work inside.
      </p>

      <section className="hub-section" aria-labelledby="h-protocols">
        <div className="hub-head">
          <h2 id="h-protocols">Protocols</h2>
          <a href={href.protocols}>All {CATALOG.length} protocols</a>
        </div>
        <ul className="cards">
          {featured.map((e) => (
            <li key={e.id}>
              <a className="card" href={href.exchange(e.id)}>
                <strong>{e.title}</strong>
                <span>{e.summary}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="hub-section" aria-labelledby="h-tools">
        <div className="hub-head">
          <h2 id="h-tools">{SECTION_INFO.use.title}</h2>
          <a href={href.tools}>All tools</a>
        </div>
        <p className="small muted">{SECTION_INFO.use.about}</p>
        <HubCards entries={toolsFor('use')} link={href.tool} />
      </section>

      <section className="hub-section" aria-labelledby="h-explore">
        <div className="hub-head">
          <h2 id="h-explore">{SECTION_INFO.understand.title}</h2>
          <a href={href.explore}>All entries</a>
        </div>
        <p className="small muted">{SECTION_INFO.understand.about}</p>
        <HubCards entries={toolsFor('understand')} link={href.explorer} />
      </section>

      <section className="hub-section" aria-labelledby="h-learn">
        <div className="hub-head">
          <h2 id="h-learn">Learn</h2>
          <a href={href.learn}>All lessons</a>
        </div>
        <HubCards entries={LESSONS} link={href.lesson} />
      </section>
    </div>
  );
}
