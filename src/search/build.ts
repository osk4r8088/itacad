import type { Exchange, StructDef, StructInstance } from '../shared/schema';
import { CATALOG } from '../protocols/catalog';
import { exchanges as protocolExchanges } from '../protocols/exchanges';
import { LESSONS } from '../learn/registry';
import { lessonExchanges } from '../learn/exchanges';
import { TOOLS, entryHref } from '../tools/registry';
import { PORTS } from '../tools/ports/data';
import { CATEGORIES, readyTopics, topicsOf } from '../basics/catalog';
import type { Block } from '../basics/schema';
import { allQuizzes } from '../quizzes/all';
import { href } from '../app/router';
import type { SearchDoc } from './schema';

// Builds the search index from the same data the pages render. It runs when the site is built
// (see the plugin in vite.config.ts) and in the tests, never in the browser.

const blockText = (b: Block): string => {
  switch (b.kind) {
    case 'text':
    case 'note':
      return b.text;
    case 'list':
      return b.items.join(' ');
    case 'table':
      return [b.caption, b.columns.join(' '), ...b.rows.map((r) => r.join(' '))].join(' ');
    case 'figure':
      return b.caption;
  }
};

/** Markup of the prose texts that should not show up in results. */
const plain = (text: string) => text.replace(/\*\*|`/g, '').replace(/\s+/g, ' ').trim();

interface Place {
  exchange: Exchange;
  /** Link of a step of this exchange, with an optional selection in the packet view. */
  link: (step: number, layer?: string, field?: string) => string;
  lesson: boolean;
}

/** Where a header is shown best: in the exchange about it, as the innermost header, in a step that points at the field. */
function fieldDocs(places: Place[]): SearchDoc[] {
  interface Seen {
    def: StructDef;
    /** The layer and field to select in the packet view; for an option or record, the field that holds it. */
    layer: string;
    holder?: string;
    layerName: string;
    best: Map<string, { score: number; href: string }>;
  }
  const seen = new Map<string, Seen>();
  const note = (def: StructDef, layer: string, layerName: string, holder: string | undefined, base: number, keyFields: Set<string>, link: (field?: string) => string) => {
    let s = seen.get(def.id);
    // A header that also appears inside another one (the IPv4 header quoted by an ICMP error) is shown where it stands alone.
    if (s && !s.holder && holder) return;
    if (!s || (s.holder && !holder)) seen.set(def.id, (s = { def, layer, holder, layerName, best: new Map() }));
    for (const f of ['', ...[...def.fields, ...(def.trailer ?? [])].map((x) => x.id)]) {
      const score = base + (f && keyFields.has(`${layer}.${holder ?? f}`) ? 3 : 0);
      const old = s.best.get(f);
      if (!old || score > old.score) s.best.set(f, { score, href: link(holder ?? (f || undefined)) });
    }
  };
  for (const p of places) {
    p.exchange.steps.forEach((step, i) => {
      const layers = step.captures[0].layers;
      const keyFields = new Set(step.details.keyFields.map((k) => `${k.layer}.${k.field}`));
      layers.forEach((layer, depth) => {
        const id = layer.def.id;
        const base = (p.lesson ? 0 : 2) + (depth === layers.length - 1 ? 1 : 0) + (id === p.exchange.id || id.startsWith(`${p.exchange.id}-`) ? 4 : 0);
        note(layer.def, id, layer.def.name, undefined, base, keyFields, (field) => p.link(i + 1, id, field));
        const items = (holder: string, list: StructInstance[] | undefined) => {
          for (const item of list ?? []) note(item.def, id, layer.def.name, holder, base, keyFields, () => p.link(i + 1, id, holder));
        };
        for (const [fieldId, value] of Object.entries(layer.values)) items(fieldId, value.items);
      });
    });
  }
  const docs: SearchDoc[] = [];
  for (const s of seen.values()) {
    if (s.def.id === 'phy' || s.def.id === 'payload' || s.def.id === 'data') continue;
    docs.push({ kind: 'field', title: s.def.name, context: s.holder ? `in ${s.layerName}` : 'header', text: plain(s.def.about), href: s.best.get('')!.href });
    for (const f of [...s.def.fields, ...(s.def.trailer ?? [])]) {
      // Code, length and value of an option say nothing on their own, and its value often repeats the name of the option.
      if (s.holder && (/^(Kind|Length|Len|Code|Type|Value|Data)$/.test(f.name) || s.def.name.includes(f.name))) continue;
      docs.push({ kind: 'field', title: f.name, context: s.def.name, ...(f.short && f.short !== f.name ? { keywords: f.short } : {}), text: plain(f.about), href: s.best.get(f.id)!.href });
    }
  }
  return docs;
}

export async function buildIndex(): Promise<SearchDoc[]> {
  const docs: SearchDoc[] = [];

  // ---- pages
  for (const c of CATEGORIES) {
    const ready = topicsOf(c.id).some((t) => t.status === 'ready');
    if (ready) docs.push({ kind: 'basics', title: c.title, context: 'category', text: c.about, href: href.category(c.id) });
  }
  docs.push({ kind: 'basics', title: 'Glossary', context: 'all key terms', href: href.glossary });
  const topics = readyTopics();
  const loaded = await Promise.all(topics.map((t) => t.load!()));
  topics.forEach((entry, i) => {
    const topic = loaded[i];
    const link = href.topic(entry.category, entry.id);
    docs.push({ kind: 'basics', title: entry.title, context: 'topic', text: plain(`${entry.summary} ${topic.definition} ${topic.why}`), href: link });
    for (const s of topic.sections) docs.push({ kind: 'basics', title: s.heading, context: entry.title, text: plain(s.blocks.map(blockText).join(' ')), href: link });
    for (const m of topic.misconceptions) docs.push({ kind: 'basics', title: m.myth, context: `${entry.title}, misconception`, text: plain(m.truth), href: link });
    for (const t of topic.terms) docs.push({ kind: 'term', title: t.term, context: entry.title, text: plain(t.definition), href: link });
  });

  for (const p of CATALOG) {
    const ex = protocolExchanges.find((e) => e.id === p.id);
    docs.push({ kind: 'protocol', title: p.title, context: p.group, text: plain(`${p.summary} ${ex?.scenario ?? ''} ${ex?.intro ?? ''}`), href: href.exchange(p.id) });
  }
  for (const t of TOOLS) {
    if (t.status !== 'ready') continue;
    docs.push({ kind: t.purpose === 'understand' ? 'explore' : 'tool', title: t.title, text: t.summary, href: entryHref(t.id) });
  }
  for (const l of LESSONS) {
    if (l.status !== 'ready') continue;
    const ex = lessonExchanges.find((e) => e.id === l.id);
    docs.push({ kind: 'lesson', title: l.title, text: plain(`${l.summary} ${ex?.scenario ?? ''} ${ex?.intro ?? ''}`), href: l.exchange ? href.lesson(l.id, 1) : href.lesson(l.id) });
  }
  docs.push({ kind: 'lesson', title: 'Quizzes', text: 'Multiple-choice questions for every protocol.', href: href.quizzes });

  // ---- steps and header fields
  const places: Place[] = [
    ...protocolExchanges.map((exchange) => ({ exchange, lesson: false, link: (step: number, layer?: string, field?: string) => href.exchange(exchange.id, step, layer ? { layer, field } : undefined) })),
    ...lessonExchanges.map((exchange) => ({ exchange, lesson: true, link: (step: number, layer?: string, field?: string) => href.lesson(exchange.id, step, layer ? { layer, field } : undefined) })),
  ];
  for (const p of places) {
    p.exchange.steps.forEach((step, i) => {
      const d = step.details;
      docs.push({
        kind: 'step',
        title: step.label,
        context: `${p.exchange.title}, step ${i + 1}`,
        keywords: step.info,
        text: plain([d.what, d.why, d.insight, d.typical, d.wrong].filter(Boolean).join(' ')),
        href: p.link(i + 1),
      });
    });
  }
  docs.push(...fieldDocs(places));

  // ---- reference data
  for (const p of PORTS) {
    docs.push({ kind: 'port', title: `Port ${p.port}`, context: `${p.title}, ${p.transports.join(' and ')}`, keywords: `${p.service} ${p.port}/${p.transports.join(` ${p.port}/`).toLowerCase()}`, text: p.about, href: entryHref('ports') });
  }
  for (const quiz of allQuizzes) {
    const title = CATALOG.find((c) => c.id === quiz.id)?.title ?? quiz.id;
    for (const q of quiz.questions) docs.push({ kind: 'question', title: q.prompt, context: `${title} quiz`, href: href.quiz(quiz.id) });
  }
  return docs;
}
