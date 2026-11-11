import { describe, expect, it } from 'vitest';
import { CATEGORIES, TOPICS, readyTopics } from './catalog';
import { FIGURES } from './figures';
import { resolveRef } from './links';
import { LATENCIES, humanDuration, techDuration } from './figures/latency-data';
import { sourceUrl } from '../shared/lib/sources';
import type { Topic } from './schema';

const loaded: Topic[] = await Promise.all(readyTopics().map((t) => t.load!()));

/** Every string in a topic, for style checks. */
const strings = (value: unknown): string[] =>
  typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(strings) : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];

describe('Basics & Concepts catalog', () => {
  it('has unique ids and known categories', () => {
    expect(new Set(CATEGORIES.map((c) => c.id)).size).toBe(CATEGORIES.length);
    expect(new Set(TOPICS.map((t) => t.id)).size).toBe(TOPICS.length);
    for (const t of TOPICS) expect(CATEGORIES.some((c) => c.id === t.category), t.id).toBe(true);
  });

  it('does not use the reserved route name of the glossary', () => {
    for (const c of CATEGORIES) expect(c.id).not.toBe('glossary');
  });

  it('gives ready topics a loader and planned ones none', () => {
    for (const t of TOPICS) expect(Boolean(t.load), t.id).toBe(t.status === 'ready');
  });

  it('refers only to registered figures', () => {
    for (const c of CATEGORIES) if (c.figure) expect(FIGURES[c.figure.id], c.id).toBeDefined();
    for (const t of loaded) for (const s of t.sections) for (const b of s.blocks) if (b.kind === 'figure') expect(FIGURES[b.figure], `${t.id}: ${b.figure}`).toBeDefined();
  });
});

describe.each(loaded.map((t) => [t.id, t] as const))('topic %s', (id, t) => {
  const entry = TOPICS.find((e) => e.id === id)!;

  it('matches its catalog entry', () => {
    expect(t.id).toBe(entry.id);
    expect(t.category).toBe(entry.category);
    expect(t.title).toBe(entry.title);
    expect(t.level).toBe(entry.level);
  });

  it('has every part of the template', () => {
    expect(t.definition.length).toBeGreaterThan(40);
    expect(t.why.length).toBeGreaterThan(40);
    expect(t.sections.length).toBeGreaterThanOrEqual(2);
    for (const s of t.sections) expect(s.blocks.length, s.heading).toBeGreaterThan(0);
    expect(t.misconceptions.length).toBeGreaterThanOrEqual(2);
    expect(t.practice.commands.length).toBeGreaterThanOrEqual(2);
    expect(t.terms.length).toBeGreaterThanOrEqual(3);
    expect(t.related.length).toBeGreaterThanOrEqual(1);
    expect(t.sources.length).toBeGreaterThanOrEqual(1);
    expect(t.quiz.length).toBeGreaterThanOrEqual(3);
  });

  it('has tables with rows as wide as the header', () => {
    for (const s of t.sections)
      for (const b of s.blocks) if (b.kind === 'table') for (const row of b.rows) expect(row.length, `${s.heading}: ${row[0]}`).toBe(b.columns.length);
  });

  it('has quiz questions with a valid answer and unique ids', () => {
    expect(new Set(t.quiz.map((q) => q.id)).size).toBe(t.quiz.length);
    for (const q of t.quiz) {
      expect(q.options.length, q.id).toBeGreaterThanOrEqual(3);
      expect(q.answer, q.id).toBeGreaterThanOrEqual(0);
      expect(q.answer, q.id).toBeLessThan(q.options.length);
      expect(new Set(q.options).size, q.id).toBe(q.options.length);
    }
  });

  it('links only to content that exists', () => {
    for (const ref of t.related) expect(resolveRef(ref), JSON.stringify(ref)).toBeDefined();
  });

  it('follows the source rules', () => {
    for (const s of t.sources) expect(sourceUrl(s) ?? '', JSON.stringify(s)).not.toMatch(/wikipedia\.org/);
  });

  it('uses no em dashes', () => {
    for (const text of strings(t)) expect(text).not.toContain('—');
  });
});

describe('glossary', () => {
  it('defines every term once across all topics', () => {
    const terms = loaded.flatMap((t) => t.terms.map((term) => term.term.toLowerCase()));
    const twice = terms.filter((term, i) => terms.indexOf(term) !== i);
    expect(twice).toEqual([]);
  });
});

describe('latency scale', () => {
  it('runs from fastest to slowest', () => {
    for (let i = 1; i < LATENCIES.length; i++) expect(LATENCIES[i].seconds, LATENCIES[i].id).toBeGreaterThan(LATENCIES[i - 1].seconds);
  });

  it('formats durations', () => {
    expect(techDuration(90e-9)).toBe('90 ns');
    expect(techDuration(8e-3)).toBe('8 ms');
    expect(techDuration(0.33e-9)).toBe('0.33 ns');
    expect(humanDuration(90)).toBe('1.5 minutes');
    expect(humanDuration(1)).toBe('1 second');
    expect(humanDuration(8e6)).toBe('3.1 months');
  });
});
