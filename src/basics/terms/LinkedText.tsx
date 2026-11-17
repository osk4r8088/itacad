import { href } from '../../app/router';
import { findTopic } from '../catalog';
import type { Segment } from './match';

/** Text with key terms linked to their entry under "Key terms" in the topic that defines them. */
export function LinkedText({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((s, i) =>
        typeof s === 'string' ? (
          s
        ) : (
          <a key={i} className="term-link" href={href.term(s.term.category, s.term.topic, s.term.slug)} title={`${s.term.term}: key term of ${findTopic(s.term.topic)?.title ?? s.term.topic}`}>
            {s.text}
          </a>
        ),
      )}
    </>
  );
}

/** Paragraphs of linked text, as Prose renders plain text. */
export function LinkedProse({ paragraphs }: { paragraphs: Segment[][] }) {
  return (
    <>
      {paragraphs.map((p, i) => (
        <p key={i}>
          <LinkedText segments={p} />
        </p>
      ))}
    </>
  );
}
