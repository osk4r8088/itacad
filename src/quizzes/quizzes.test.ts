import { describe, expect, it } from 'vitest';
import { allQuizzes } from './all';
import { QUIZZES } from './catalog';
import { CATALOG } from '../protocols/catalog';
import { exchanges } from '../protocols/exchanges';

describe('quiz catalog', () => {
  it('lists every quiz once, and each quiz belongs to an exchange', async () => {
    expect(Object.keys(QUIZZES).sort()).toEqual(allQuizzes.map((q) => q.id).sort());
    for (const [id, load] of Object.entries(QUIZZES)) {
      expect((await load()).id).toBe(id);
      expect(CATALOG.some((e) => e.id === id), id).toBe(true);
    }
  });
});

describe.each(allQuizzes.map((q) => [q.id, q] as const))('quiz %s', (_id, quiz) => {
  const exchange = exchanges.find((e) => e.id === quiz.id)!;

  it('has well-formed questions', () => {
    expect(quiz.questions.length).toBeGreaterThanOrEqual(5);
    expect(new Set(quiz.questions.map((q) => q.id)).size).toBe(quiz.questions.length);
    for (const q of quiz.questions) {
      expect(q.options.length, q.id).toBeGreaterThanOrEqual(3);
      expect(q.options.length, q.id).toBeLessThanOrEqual(4);
      expect(new Set(q.options).size, `${q.id} options are distinct`).toBe(q.options.length);
      expect(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, `${q.id} answer`).toBe(true);
      expect(q.explanation.length, q.id).toBeGreaterThan(20);
    }
  });

  it('links every question to a step of its exchange', () => {
    const steps = new Set(exchange.steps.map((s) => s.id));
    for (const q of quiz.questions) expect(steps.has(q.step), `${q.id} -> ${q.step}`).toBe(true);
  });

  it('does not always put the right answer in the same place', () => {
    expect(new Set(quiz.questions.map((q) => q.answer)).size).toBeGreaterThan(1);
  });

  it('follows the text style: no em dashes', () => {
    for (const q of quiz.questions) for (const t of [q.prompt, q.explanation, ...q.options]) expect(t, q.id).not.toContain('—');
  });
});

describe('quiz coverage', () => {
  it('every protocol exchange has a quiz', () => {
    expect(CATALOG.map((e) => e.id).filter((id) => !(id in QUIZZES))).toEqual([]);
  });
});
