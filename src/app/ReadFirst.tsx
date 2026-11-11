import type { EntryRef } from '../shared/refs';
import { LevelBadge } from '../shared/components/LevelBadge';
import { resolveRef } from './entries';

/** The level of an entry and the entries to read before it. */
export function ReadFirst({ entry, className = 'read-first' }: { entry: EntryRef; className?: string }) {
  const info = resolveRef(entry);
  if (!info) return null;
  const prereqs = info.prereqs.map(resolveRef).filter((p) => p !== undefined);
  return (
    <p className={className}>
      <LevelBadge level={info.level} />
      {prereqs.length > 0 && (
        <span>
          {' '}
          Read first:{' '}
          {prereqs.map((p, i) => (
            <span key={p.href}>
              {i > 0 && ', '}
              {p.planned ? <span className="muted">{p.title} (planned)</span> : <a href={p.href}>{p.title}</a>}
            </span>
          ))}
        </span>
      )}
    </p>
  );
}
