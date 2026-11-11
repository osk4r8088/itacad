import { useEffect, useState } from 'react';

/**
 * Hash routes work on any static host:
 *   #/                     start page
 *   #/protocols            protocol overview
 *   #/protocols/tcp/3      step 3 of the TCP exchange
 *   #/protocols/tcp/3/tcp/window  the same step with the Window field of the TCP header selected
 *   #/tools, #/tools/<id>  everyday tools, one tool
 *   #/explore, #/explore/<id>  models and references to explore, one of them
 *   #/learn, #/learn/<id>  learning content; lessons that are exchanges take a step: #/learn/<id>/<step>
 *   #/learn/quizzes/tcp    the quiz of one protocol
 *   #/basics, #/basics/<category>, #/basics/<category>/<topic>  Basics & Concepts
 *   #/basics/glossary      all key terms
 * Links of the old form #/tcp/3 redirect to #/protocols/tcp/3.
 */
/** A header, and optionally one of its fields, to select in the packet view of a step. */
export interface Select {
  layer: string;
  field?: string;
}

const selectPath = (select?: Select) => (select ? `/${select.layer}${select.field ? `/${select.field}` : ''}` : '');

export type Route =
  | { page: 'home' }
  | { page: 'protocols' }
  | { page: 'exchange'; id: string; step: number; select?: Select }
  | { page: 'tools' }
  | { page: 'tool'; id: string }
  | { page: 'explore' }
  | { page: 'explorer'; id: string }
  | { page: 'learn' }
  | { page: 'lesson'; id: string; step: number; select?: Select }
  | { page: 'quiz'; id: string }
  | { page: 'basics' }
  | { page: 'category'; id: string }
  | { page: 'topic'; category: string; id: string }
  | { page: 'glossary' }
  | { page: 'redirect'; to: string };

export const href = {
  home: '#/',
  protocols: '#/protocols',
  exchange: (id: string, step = 1, select?: Select) => `#/protocols/${id}/${step}${selectPath(select)}`,
  tools: '#/tools',
  tool: (id: string) => `#/tools/${id}`,
  explore: '#/explore',
  explorer: (id: string) => `#/explore/${id}`,
  learn: '#/learn',
  lesson: (id: string, step?: number, select?: Select) => (step ? `#/learn/${id}/${step}${selectPath(select)}` : `#/learn/${id}`),
  quizzes: '#/learn/quizzes',
  quiz: (id: string) => `#/learn/quizzes/${id}`,
  basics: '#/basics',
  category: (id: string) => `#/basics/${id}`,
  topic: (category: string, id: string) => `#/basics/${category}/${id}`,
  glossary: '#/basics/glossary',
};

function stepOf(value: string | undefined): number {
  const step = Number(value);
  return Number.isInteger(step) && step > 0 ? step : 1;
}

export function parseRoute(hash: string): Route {
  const [section, id, rest, layer, field] = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const select = layer ? { select: { layer, ...(field ? { field } : {}) } } : {};
  switch (section) {
    case undefined:
      return { page: 'home' };
    case 'protocols':
      return id ? { page: 'exchange', id, step: stepOf(rest), ...select } : { page: 'protocols' };
    case 'tools':
      return id ? { page: 'tool', id } : { page: 'tools' };
    case 'explore':
      return id ? { page: 'explorer', id } : { page: 'explore' };
    case 'learn':
      if (id === 'quizzes' && rest) return { page: 'quiz', id: rest };
      return id ? { page: 'lesson', id, step: stepOf(rest), ...select } : { page: 'learn' };
    case 'basics':
      if (id === 'glossary') return { page: 'glossary' };
      if (id && rest) return { page: 'topic', category: id, id: rest };
      return id ? { page: 'category', id } : { page: 'basics' };
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
