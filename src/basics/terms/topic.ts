import type { Block, Topic } from '../schema';
import { linkTerms, type Matcher, type Segment } from './match';

/** A block with its text split into segments; blocks without running text (tables, figures) stay as they are. */
export type LinkedBlock =
  | { kind: 'text' | 'note'; segments: Segment[] }
  | { kind: 'list'; items: Segment[][] }
  | { kind: 'other'; block: Block };

/** The running texts of a topic with key terms of other topics linked, in page order. */
export interface LinkedTopic {
  definition: Segment[];
  why: Segment[];
  sections: LinkedBlock[][];
  misconceptions: { myth: Segment[]; truth: Segment[] }[];
}

/**
 * Links the running texts of one topic. Each part of the page counts as one section for the rule
 * "link a term once per section": the definition with "why it matters", every section, and the
 * misconceptions together. Tables, figures, commands, key terms and the quiz get no links.
 */
export function linkTopic(topic: Topic, matcher: Matcher): LinkedTopic {
  const group = () => {
    const linked = new Set<string>();
    return (text: string) => linkTerms(text, matcher, topic.id, linked);
  };
  const intro = group();
  const definition = intro(topic.definition);
  const why = intro(topic.why);
  const sections = topic.sections.map((s) => {
    const link = group();
    return s.blocks.map((b): LinkedBlock => {
      switch (b.kind) {
        case 'text':
        case 'note':
          return { kind: b.kind, segments: link(b.text) };
        case 'list':
          return { kind: 'list', items: b.items.map(link) };
        default:
          return { kind: 'other', block: b };
      }
    });
  });
  const mis = group();
  const misconceptions = topic.misconceptions.map((m) => ({ myth: mis(m.myth), truth: mis(m.truth) }));
  return { definition, why, sections, misconceptions };
}
