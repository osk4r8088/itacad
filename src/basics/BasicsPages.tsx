import { Suspense, useEffect, useMemo, useState } from 'react';
import { href } from '../app/router';
import { ISSUES_URL, pageTitle } from '../shared/hub';
import { LEVELS, type Level } from '../shared/levels';
import { LevelBadge } from '../shared/components/LevelBadge';
import { LevelFilter } from '../shared/components/LevelFilter';
import { ReadFirst } from '../app/ReadFirst';
import { SourceList } from '../shared/components/SourceList';
import { CATEGORIES, categoryOf, findTopic, readyTopics, topicsOf, type TopicEntry } from './catalog';
import { FIGURES } from './figures';
import { resolveRef } from '../app/entries';
import type { Block, Command, Topic, TopicQuestion } from './schema';

export type BasicsRoute = { page: 'basics' } | { page: 'category'; id: string } | { page: 'topic'; category: string; id: string } | { page: 'glossary' };

/** All pages of Basics & Concepts, rendered from the catalog and the topic data. */
export default function BasicsPages({ route }: { route: BasicsRoute }) {
  switch (route.page) {
    case 'basics':
      return <BasicsHome />;
    case 'category':
      return <CategoryPage id={route.id} />;
    case 'topic':
      return <TopicPage id={route.id} />;
    case 'glossary':
      return <GlossaryPage />;
  }
}

function useTitle(title: string | undefined) {
  useEffect(() => {
    document.title = pageTitle(title);
  }, [title]);
}

function Figure({ id }: { id: string }) {
  const Component = FIGURES[id];
  if (!Component) return null;
  return (
    <Suspense fallback={<p className="muted">Loading...</p>}>
      <Component />
    </Suspense>
  );
}

// ---------- overview ----------

function BasicsHome() {
  useTitle('Basics & Concepts');
  return (
    <div className="index basics">
      <h1>Basics & Concepts</h1>
      <p className="lead">
        The building blocks of IT around the network: hardware, operating systems, virtualization, software, data, cloud, security and databases. Each topic starts with a one-sentence definition, explains the idea in short sections, and ends with commands to try, key terms, a quiz and its sources.
      </p>
      <p className="levels-legend">
        {([1, 2, 3] as Level[]).map((l) => (
          <span key={l}>
            <LevelBadge level={l} /> {LEVELS[l].about}
          </span>
        ))}
      </p>
      <ul className="section-tiles">
        {CATEGORIES.map((c) => {
          const topics = topicsOf(c.id);
          const ready = topics.filter((t) => t.status === 'ready');
          return (
            <li key={c.id}>
              <section className={`section-tile${ready.length ? '' : ' is-planned'}`} aria-labelledby={`cat-${c.id}`}>
                <h2 id={`cat-${c.id}`}>{ready.length ? <a href={href.category(c.id)}>{c.title}</a> : c.title}</h2>
                <p>{c.about}</p>
                {ready.length > 0 ? (
                  <>
                    <ul className="tile-highlights">
                      {ready.slice(0, 3).map((t) => (
                        <li key={t.id}>
                          <a href={href.topic(c.id, t.id)}>{t.title}</a>
                        </li>
                      ))}
                    </ul>
                    <p className="tile-all">
                      <a href={href.category(c.id)}>
                        All {ready.length} topics{ready.length < topics.length ? `, ${topics.length - ready.length} more planned` : ''}
                      </a>
                    </p>
                  </>
                ) : (
                  <p className="tile-all">
                    <a href={`${ISSUES_URL}/${c.issue}`} title="Opens the issue on GitHub">
                      Planned, issue #{c.issue}
                    </a>
                  </p>
                )}
              </section>
            </li>
          );
        })}
      </ul>
      <p>
        <a href={href.glossary}>Glossary: all key terms</a>
      </p>
    </div>
  );
}

// ---------- category ----------

