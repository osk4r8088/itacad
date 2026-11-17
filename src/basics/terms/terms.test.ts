import { beforeAll, describe, expect, it } from 'vitest';
import { findTopic, readyTopics } from '../catalog';
import type { Topic } from '../schema';
import { href, parseRoute } from '../../app/router';
import { buildTermIndex, expandTermIndex } from './build';
import { EXCLUDED, EXCLUDED_FORMS, EXCLUDED_IN } from './exclusions';
import { compileMatcher, excludedOn, linkProse, linkTerms, slugOf, termForms, type LinkableTerm, type Matcher, type Segment } from './match';
import { exchangePage, linkAbout, linkStepDetails } from './exchange';
import { exchanges as protocolExchanges } from '../../protocols/exchanges';
import { lessonExchanges } from '../../learn/exchanges';
import { linkTopic, type LinkedTopic } from './topic';

const entry = (term: string, topic = 't', extra: Partial<LinkableTerm> = {}): LinkableTerm => ({
  term,
  topic,
  category: 'c',
  slug: slugOf(term),
  forms: termForms(term),
  ...extra,
});
const links = (segments: Segment[]) => segments.flatMap((s) => (typeof s === 'string' ? [] : [`${s.text}>${s.term.term}`]));

describe('termForms and slugOf', () => {
  it('splits a term with an abbreviation into long form and abbreviation', () => {
    expect(termForms('Translation lookaside buffer (TLB)')).toEqual(['Translation lookaside buffer', 'TLB']);
    expect(termForms('Kilowatt-hour (kWh)')).toEqual(['Kilowatt-hour', 'kWh']);
  });
  it('leaves out abbreviations of one letter', () => {
    expect(termForms('Rack unit (U)')).toEqual(['Rack unit']);
  });
  it('does not match terms with a qualifier, which mark an ambiguous word', () => {
    expect(termForms('Service (cluster)')).toEqual([]);
    expect(termForms('Index (database)')).toEqual([]);
    expect(termForms('Namespace (Linux)')).toEqual([]);
  });
  it('makes URL-safe slugs', () => {
    expect(slugOf('Page table')).toBe('page-table');
    expect(slugOf('Translation lookaside buffer (TLB)')).toBe('translation-lookaside-buffer-tlb');
    expect(slugOf('UTF-8')).toBe('utf-8');
    expect(slugOf('C++')).toBe('cplusplus');
  });
});

describe('linkTerms', () => {
  const m = compileMatcher([entry('Page table', 'vm'), entry('Kernel', 'kernel'), entry('Central processing unit (CPU)', 'cpu'), entry('Hypervisor', 'hv', { notIn: ['gpu'] })]);
  const run = (text: string, topic = 'other', linked = new Set<string>()) => links(linkTerms(text, m, topic, linked));

  it('prefers the longest form and keeps the text around it', () => {
    const s = linkTerms('The page table of the kernel.', m, 'other', new Set());
    expect(s).toEqual(['The ', { text: 'page table', term: expect.objectContaining({ term: 'Page table' }) }, ' of the ', { text: 'kernel', term: expect.objectContaining({ term: 'Kernel' }) }, '.']);
  });
  it('matches plurals but not parts of words or hyphenated words', () => {
    expect(run('Two kernels.')).toEqual(['kernels>Kernel']);
    expect(run('A kernelspace, a kernel-mode driver.')).toEqual([]);
  });
  it('matches abbreviations only with their capital letters', () => {
    expect(run('The CPU and the cpu.')).toEqual(['CPU>Central processing unit (CPU)']);
    expect(run('Many CPUs.')).toEqual(['CPUs>Central processing unit (CPU)']);
  });
  it('links each term once per shared set, never in its own topic, never where excluded', () => {
    const linked = new Set<string>();
    expect(run('kernel and kernel', 'other', linked)).toEqual(['kernel>Kernel']);
    expect(run('the kernel again', 'other', linked)).toEqual([]);
    expect(run('the kernel', 'kernel')).toEqual([]);
    expect(run('a hypervisor', 'gpu')).toEqual([]);
    expect(run('a hypervisor', 'other')).toEqual(['hypervisor>Hypervisor']);
  });
});

