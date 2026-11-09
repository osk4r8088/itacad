import { Suspense } from 'react';
import { ISSUES_URL, type HubEntry } from '../shared/hub';

/** Shows one tool or lesson: loads its component, or explains that it is planned. */
export function HubEntryPage({ entry, id, back }: { entry: HubEntry | undefined; id: string; back: { label: string; href: string } }) {
  if (!entry)
    return (
      <p className="notice">
        Unknown page "{id}". <a href={back.href}>{back.label}</a>.
      </p>
    );

  if (entry.status === 'planned' || !entry.component)
    return (
      <div className="index">
        <h1>{entry.title}</h1>
        <p className="lead">{entry.summary}</p>
        <p className="notice">
          Planned, not built yet.{' '}
          {entry.issue && (
            <>
              Progress is tracked in <a href={`${ISSUES_URL}/${entry.issue}`}>issue #{entry.issue}</a>.{' '}
            </>
          )}
          <a href={back.href}>{back.label}</a>.
        </p>
      </div>
    );

  const Component = entry.component;
  return (
    <Suspense fallback={<p className="notice muted">Loading {entry.title}...</p>}>
      <Component />
    </Suspense>
  );
}
