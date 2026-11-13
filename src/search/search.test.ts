import { beforeAll, describe, expect, it } from 'vitest';
import { buildIndex } from './build';
import { marks, prepare, search, snippet, type SearchIndex } from './search';
import type { SearchDoc } from './schema';
import { href, parseRoute } from '../app/router';
import { CATALOG } from '../protocols/catalog';
import { exchanges as protocolExchanges } from '../protocols/exchanges';
import { LESSONS } from '../learn/registry';
import { lessonExchanges } from '../learn/exchanges';
import { TOOLS, entryHref } from '../tools/registry';
import { PORTS } from '../tools/ports/data';
import { readyTopics, findTopic } from '../basics/catalog';
import { hasQuiz } from '../quizzes/catalog';

let docs: SearchDoc[];
let index: SearchIndex;
beforeAll(async () => {
  docs = await buildIndex();
  index = prepare(docs);
});

const first = (query: string) => search(index, query)[0]?.hits[0]?.doc;
const all = (query: string) => search(index, query, 50).flatMap((g) => g.hits.map((h) => h.doc));

describe('the index', () => {
  it('has every protocol, ready tool, lesson and topic', () => {
    const has = (kind: string, link: string) => docs.some((d) => d.kind === kind && d.href === link);
    for (const p of CATALOG) expect(has('protocol', href.exchange(p.id)), p.id).toBe(true);
    for (const t of TOOLS.filter((t) => t.status === 'ready')) expect(has(t.purpose === 'understand' ? 'explore' : 'tool', entryHref(t.id)), t.id).toBe(true);
    for (const l of LESSONS.filter((l) => l.status === 'ready')) expect(has('lesson', l.exchange ? href.lesson(l.id, 1) : href.lesson(l.id)), l.id).toBe(true);
    for (const t of readyTopics()) expect(has('basics', href.topic(t.category, t.id)), t.id).toBe(true);
  });

  it('has every step, port and glossary term', async () => {
    const steps = [...protocolExchanges, ...lessonExchanges].reduce((n, e) => n + e.steps.length, 0);
    expect(docs.filter((d) => d.kind === 'step')).toHaveLength(steps);
    expect(docs.filter((d) => d.kind === 'port')).toHaveLength(PORTS.length);
    const terms = (await Promise.all(readyTopics().map((t) => t.load!()))).reduce((n, t) => n + t.terms.length, 0);
    expect(docs.filter((d) => d.kind === 'term')).toHaveLength(terms);
  });

  it('links only to places that exist', () => {
    for (const d of docs) {
      const route = parseRoute(d.href);
      const where = `${d.kind} "${d.title}" -> ${d.href}`;
      switch (route.page) {
        case 'exchange':
        case 'lesson': {
          const ex = route.page === 'exchange' ? protocolExchanges.find((e) => e.id === route.id) : lessonExchanges.find((e) => e.id === route.id);
          if (!ex) {
            // A lesson that is a page of its own, not an exchange.
            expect(route.page === 'lesson' && (route.id === 'quizzes' || LESSONS.some((l) => l.id === route.id && l.component)), where).toBe(true);
            break;
          }
          const step = ex.steps[route.step - 1];
          expect(step, where).toBeDefined();
          if (route.select) {
            const layer = step.captures[0].layers.find((l) => l.def.id === route.select!.layer);
            expect(layer, where).toBeDefined();
            if (route.select.field) expect(Object.keys(layer!.values), where).toContain(route.select.field);
          }
          break;
        }
        case 'tool':
        case 'explorer':
          expect(TOOLS.some((t) => t.id === route.id && t.status === 'ready'), where).toBe(true);
          break;
        case 'quiz':
          expect(hasQuiz(route.id), where).toBe(true);
          break;
        case 'topic':
          expect(findTopic(route.id)?.status, where).toBe('ready');
          break;
        case 'category':
        case 'glossary':
          break;
        default:
          throw new Error(`unexpected link: ${where}`);
      }
    }
  });

  it('has no empty titles and stays small enough to load on demand', () => {
    for (const d of docs) expect(d.title.trim().length, d.href).toBeGreaterThan(0);
    expect(JSON.stringify(docs).length).toBeLessThan(900_000);
  });
});