describe('pages in exclusion lists', () => {
  it('matches a page directly or through its section', () => {
    expect(excludedOn(['gpu'], 'gpu')).toBe(true);
    expect(excludedOn(['protocols/*'], 'protocols/dns')).toBe(true);
    expect(excludedOn(['protocols/*'], 'learn/dns-poisoning')).toBe(false);
    expect(excludedOn(['protocols/imap'], 'protocols/imaps')).toBe(false);
    expect(excludedOn(undefined, 'cpu')).toBe(false);
  });
  it('links paragraphs with one shared set', () => {
    const m = compileMatcher([entry('Kernel', 'kernel')]);
    expect(linkProse('A kernel.\n\nThe kernel again.', m, 'other', new Set()).map(links)).toEqual([['kernel>Kernel'], []]);
  });
});

describe('the term index and all topics', () => {
  let terms: LinkableTerm[];
  let matcher: Matcher;
  let topics: Topic[];
  let linked: LinkedTopic[];
  beforeAll(async () => {
    terms = expandTermIndex(await buildTermIndex());
    matcher = compileMatcher(terms);
    topics = await Promise.all(readyTopics().map((t) => t.load!()));
    linked = topics.map((t) => linkTopic(t, matcher));
  });

  /** Every link of a topic page, grouped as the page groups them: one list per section. */
  const groups = (l: LinkedTopic): Segment[][] => [
    [...l.definition, ...l.why],
    ...l.sections.map((s) => s.flatMap((b) => (b.kind === 'list' ? b.items.flat() : b.kind === 'other' ? [] : b.segments))),
    l.misconceptions.flatMap((m) => [...m.myth, ...m.truth]),
  ];
  const termsIn = (segments: Segment[]) => segments.flatMap((s) => (typeof s === 'string' ? [] : [s.term]));

  it('links every term to an existing key term of a ready topic', () => {
    for (const t of terms) {
      const route = parseRoute(href.term(t.category, t.topic, t.slug));
      expect(route, t.term).toEqual({ page: 'topic', category: t.category, id: t.topic, term: t.slug });
      expect(findTopic(t.topic)?.status, t.term).toBe('ready');
      const topic = topics.find((x) => x.id === t.topic)!;
      expect(topic.terms.some((k) => slugOf(k.term) === t.slug), t.term).toBe(true);
    }
  });

  it('gives every key term a slug that is unique in its topic', () => {
    for (const t of topics) {
      const slugs = t.terms.map((k) => slugOf(k.term));
      expect(new Set(slugs).size, t.id).toBe(slugs.length);
    }
  });

  it('names only existing terms and topics in the exclusion lists', () => {
    const all = topics.flatMap((t) => t.terms.map((k) => k.term));
    for (const term of [...Object.keys(EXCLUDED), ...Object.keys(EXCLUDED_IN)]) expect(all, term).toContain(term);
    const pages = new Set([...readyTopics().map((t) => t.id), ...protocolExchanges.map((e) => exchangePage(e, false)), ...lessonExchanges.map((e) => exchangePage(e, true)), 'protocols/*', 'learn/*']);
    for (const ids of Object.values(EXCLUDED_IN)) for (const id of ids) expect(pages, id).toContain(id);
  });

  it('leaves excluded terms and shared abbreviations out of the index', () => {
    for (const t of terms) expect(EXCLUDED[t.term], t.term).toBeUndefined();
    for (const t of terms) for (const f of t.forms) expect(EXCLUDED_FORMS[f], t.term).toBeUndefined();
    const abbreviations = topics.flatMap((t) => t.terms.flatMap((k) => termForms(k.term).slice(1)));
    for (const f of Object.keys(EXCLUDED_FORMS)) expect(abbreviations, f).toContain(f);
    const forms = terms.flatMap((t) => t.forms.map((f) => f.toLowerCase()));
    expect(new Set(forms).size).toBe(forms.length);
  });

  it('never links a term inside its own topic, and each term at most once per section', () => {
    topics.forEach((topic, i) => {
      for (const g of groups(linked[i])) {
        const found = termsIn(g);
        for (const t of found) {
          expect(t.topic, `${topic.id}: ${t.term}`).not.toBe(topic.id);
          expect(t.notIn ?? [], `${topic.id}: ${t.term}`).not.toContain(topic.id);
        }
        const keys = found.map((t) => `${t.topic}/${t.slug}`);
        expect(new Set(keys).size, topic.id).toBe(keys.length);
      }
    });
  });

  it('keeps every text unchanged apart from the links', () => {
    topics.forEach((topic, i) => {
      const text = (s: Segment[]) => s.map((x) => (typeof x === 'string' ? x : x.text)).join('');
      expect(text(linked[i].definition)).toBe(topic.definition);
      topic.sections.forEach((s, si) =>
        s.blocks.forEach((b, bi) => {
          const l = linked[i].sections[si][bi];
          if (b.kind === 'text' || b.kind === 'note') expect(l.kind !== 'list' && l.kind !== 'other' && text(l.segments)).toBe(b.text);
          if (b.kind === 'list') expect(l.kind === 'list' && l.items.map(text)).toEqual(b.items);
        }),
      );
    });
  });

  it('links a reasonable share of the topics', () => {
    const count = linked.reduce((n, l) => n + groups(l).reduce((m, g) => m + termsIn(g).length, 0), 0);
    expect(count).toBeGreaterThan(300);
  });
});

