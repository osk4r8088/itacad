import type { Source } from '../shared/schema';
import type { Level } from '../shared/levels';

/**
 * One topic of Basics & Concepts. Every topic follows the same template, so the
 * topic page renders any of them without topic-specific code.
 */
export interface Topic {
  id: string;
  /** Id of a category in src/basics/catalog.ts. */
  category: string;
  title: string;
  level: Level;
  /** One sentence: what it is. */
  definition: string;
  /** One or two sentences: why it matters. */
  why: string;
  /** The core explanation in short sections. */
  sections: TopicSection[];
  misconceptions: Misconception[];
  practice: Practice;
  /** Key terms, collected into the site-wide glossary. */
  terms: Term[];
  related: RelatedRef[];
  sources: Source[];
  quiz: TopicQuestion[];
}

export interface TopicSection {
  heading: string;
  blocks: Block[];
}

export type Block =
  /** A paragraph. */
  | { kind: 'text'; text: string }
  | { kind: 'list'; items: string[] }
  /** A comparison table; the first column names the row. */
  | { kind: 'table'; caption: string; columns: string[]; rows: string[][] }
  /** A diagram or interactive piece from src/basics/figures. */
  | { kind: 'figure'; figure: string; caption: string }
  /** A remark set apart from the text, for example on values that vary or are not verified. */
  | { kind: 'note'; text: string };

export interface Misconception {
  myth: string;
  truth: string;
}

export interface Practice {
  /** Commands to look at it on your own machine. */
  commands: Command[];
  /** Typical numbers, each with a remark on how much they vary. */
  numbers?: { label: string; value: string; note?: string }[];
  /** Where you meet it in everyday work. */
  examples?: string[];
}

export interface Command {
  os: 'Linux' | 'Windows' | 'macOS';
  command: string;
  shows: string;
}

export interface Term {
  term: string;
  definition: string;
}

/** A link to other content of the site. Tests check that every reference resolves. */
export type RelatedRef = { topic: string } | { protocol: string; step?: number } | { entry: string };

export interface TopicQuestion {
  id: string;
  prompt: string;
  options: string[];
  /** Index of the correct answer in options. */
  answer: number;
  explanation: string;
}
