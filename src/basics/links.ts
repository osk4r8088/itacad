import { href } from '../app/router';
import { CATALOG } from '../protocols/catalog';
import { LESSONS } from '../learn/registry';
import { TOOLS, entryHref } from '../tools/registry';
import { findTopic } from './catalog';
import type { RelatedRef } from './schema';

export interface ResolvedLink {
  title: string;
  href: string;
  /** Which part of the site the link leads to. */
  kind: string;
  planned?: boolean;
}

/** Turns a reference into a link; undefined if it points nowhere (tests check that this never happens). */
export function resolveRef(ref: RelatedRef): ResolvedLink | undefined {
  if ('topic' in ref) {
    const t = findTopic(ref.topic);
    return t && { title: t.title, href: href.topic(t.category, t.id), kind: 'Basics', planned: t.status === 'planned' };
  }
  if ('protocol' in ref) {
    const p = CATALOG.find((c) => c.id === ref.protocol);
    return p && { title: p.title, href: href.exchange(p.id, ref.step), kind: 'Protocol' };
  }
  const tool = TOOLS.find((t) => t.id === ref.entry && t.status === 'ready');
  if (tool) return { title: tool.title, href: entryHref(tool.id), kind: tool.purpose === 'understand' ? 'Explore' : 'Tool' };
  const lesson = LESSONS.find((l) => l.id === ref.entry && l.status === 'ready');
  if (lesson) return { title: lesson.title, href: lesson.exchange ? href.lesson(lesson.id, 1) : href.lesson(lesson.id), kind: 'Lesson' };
  return undefined;
}