describe('term links on protocol and lesson exchanges', () => {
  let matcher: Matcher;
  beforeAll(async () => {
    matcher = compileMatcher(expandTermIndex(await buildTermIndex()));
  });
  const all = () => [...protocolExchanges.map((e) => ({ e, page: exchangePage(e, false) })), ...lessonExchanges.map((e) => ({ e, page: exchangePage(e, true) }))];
  const text = (paragraphs: Segment[][]) => paragraphs.map((p) => p.map((x) => (typeof x === 'string' ? x : x.text)).join('')).join('\n\n');
  const termsIn = (paragraphs: Segment[][]) => paragraphs.flat().flatMap((s) => (typeof s === 'string' ? [] : [s.term]));

  it('keeps every text unchanged apart from the links', () => {
    for (const { e, page } of all()) {
      const about = linkAbout(e, matcher, page);
      expect(text([about.scenario]), e.id).toBe(e.scenario);
      expect(text(about.intro).replace(/\n\s*\n/g, '\n\n'), e.id).toBe(e.intro.replace(/\n\s*\n/g, '\n\n'));
      for (const s of e.steps) {
        const l = linkStepDetails(s.details, matcher, page);
        for (const k of ['what', 'why', 'typical', 'wrong', 'insight'] as const) {
          const original = s.details[k];
          if (original) expect(text(l[k]!).replace(/\n\s*\n/g, '\n\n'), `${page} ${s.id} ${k}`).toBe(original.replace(/\n\s*\n/g, '\n\n'));
        }
      }
    }
  });

  it('links each term at most once per step, and never where it is excluded', () => {
    let count = 0;
    for (const { e, page } of all()) {
      for (const s of e.steps) {
        const l = linkStepDetails(s.details, matcher, page);
        const found = [l.what, l.why, l.typical ?? [], l.wrong ?? [], l.insight ?? []].flatMap(termsIn);
        count += found.length;
        for (const t of found) expect(excludedOn(t.notIn, page), `${page} ${s.id}: ${t.term}`).toBe(false);
        const keys = found.map((t) => `${t.topic}/${t.slug}`);
        expect(new Set(keys).size, `${page} ${s.id}`).toBe(keys.length);
      }
    }
    expect(count).toBeGreaterThan(200);
  });
});
