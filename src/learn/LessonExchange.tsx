import { useCallback, useEffect, useState } from 'react';
import type { Exchange } from '../shared/schema';
import { pageTitle, type HubEntry } from '../shared/hub';
import { ExchangePage } from '../protocols/components/ExchangePage';
import { href, type Select } from '../app/router';
import { SiteHeader } from '../app/SiteHeader';

const cache = new Map<string, Exchange>();

/** A lesson shown as a step-by-step exchange, at #/learn/<id>/<step>. */
export default function LessonExchange({ entry, step, select }: { entry: HubEntry; step: number; select?: Select }) {
  const [exchange, setExchange] = useState<Exchange | 'failed' | undefined>(() => cache.get(entry.id));

  useEffect(() => {
    if (cache.has(entry.id) || !entry.exchange) return;
    let active = true;
    entry.exchange().then(
      (ex) => {
        cache.set(entry.id, ex);
        if (active) setExchange(ex);
      },
      () => active && setExchange('failed'),
    );
    return () => {
      active = false;
    };
  }, [entry]);

  useEffect(() => {
    document.title = pageTitle(entry.title);
  }, [entry.title]);

  const stepHref = useCallback((n: number) => href.lesson(entry.id, n), [entry.id]);

  if (exchange && exchange !== 'failed')
    return (
      <ExchangePage
        key={entry.id}
        exchange={exchange}
        stepNumber={step}
        stepHref={stepHref}
        select={select}
        entry={{ entry: entry.id }}
        crumb={
          <span className="lesson-crumb">
            <a href={href.learn}>Learn</a> / <strong>{entry.title}</strong>
          </span>
        }
      />
    );

  return (
    <>
      <SiteHeader current="learn" />
      <main>
        <p className="notice muted">
          {exchange === 'failed' ? (
            <>
              Could not load this lesson. Reload the page, or go back to <a href={href.learn}>all lessons</a>.
            </>
          ) : (
            `Loading ${entry.title}...`
          )}
        </p>
      </main>
    </>
  );
}
