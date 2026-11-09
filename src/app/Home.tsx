import { CATALOG } from '../protocols/catalog';
import { LESSONS } from '../learn/registry';
import { HubCards } from './HubCards';
import { ToolGroups } from './ToolGroups';
import { href } from './router';

/** Start page: one block per section, rendered from the catalog and the registries. */
export function Home() {
  const featured = CATALOG.filter((e) => e.featured);
  return (
    <div className="index home">
      <p className="lead">
        Learn how networks really work: step through real protocol exchanges down to every header field, and use tools that show the bits behind addresses and packets.
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
          <h2 id="h-tools">Tools</h2>
          <a href={href.tools}>All tools</a>
        </div>
        <ToolGroups headingLevel="h3" />
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
