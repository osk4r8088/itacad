import { useEffect, useState } from 'react';

export type Route = { page: 'index' } | { page: 'exchange'; id: string; step: number };

/** Hash routes work on any static host: #/ is the index, #/tcp/3 is step 3 of TCP. */
export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts.length === 0) return { page: 'index' };
  const step = Number(parts[1]);
  return { page: 'exchange', id: parts[0], step: Number.isInteger(step) && step > 0 ? step : 1 };
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

/** Changes the step without adding a history entry for every click. */
export function replaceHash(hash: string): void {
  window.history.replaceState(null, '', hash);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
