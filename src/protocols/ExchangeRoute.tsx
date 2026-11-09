import { useEffect, useState } from 'react';
import type { Exchange } from '../shared/schema';
import { findEntry } from './catalog';
import { ExchangePage } from './components/ExchangePage';
import { href } from '../app/router';
import { SiteHeader } from '../app/SiteHeader';

const cache = new Map<string, Exchange>();

type State = { status: 'loading' } | { status: 'ready'; exchange: Exchange } | { status: 'missing' } | { status: 'failed' };

/** Loads one exchange on demand and shows its page. Loaded exchanges stay cached. */
export default function ExchangeRoute({ id, step }: { id: string; step: number }) {
  const [state, setState] = useState<State>(() => {
    const cached = cache.get(id);
    if (cached) return { status: 'ready', exchange: cached };
    return findEntry(id) ? { status: 'loading' } : { status: 'missing' };
  });

  useEffect(() => {
    const entry = findEntry(id);
    if (!entry) return setState({ status: 'missing' });
    const cached = cache.get(id);
    if (cached) return setState({ status: 'ready', exchange: cached });
    let active = true;
    setState({ status: 'loading' });
    entry
      .load()
      .then((exchange) => {
        cache.set(id, exchange);
        if (active) setState({ status: 'ready', exchange });
      })
      .catch(() => active && setState({ status: 'failed' }));
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (state.status === 'ready') document.title = `${state.exchange.title} | Netkit`;
  }, [state]);

  if (state.status === 'ready') return <ExchangePage key={id} exchange={state.exchange} stepNumber={step} />;

  return (
    <>
      <SiteHeader current="protocols" />
      <main>
        {state.status === 'loading' && <p className="notice muted">Loading {findEntry(id)?.title ?? id}...</p>}
        {state.status === 'missing' && (
          <p className="notice">
            Unknown protocol "{id}". <a href={href.protocols}>All protocols</a>.
          </p>
        )}
        {state.status === 'failed' && (
          <p className="notice">
            Could not load this protocol. Reload the page to try again, or go to <a href={href.protocols}>all protocols</a>.
          </p>
        )}
      </main>
    </>
  );
}
