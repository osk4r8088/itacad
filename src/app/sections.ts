import { CATALOG } from '../protocols/catalog';
import { LESSONS } from '../learn/registry';
import { SECTION_INFO, TOOLS, entryHref, toolsFor } from '../tools/registry';
import { href } from './router';
import { CATEGORIES, findTopic, readyTopics } from '../basics/catalog';

export type Section = 'basics' | 'protocols' | 'tools' | 'explore' | 'learn';

export interface Highlight {
  title: string;
  href: string;
}

export interface SiteSection {
  id: Section;
  /** Short name for the header navigation. */
  label: string;
  title: string;
  about: string;
  href: string;
  /** Number of ready entries, and how to call them. */
  count: () => number;
  unit: string;
  /** Two or three entries worth opening first, shown on the start page tile. */
  highlights: () => Highlight[];
}

const ready = <T extends { status?: string }>(list: T[]) => list.filter((e) => e.status === undefined || e.status === 'ready');

const protocol = (id: string): Highlight => {
  const e = CATALOG.find((c) => c.id === id)!;
  return { title: e.title, href: href.exchange(id) };
};
const tool = (id: string): Highlight => ({ title: TOOLS.find((t) => t.id === id)!.title, href: entryHref(id) });
const topic = (id: string): Highlight => {
  const t = findTopic(id)!;
  return { title: t.title, href: href.topic(t.category, t.id) };
};
const lesson = (id: string): Highlight => {
  const e = LESSONS.find((l) => l.id === id)!;
  return { title: e.title, href: e.exchange ? href.lesson(id, 1) : href.lesson(id) };
};

/** The sections of the site, in header order. The start page shows one tile per section. */
export const SECTIONS: SiteSection[] = [
  {
    id: 'basics',
    label: 'Basics',
    title: 'Basics & Concepts',
    about: `The building blocks of IT, starting from zero: ${CATEGORIES.slice(0, 4)
      .map((c) => c.title.toLowerCase())
      .join(', ')} and more.`,
    href: href.basics,
    count: () => readyTopics().length,
    unit: 'topics',
    highlights: () => ['cpu', 'memory', 'network-devices'].map(topic),
  },
  {
    id: 'protocols',
    label: 'Protocols',
    title: 'Protocols',
    about: 'Real exchanges step by step: who sends what, the sequence, and every header field of every packet.',
    href: href.protocols,
    count: () => CATALOG.length,
    unit: 'protocols',
    highlights: () => ['tcp', 'dns', 'tls'].map(protocol),
  },
  {
    id: 'tools',
    label: 'Tools',
    title: SECTION_INFO.use.title,
    about: SECTION_INFO.use.about,
    href: href.tools,
    count: () => ready(toolsFor('use')).length,
    unit: 'tools',
    highlights: () => ['subnet', 'decoder', 'vlsm'].map(tool),
  },
  {
    id: 'explore',
    label: 'Explore',
    title: SECTION_INFO.understand.title,
    about: SECTION_INFO.understand.about,
    href: href.explore,
    count: () => ready(toolsFor('understand')).length,
    unit: 'models and references',
    highlights: () => ['tcp-states', 'raid', 'dns-records'].map(tool),
  },
  {
    id: 'learn',
    label: 'Learn',
    title: 'Learn',
    about: 'Lessons that connect the pieces: the layer models, a whole page load from start to finish, attacks and their defenses, quizzes.',
    href: href.learn,
    count: () => ready(LESSONS).length,
    unit: 'lessons',
    highlights: () => ['layers', 'url-to-page', 'arp-spoofing'].map(lesson),
  },
];

/** First steps for someone new to the site, shown above the section tiles. */
export const START_HERE: { title: string; why: string; href: string }[] = [
  { title: 'Inside a computer', why: 'New to IT? Start with the parts of a computer and the boxes of a network.', href: href.category('hardware') },
  { title: 'OSI and TCP/IP overview', why: 'The map: every layer, what it does, and what on this site belongs to it.', href: href.lesson('layers') },
  { title: 'From URL to page', why: 'Everything at once: a laptop joins a network and loads a page, frame by frame.', href: href.lesson('url-to-page', 1) },
  { title: 'TCP', why: 'The classic: handshake, data and close, with every header field explained.', href: href.exchange('tcp') },
  { title: 'Subnet calculator', why: 'Hands-on: see network and host bits move as you change the prefix.', href: href.tool('subnet') },
];
