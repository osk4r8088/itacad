import { lazy, Suspense, useEffect } from 'react';
import { href, replaceHash, useHashRoute, type Route } from './router';
import { SiteHeader, type Section } from './SiteHeader';
import { Home } from './Home';
import { HubCards } from './HubCards';
import { ToolGroups } from './ToolGroups';
import { HubEntryPage } from './HubEntryPage';
import { ProtocolIndex } from '../protocols/components/ProtocolIndex';
import { TOOLS } from '../tools/registry';
import { LESSONS } from '../learn/registry';

// The exchange page and the exchange data load only when a protocol is opened.
const ExchangeRoute = lazy(() => import('../protocols/ExchangeRoute'));
const LessonExchange = lazy(() => import('../learn/LessonExchange'));

function titleOf(route: Route): string | undefined {
  switch (route.page) {
    case 'protocols':
      return 'Protocols';
    case 'tools':
      return 'Tools';
    case 'learn':
      return 'Learn';
    case 'tool':
      return TOOLS.find((t) => t.id === route.id)?.title;
    case 'lesson':
      return LESSONS.find((l) => l.id === route.id)?.title;
    default:
      return undefined;
  }
}

function sectionOf(route: Route): Section | undefined {
  if (route.page === 'protocols' || route.page === 'exchange') return 'protocols';
  if (route.page === 'tools' || route.page === 'tool') return 'tools';
  if (route.page === 'learn' || route.page === 'lesson') return 'learn';
  return undefined;
}

export function App() {
  const route = useHashRoute();

  useEffect(() => {
    if (route.page === 'redirect') replaceHash(route.to);
  }, [route]);

  useEffect(() => {
    if (route.page === 'exchange') return; // ExchangeRoute sets the title once the data is loaded
    if (route.page === 'lesson' && LESSONS.find((l) => l.id === route.id)?.exchange) return; // so does LessonExchange
    const title = titleOf(route);
    document.title = title ? `${title} | Netkit` : 'Netkit';
  }, [route]);

  if (route.page === 'redirect') return null;

  // Lessons that are exchanges use the exchange page with their own route.
  const lesson = route.page === 'lesson' ? LESSONS.find((l) => l.id === route.id) : undefined;
  if (route.page === 'lesson' && lesson?.status === 'ready' && lesson.exchange)
    return (
      <Suspense fallback={<p className="notice muted">Loading...</p>}>
        <LessonExchange entry={lesson} step={route.step} />
      </Suspense>
    );

  // Exchange pages render their own toolbar with the step controls.
  if (route.page === 'exchange')
    return (
      <Suspense fallback={<p className="notice muted">Loading...</p>}>
        <ExchangeRoute id={route.id} step={route.step} />
      </Suspense>
    );

  return (
    <>
      <SiteHeader current={sectionOf(route)} />
      <main>
        {route.page === 'home' && <Home />}
        {route.page === 'protocols' && <ProtocolIndex />}
        {route.page === 'tools' && (
          <div className="index">
            <h1>Tools</h1>
            <ToolGroups />
          </div>
        )}
        {route.page === 'learn' && (
          <div className="index">
            <h1>Learn</h1>
            <HubCards entries={LESSONS} link={href.lesson} />
          </div>
        )}
        {route.page === 'tool' && <HubEntryPage id={route.id} entry={TOOLS.find((t) => t.id === route.id)} back={{ label: 'All tools', href: href.tools }} />}
        {route.page === 'lesson' && <HubEntryPage id={route.id} entry={LESSONS.find((l) => l.id === route.id)} back={{ label: 'All lessons', href: href.learn }} />}
      </main>
    </>
  );
}
