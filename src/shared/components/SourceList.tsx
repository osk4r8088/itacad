import type { Source } from '../schema';
import { sourceLabel, sourceUrl } from '../lib/sources';

export function SourceLink({ source }: { source: Source }) {
  const url = sourceUrl(source);
  const label = sourceLabel(source);
  return url ? (
    <a href={url} target="_blank" rel="noreferrer">
      {label}
    </a>
  ) : (
    <span>{label}</span>
  );
}

export function SourceList({ sources }: { sources: Source[] }) {
  return (
    <ul className="sources">
      {sources.map((s, i) => (
        <li key={i}>
          <SourceLink source={s} />
          {s.note && <span className="muted"> ({s.note})</span>}
        </li>
      ))}
    </ul>
  );
}