describe('known queries', () => {
  it.each([
    ['tcp', 'protocol', '#/protocols/tcp/1'],
    ['TCP', 'protocol', '#/protocols/tcp/1'],
    ['dns', 'protocol', '#/protocols/dns/1'],
    ['subnet', 'tool', '#/tools/subnet'],
    ['header decoder', 'tool', '#/tools/decoder'],
    ['raid', 'explore', '#/explore/raid'],
    ['syn flood', 'lesson', '#/learn/syn-flood/1'],
    ['port 443', 'port', '#/explore/ports'],
    ['window', 'field', '#/protocols/tcp/1/tcp/window'],
    ['MSS', 'field', '#/protocols/tcp/1/tcp/options'],
    ['nvme', 'term', '#/basics/hardware/storage'],
    ['cpu', 'basics', '#/basics/hardware/cpu'],
    ['glossary', 'basics', '#/basics/glossary'],
    ['vlan', 'protocol', '#/protocols/vlan/1'],
  ])('"%s" finds a %s first', (query, kind, link) => {
    expect(first(query)).toMatchObject({ kind, href: link });
  });

  it('finds words that only occur in step texts', () => {
    const hits = all('solicited-node');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((d) => d.href.startsWith('#/protocols/ipv6/'))).toBe(true);
  });

  it('finds a step by its label within a protocol', () => {
    expect(all('dhcp offer').find((d) => d.kind === 'step')).toMatchObject({ title: 'DHCPOFFER', href: '#/protocols/dhcp/2' });
  });

  it('shows a header where it stands alone, not where another message quotes it', () => {
    const ttl = all('time to live').find((d) => d.kind === 'field' && d.context === 'IPv4 header');
    expect(ttl?.href).toMatch(/^#\/protocols\/[a-z0-9]+\/\d+\/ipv4\/ttl$/);
  });

  it('needs every word of the query', () => {
    expect(all('tcp zzzz')).toEqual([]);
    expect(search(index, '   ')).toEqual([]);
  });

  it('ranks an exact title before titles that only contain the word, and those before texts', () => {
    const hits = search(index, 'checksum', 50).find((g) => g.kind === 'field')!.hits;
    const exact = hits.findIndex((h) => h.doc.title !== 'Checksum');
    expect(exact).toBeGreaterThan(0);
    expect(hits.slice(0, exact).every((h) => h.doc.title === 'Checksum')).toBe(true);
    const groups = search(index, 'tcp');
    expect(groups[0].kind).toBe('protocol');
    expect(groups.at(-1)!.kind).toBe('step');
  });

  it('limits a group and says how many matched', () => {
    const steps = search(index, 'tcp', 4).find((g) => g.kind === 'step')!;
    expect(steps.hits).toHaveLength(4);
    expect(steps.total).toBeGreaterThan(4);
  });
});

describe('result text', () => {
  const text = 'The client sends a segment with the SYN flag and its initial sequence number, chosen at random so that old segments of earlier connections are not mistaken for new ones. The server answers.';
  it('cuts a piece around the match at word boundaries', () => {
    const s = snippet(text, 'earlier', 60);
    expect(s).toContain('earlier');
    expect(s.startsWith('... ')).toBe(true);
    expect(s.length).toBeLessThan(80);
    expect(snippet('short text', 'x')).toBe('short text');
  });
  it('marks the matching parts without changing the text', () => {
    const m = marks('Window Scale', 'win sca');
    expect(m).toEqual([
      { text: 'Win', hit: true },
      { text: 'dow ', hit: false },
      { text: 'Sca', hit: true },
      { text: 'le', hit: false },
    ]);
    expect(marks(text, 'syn').map((p) => p.text).join('')).toBe(text);
  });
});
