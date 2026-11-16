import { findTopic, readyTopics } from '../catalog';
import { EXCLUDED, EXCLUDED_FORMS, EXCLUDED_IN } from './exclusions';
import { slugOf, termForms, type LinkableTerm } from './match';

/**
 * One entry of the term index as it is shipped to the browser. Only what cannot be computed there:
 * the forms when they differ from the term itself, and the topics where the term is not linked.
 */
export interface TermIndexEntry {
  term: string;
  topic: string;
  forms?: string[];
  notIn?: string[];
}

/**
 * The term index: every key term that may be linked, with the topic that defines it.
 * Built when the site is built (see vite.config.ts), so a topic page does not have to load all topics.
 * Abbreviations that two terms share, such as RSS, are left out, because a link could not tell which one is meant.
 */
export async function buildTermIndex(): Promise<TermIndexEntry[]> {
  const entries = readyTopics();
  const topics = await Promise.all(entries.map((t) => t.load!()));
  const terms = topics.flatMap((topic) =>
    topic.terms
      .filter((t) => !(t.term in EXCLUDED))
      .map((t) => ({ term: t.term, topic: topic.id, forms: termForms(t.term).filter((f) => !(f in EXCLUDED_FORMS)) })),
  );
  const count = new Map<string, number>();
  for (const t of terms) for (const f of t.forms) count.set(f.toLowerCase(), (count.get(f.toLowerCase()) ?? 0) + 1);
  return terms
    .map((t) => ({ ...t, forms: t.forms.filter((f) => count.get(f.toLowerCase()) === 1) }))
    .filter((t) => t.forms.length > 0)
    .map(({ term, topic, forms }) => ({
      term,
      topic,
      ...(forms.length === 1 && forms[0] === term ? {} : { forms }),
      ...(EXCLUDED_IN[term] ? { notIn: EXCLUDED_IN[term] } : {}),
    }));
}

/** The term index with everything the matcher and the links need, computed in the browser. */
export const expandTermIndex = (entries: TermIndexEntry[]): LinkableTerm[] =>
  entries.map((e) => ({ ...e, category: findTopic(e.topic)!.category, slug: slugOf(e.term), forms: e.forms ?? [e.term] }));
