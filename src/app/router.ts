import { useEffect, useState } from 'react';

/**
 * Hash routes work on any static host:
 *   #/                     start page
 *   #/protocols            protocol overview
 *   #/protocols/tcp/3      step 3 of the TCP exchange
 *   #/tools, #/tools/<id>  everyday tools, one tool
 *   #/explore, #/explore/<id>  models and references to explore, one of them
 *   #/learn, #/learn/<id>  learning content; lessons that are exchanges take a step: #/learn/<id>/<step>
 *   #/learn/quizzes/tcp    the quiz of one protocol
 * Links of the old form #/tcp/3 redirect to #/protocols/tcp/3.
 */
export type Route =
  | { page: 'home' }
  | { page: 'protocols' }
  | { page: 'exchange'; id: string; step: number }
  | { page: 'tools' }
  | { page: 'tool'; id: string }
  | { page: 'explore' }
  | { page: 'explorer'; id: string }
  | { page: 'learn' }
  | { page: 'lesson'; id: string; step: number }
  | { page: 'quiz'; id: string }
  | { page: 'redirect'; to: string };

export const href = {
  home: '#/',
  protocols: '#/protocols',
  exchange: (id: string, step = 1) => `#/protocols/${id}/${step}`,
  tools: '#/tools',
  tool: (id: string) => `#/tools/${id}`,
  explore: '#/explore',
  explorer: (id: string) => `#/explore/${id}`,
  learn: '#/learn',
  lesson: (id: string, step?: number) => (step ? `#/learn/${id}/${step}` : `#/learn/${id}`),
  quizzes: '#/learn/quizzes',
  quiz: (id: string) => `#/learn/quizzes/${id}`,
};

function stepOf(value: string | undefined): number {
  const step = Number(value);
  return Number.isInteger(step) && step > 0 ? step : 1;
}

export function parseRoute(hash: string): Route {
  const [section, id, rest] = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  switch (section) {
    case undefined:
      return { page: 'home' };
    case 'protocols':
      return id ? { page: 'exchange', id, step: stepOf(rest) } : { page: 'protocols' };
    case 'tools':
      return id ? { page: 'tool', id } : { page: 'tools' };
    case 'explore':
      return id ? { page: 'explorer', id } : { page: 'explore' };
    case 'learn':
      if (id === 'quizzes' && rest) return { page: 'quiz', id: rest };
      return id ? { page: 'lesson', id, step: stepOf(rest) } : { page: 'learn' };
    default:
      // Old links: #/tcp/3 meant step 3 of TCP.
      return { page: 'redirect', to: href.exchange(section, stepOf(id)) };
  }
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

/** Changes the route without adding a history entry, for step changes and redirects. */
export function replaceHash(hash: string): void {
  window.history.replaceState(null, '', hash);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
