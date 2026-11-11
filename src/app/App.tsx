import { lazy, Suspense, useEffect } from 'react';
import { href, replaceHash, useHashRoute, type Route } from './router';
import { pageTitle } from '../shared/hub';
import { SiteHeader, type Section } from './SiteHeader';
import { Home } from './Home';
import { HubCards } from './HubCards';
import { HubEntryPage } from './HubEntryPage';
import { ProtocolIndex } from '../protocols/components/ProtocolIndex';
import { SECTION_INFO, TOOLS, toolsFor } from '../tools/registry';
import { LESSONS } from '../learn/registry';

// The exchange page and the exchange data load only when a protocol is opened.
const ExchangeRoute = lazy(() => import('../protocols/ExchangeRoute'));
const LessonExchange = lazy(() => import('../learn/LessonExchange'));
const QuizPage = lazy(() => import('../quizzes/QuizPage'));
const BasicsPages = lazy(() => import('../basics/BasicsPages'));

function titleOf(route: Route): string | undefined {
  switch (route.page) {
    case 'protocols':
      return 'Protocols';
    case 'tools':
      return 'Tools';
    case 'explore':
      return 'Explore and understand';
    case 'learn':
      return 'Learn';
    case 'tool':
    case 'explorer':
      return TOOLS.find((t) => t.id === route.id)?.title;
    case 'lesson':
      return LESSONS.find((l) => l.id === route.id)?.title;
    default:
      return undefined;
  }
}

function sectionOf(route: Route): Section | undefined {
  if (route.page === 'basics' || route.page === 'category' || route.page === 'topic' || route.page === 'glossary') return 'basics';
  if (route.page === 'protocols' || route.page === 'exchange') return 'protocols';
  if (route.page === 'tools' || route.page === 'tool') return 'tools';
  if (route.page === 'explore' || route.page === 'explorer') return 'explore';
  if (route.page === 'learn' || route.page === 'lesson' || route.page === 'quiz') return 'learn';
  return undefined;
}

export function App() {
  const route = useHashRoute();

  useEffect(() => {
    if (route.page === 'redirect') replaceHash(route.to);
    // An entry opened under the other section (for example an old #/tools/ link) moves to its own section.
    const entry = route.page === 'tool' || route.page === 'explorer' ? TOOLS.find((t) => t.id === route.id) : undefined;
    if (route.page === 'tool' && entry?.purpose === 'understand') replaceHash(href.explorer(route.id));
    if (route.page === 'explorer' && entry?.purpose === 'use') replaceHash(href.tool(route.id));
  }, [route]);

  useEffect(() => {
    if (route.page === 'exchange' || route.page === 'quiz') return; // ExchangeRoute and QuizPage set the title once the data is loaded
    if (sectionOf(route) === 'basics') return; // so do the Basics & Concepts pages
    if (route.page === 'lesson' && LESSONS.find((l) => l.id === route.id)?.exchange) return; // so does LessonExchange
    const title = titleOf(route);
    document.title = pageTitle(title);
  }, [route]);

  if (route.page === 'redirect') return null;

  // Lessons that are exchanges use the exchange page with their own route.
  const lesson = route.page === 'lesson' ? LESSONS.find((l) => l.id === route.id) : undefined;
  if (route.page === 'lesson' && lesson?.status === 'ready' && lesson.exchange)
    return (
      <Suspense fallback={<p className="notice muted">Loading...</p>}>
        <LessonExchange entry={lesson} step={route.step} select={route.select} />
      </Suspense>
    );

  // Exchange pages render their own toolbar with the step controls.
  if (route.page === 'exchange')
    return (
      <Suspense fallback={<p className="notice muted">Loading...</p>}>
        <ExchangeRoute id={route.id} step={route.step} select={route.select} />
      </Suspense>
    );

  return (
    <>
      <SiteHeader current={sectionOf(route)} />
      <main>
        {route.page === 'home' && <Home />}
        {route.page === 'protocols' && <ProtocolIndex />}
        {(route.page === 'tools' || route.page === 'explore') && (
          <div className="index">
            <h1>{SECTION_INFO[route.page === 'tools' ? 'use' : 'understand'].title}</h1>
            <p className="lead">{SECTION_INFO[route.page === 'tools' ? 'use' : 'understand'].about}</p>
            <HubCards entries={toolsFor(route.page === 'tools' ? 'use' : 'understand')} link={route.page === 'tools' ? href.tool : href.explorer} />
          </div>
        )}
        {route.page === 'learn' && (
          <div className="index">
            <h1>Learn</h1>
            <HubCards entries={LESSONS} link={href.lesson} />
          </div>
        )}
        {route.page === 'tool' && <HubEntryPage id={route.id} entry={TOOLS.find((t) => t.id === route.id)} back={{ label: 'All tools', href: href.tools }} />}
        {route.page === 'explorer' && <HubEntryPage id={route.id} entry={TOOLS.find((t) => t.id === route.id)} back={{ label: 'Explore and understand', href: href.explore }} />}
        {(route.page === 'basics' || route.page === 'category' || route.page === 'topic' || route.page === 'glossary') && (
          <Suspense fallback={<p className="notice muted">Loading...</p>}>
            <BasicsPages route={route} />
          </Suspense>
        )}
        {route.page === 'quiz' && (
          <Suspense fallback={<p className="notice muted">Loading quiz...</p>}>
            <QuizPage id={route.id} />
          </Suspense>
        )}
        {route.page === 'lesson' && <HubEntryPage id={route.id} entry={LESSONS.find((l) => l.id === route.id)} back={{ label: 'All lessons', href: href.learn }} />}
      </main>
    </>
  );
}