function CategoryPage({ id }: { id: string }) {
  const category = categoryOf(id);
  const [level, setLevel] = useState<Level | null>(null);
  useTitle(category?.title ?? 'Basics & Concepts');
  if (!category)
    return (
      <p className="notice">
        There is no category "{id}". <a href={href.basics}>All categories</a>.
      </p>
    );
  const topics = topicsOf(id).filter((t) => level === null || t.level === level);
  return (
    <div className="index basics">
      <p className="back">
        <a href={href.basics}>Basics & Concepts</a>
      </p>
      <h1>{category.title}</h1>
      <p className="lead">{category.about}</p>
      {category.figure && (
        <figure className="basics-figure">
          <Figure id={category.figure.id} />
          <figcaption>{category.figure.caption}</figcaption>
        </figure>
      )}
      <LevelFilter value={level} onChange={setLevel} />
      <ul className="cards">
        {topics.map((t) => (
          <li key={t.id}>
            <TopicCard topic={t} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TopicCard({ topic: t }: { topic: TopicEntry }) {
  if (t.status === 'ready')
    return (
      <a className="card" href={href.topic(t.category, t.id)}>
        <strong>{t.title}</strong>
        <span>{t.summary}</span>
        <LevelBadge level={t.level} />
      </a>
    );
  const issue = categoryOf(t.category)?.issue;
  return (
    <a className="card planned" href={issue ? `${ISSUES_URL}/${issue}` : ISSUES_URL} title="Planned, opens the issue on GitHub">
      <strong>{t.title}</strong>
      <span>{t.summary}</span>
      <span className="tag">Planned{issue ? `, issue #${issue}` : ''}</span>
    </a>
  );
}

// ---------- topic ----------

type Loaded<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'failed' };

function TopicPage({ id }: { id: string }) {
  const entry = findTopic(id);
  const [state, setState] = useState<Loaded<Topic>>({ status: 'loading' });
  useTitle(entry?.title ?? 'Basics & Concepts');

  // Previous and next links sit at the bottom of the page; a new topic starts at the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  useEffect(() => {
    if (!entry?.load) return;
    let active = true;
    setState({ status: 'loading' });
    entry
      .load()
      .then((data) => active && setState({ status: 'ready', data }))
      .catch(() => active && setState({ status: 'failed' }));
    return () => {
      active = false;
    };
  }, [entry]);

  if (!entry || entry.status !== 'ready')
    return (
      <p className="notice">
        {entry ? `"${entry.title}" is planned but not written yet.` : `There is no topic "${id}".`} <a href={href.basics}>All categories</a>.
      </p>
    );
  if (state.status === 'loading') return <p className="notice muted">Loading...</p>;
  if (state.status === 'failed') return <p className="notice">Could not load this topic. Reload the page to try again.</p>;
  return <TopicView topic={state.data} />;
}

function TopicView({ topic: t }: { topic: Topic }) {
  const category = categoryOf(t.category)!;
  const siblings = topicsOf(t.category).filter((s) => s.status === 'ready');
  const index = siblings.findIndex((s) => s.id === t.id);
  const prev = siblings[index - 1];
  const next = siblings[index + 1];
  const related = t.related.map(resolveRef).filter((r) => r !== undefined);

  return (
    <article className="index topic">
      <p className="back">
        <a href={href.basics}>Basics & Concepts</a> / <a href={href.category(category.id)}>{category.title}</a>
      </p>
      <h1>{t.title}</h1>
      <ReadFirst entry={{ topic: t.id }} />
      <p className="lead topic-definition">{t.definition}</p>
      <p className="topic-why">
        <strong>Why it matters:</strong> {t.why}
      </p>

      {t.sections.map((s) => (
        <section key={s.heading} className="topic-section">
          <h2>{s.heading}</h2>
          {s.blocks.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </section>
      ))}

      <section className="topic-section">
        <h2>Common misconceptions</h2>
        <ul className="misconceptions">
          {t.misconceptions.map((m) => (
            <li key={m.myth}>
              <p className="myth">
                <span className="tag">Myth</span> {m.myth}
              </p>
              <p>
                <span className="tag">In fact</span> {m.truth}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="topic-section">
        <h2>Try it yourself</h2>
        <Commands commands={t.practice.commands} />
        {t.practice.numbers && (
          <>
            <h3>Typical numbers</h3>
            <table className="kv">
              <tbody>
                {t.practice.numbers.map((n) => (
                  <tr key={n.label}>
                    <th scope="row">{n.label}</th>
                    <td>
                      {n.value}
                      {n.note && <span className="muted"> ({n.note})</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {t.practice.examples && (
          <>
            <h3>In practice</h3>
            <ul>
              {t.practice.examples.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="topic-section">
        <h2>Key terms</h2>
        <dl className="terms">
          {t.terms.map((term) => (
            <div key={term.term}>
              <dt>{term.term}</dt>
              <dd>{term.definition}</dd>
            </div>
          ))}
        </dl>
        <p>
          <a href={href.glossary}>All terms in the glossary</a>
        </p>
      </section>

      <section className="topic-section">
        <h2>Check yourself</h2>
        <TopicQuiz key={t.id} questions={t.quiz} />
      </section>

      {related.length > 0 && (
        <section className="topic-section">
          <h2>Related on this site</h2>
          <ul className="related">
            {related.map((r) => (
              <li key={r.href}>
                <span className="tag">{r.kind}</span> {r.planned ? <span className="muted">{r.title} (planned)</span> : <a href={r.href}>{r.title}</a>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="topic-section">
        <h2>Sources</h2>
        <SourceList sources={t.sources} />
      </section>

      <nav className="topic-nav" aria-label="More topics in this category">
        {prev ? <a href={href.topic(prev.category, prev.id)}>Previous: {prev.title}</a> : <span />}
        {next ? <a href={href.topic(next.category, next.id)}>Next: {next.title}</a> : <a href={href.category(category.id)}>All {category.title} topics</a>}
      </nav>
    </article>
  );
}

function BlockView({ block: b }: { block: Block }) {
  switch (b.kind) {
    case 'text':
      return <p>{b.text}</p>;
    case 'list':
      return (
        <ul>
          {b.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case 'note':
      return <p className="topic-note">{b.text}</p>;
    case 'figure':
      return (
        <figure className="basics-figure">
          <Figure id={b.figure} />
          <figcaption>{b.caption}</figcaption>
        </figure>
      );
    case 'table':
      return (
        <div className="table-scroll">
          <table className="compare">
            <caption>{b.caption}</caption>
            <thead>
              <tr>
                {b.columns.map((c) => (
                  <th key={c} scope="col">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, i) =>
                    i === 0 ? (
                      <th key={i} scope="row">
                        {cell}
                      </th>
                    ) : (
                      <td key={i}>{cell}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

function Commands({ commands }: { commands: Command[] }) {
  const systems = [...new Set(commands.map((c) => c.os))];
  return (
    <>
      {systems.map((os) => (
        <div key={os} className="commands">
          <h3>{os}</h3>
          <dl>
            {commands
              .filter((c) => c.os === os)
              .map((c) => (
                <div key={c.command}>
                  <dt>
                    <code>{c.command}</code>
                  </dt>
                  <dd>{c.shows}</dd>
                </div>
              ))}
          </dl>
        </div>
      ))}
    </>
  );
}

function TopicQuiz({ questions }: { questions: TopicQuestion[] }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const answered = questions.filter((q) => q.id in answers).length;
  const correct = questions.filter((q) => answers[q.id] === q.answer).length;
  return (
    <div className="quiz">
      <ol className="quiz-list">
        {questions.map((q, n) => {
          const chosen = answers[q.id];
          const done = chosen !== undefined;
          const right = chosen === q.answer;
          return (
            <li key={q.id} className="quiz-q">
              <fieldset>
                <legend>
                  <span className="quiz-n">{n + 1}.</span> {q.prompt}
                </legend>
                {q.options.map((text, i) => {
                  const mark = !done ? '' : i === q.answer ? ' is-right' : i === chosen ? ' is-wrong' : '';
                  return (
                    <label key={i} className={`quiz-option${mark}`}>
                      <input type="radio" name={q.id} checked={chosen === i} disabled={done && chosen !== i} onChange={() => setAnswers((a) => (q.id in a ? a : { ...a, [q.id]: i }))} />
                      <span>{text}</span>
                      {done && i === q.answer && <span className="quiz-mark">correct answer</span>}
                      {done && i === chosen && !right && <span className="quiz-mark">your answer</span>}
                    </label>
                  );
                })}
              </fieldset>
              {done && (
                <div className={`quiz-feedback${right ? ' is-right' : ' is-wrong'}`} role="status">
                  <p>
                    <strong>{right ? 'Right.' : 'Not quite.'}</strong> {q.explanation}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div className="quiz-score" aria-live="polite">
        <p>
          <strong>
            {correct} of {questions.length}
          </strong>{' '}
          correct{answered < questions.length ? `, ${questions.length - answered} still open` : '.'}
        </p>
        {answered > 0 && (
          <button type="button" onClick={() => setAnswers({})}>
            Start over
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- glossary ----------

interface GlossaryEntry {
  term: string;
  definition: string;
  topic: TopicEntry;
}

function GlossaryPage() {
  useTitle('Glossary');
  const [state, setState] = useState<Loaded<GlossaryEntry[]>>({ status: 'loading' });
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let active = true;
    const topics = readyTopics();
    Promise.all(topics.map((t) => t.load!()))
      .then((loaded) => {
        const entries = loaded.flatMap((data, i) => data.terms.map((term) => ({ ...term, topic: topics[i] })));
        entries.sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }));
        if (active) setState({ status: 'ready', data: entries });
      })
      .catch(() => active && setState({ status: 'failed' }));
    return () => {
      active = false;
    };
  }, []);

  const shown = useMemo(() => {
    if (state.status !== 'ready') return [];
    const f = filter.trim().toLowerCase();
    return f ? state.data.filter((e) => e.term.toLowerCase().includes(f) || e.definition.toLowerCase().includes(f)) : state.data;
  }, [state, filter]);

  return (
    <div className="index basics glossary">
      <p className="back">
        <a href={href.basics}>Basics & Concepts</a>
      </p>
      <h1>Glossary</h1>
      <p className="lead">Every key term from the Basics & Concepts topics, with a link to where it is explained.</p>
      <label className="glossary-filter">
        Filter <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="for example cache" />
      </label>
      {state.status === 'loading' && <p className="muted">Loading...</p>}
      {state.status === 'failed' && <p className="notice">Could not load the glossary. Reload the page to try again.</p>}
      {state.status === 'ready' && (
        <>
          <p className="muted" aria-live="polite">
            {shown.length} of {state.data.length} terms
          </p>
          <dl className="terms">
            {shown.map((e) => (
              <div key={`${e.term}-${e.topic.id}`}>
                <dt>{e.term}</dt>
                <dd>
                  {e.definition} <a href={href.topic(e.topic.category, e.topic.id)}>{e.topic.title}</a>
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}
