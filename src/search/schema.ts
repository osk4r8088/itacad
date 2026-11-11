/** What a search result is; results are grouped by it. */
export type DocKind = 'basics' | 'protocol' | 'tool' | 'explore' | 'lesson' | 'step' | 'field' | 'term' | 'port' | 'question';

/** Group headings, in the order used when two groups match equally well. */
export const KIND_LABELS: Record<DocKind, string> = {
  basics: 'Basics & Concepts',
  protocol: 'Protocols',
  tool: 'Tools',
  explore: 'Explore and understand',
  lesson: 'Lessons',
  field: 'Header fields',
  step: 'Steps',
  term: 'Terms',
  port: 'Ports',
  question: 'Quiz questions',
};

/** One thing the search can find. The index is a list of these, built when the site is built. */
export interface SearchDoc {
  kind: DocKind;
  /** What is matched first and shown as the result. */
  title: string;
  /** Where it belongs, for example "TCP, step 3" or "TCP header". Shown next to the title. */
  context?: string;
  /** Words that should find the entry without being shown, for example an abbreviation. */
  keywords?: string;
  /** Longer text to search; a piece around the match is shown. */
  text?: string;
  href: string;
}
