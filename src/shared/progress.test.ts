import { describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY, createProgressStore, describeQuiz, emptyProgress, parseProgress, progressKey, withQuiz, withVisit, type ProgressStorage } from './progress';

/** A storage in memory, like localStorage. */
function memoryStorage(initial: Record<string, string> = {}): ProgressStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

const noon = Date.UTC(2026, 10, 17, 12);

describe('progressKey', () => {
  it('names topics, protocols and other entries apart', () => {
    expect(progressKey({ topic: 'cpu' })).toBe('topic:cpu');
    expect(progressKey({ protocol: 'tcp', step: 3 })).toBe('protocol:tcp');
    expect(progressKey({ entry: 'syn-flood' })).toBe('entry:syn-flood');
  });
});

describe('parseProgress', () => {
  it('gives empty progress for nothing, broken text and other versions', () => {
    for (const raw of [null, '', 'not json', '[]', '42', '{"version":2,"visited":{"topic:cpu":1}}', '{"visited":{"topic:cpu":1}}']) expect(parseProgress(raw), String(raw)).toEqual(emptyProgress());
  });
  it('keeps valid entries and drops damaged ones one by one', () => {
    const raw = JSON.stringify({
      version: 1,
      visited: { 'topic:cpu': noon, 'topic:bad': 'yesterday', 'topic:neg': -5 },
      quizzes: {
        'protocol:tcp': { last: { score: 3, total: 5, at: noon }, best: { score: 5, total: 5, at: noon } },
        'protocol:dns': { last: { score: 6, total: 5, at: noon }, best: { score: 5, total: 5, at: noon } },
        'protocol:udp': { last: { score: 1, total: 0, at: noon }, best: { score: 1, total: 0, at: noon } },
        'protocol:arp': 'full marks',
      },
    });
    const p = parseProgress(raw);
    expect(p.visited).toEqual({ 'topic:cpu': noon });
    expect(Object.keys(p.quizzes)).toEqual(['protocol:tcp']);
  });
});

describe('withVisit and withQuiz', () => {
  it('records a visit without changing the old object', () => {
    const p = emptyProgress();
    const q = withVisit(p, 'topic:cpu', noon);
    expect(q.visited['topic:cpu']).toBe(noon);
    expect(p.visited).toEqual({});
  });
  it('keeps the best share of right answers; a tie keeps the earlier result', () => {
    let p = withQuiz(emptyProgress(), 'q', { score: 3, total: 5, at: 1 });
    expect(p.quizzes.q).toEqual({ last: { score: 3, total: 5, at: 1 }, best: { score: 3, total: 5, at: 1 } });
    p = withQuiz(p, 'q', { score: 5, total: 5, at: 2 });
    expect(p.quizzes.q.best.at).toBe(2);
    p = withQuiz(p, 'q', { score: 2, total: 5, at: 3 });
    expect(p.quizzes.q.last.at).toBe(3);
    expect(p.quizzes.q.best.at).toBe(2);
    p = withQuiz(p, 'q', { score: 5, total: 5, at: 4 });
    expect(p.quizzes.q.best.at).toBe(2);
  });
  it('compares shares when a quiz changed its number of questions', () => {
    let p = withQuiz(emptyProgress(), 'q', { score: 4, total: 5, at: 1 });
    p = withQuiz(p, 'q', { score: 4, total: 4, at: 2 });
    expect(p.quizzes.q.best.at).toBe(2);
  });
});

describe('describeQuiz', () => {
  it('names the last result with its day and the best one only when it differs', () => {
    expect(describeQuiz({ last: { score: 3, total: 5, at: noon }, best: { score: 5, total: 5, at: noon - 1 } })).toBe('last 3 of 5 on 17 Nov 2026, best 5 of 5');
    expect(describeQuiz({ last: { score: 5, total: 5, at: noon }, best: { score: 5, total: 5, at: noon - 1 } })).toBe('last 5 of 5 on 17 Nov 2026');
  });
});

describe('createProgressStore', () => {
  it('stores visits and quiz results and reads them back in a new store', () => {
    const storage = memoryStorage();
    const store = createProgressStore(storage, () => noon);
    store.visit({ topic: 'cpu' });
    store.quiz({ protocol: 'tcp' }, 4, 5);
    expect(store.persistent()).toBe(true);
    const again = createProgressStore(storage);
    expect(again.get().visited).toEqual({ 'topic:cpu': noon });
    expect(again.get().quizzes['protocol:tcp'].last).toEqual({ score: 4, total: 5, at: noon });
  });
  it('notifies subscribers and stops after unsubscribing', () => {
    const store = createProgressStore(memoryStorage());
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.visit({ topic: 'cpu' });
    off();
    store.visit({ topic: 'ram' });
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it('deletes everything on reset', () => {
    const storage = memoryStorage();
    const store = createProgressStore(storage);
    store.visit({ topic: 'cpu' });
    store.reset();
    expect(store.get()).toEqual(emptyProgress());
    expect(storage.data[STORAGE_KEY]).toBeUndefined();
  });
  it('keeps working in memory when the browser refuses to store', () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    const store = createProgressStore(storage);
    store.visit({ topic: 'cpu' });
    expect(store.get().visited['topic:cpu']).toBeGreaterThan(0);
    expect(store.persistent()).toBe(false);
  });
  it('keeps working when reading throws or there is no storage at all', () => {
    const broken: ProgressStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {},
      removeItem: () => {},
    };
    for (const storage of [broken, null]) {
      const store = createProgressStore(storage);
      expect(store.get()).toEqual(emptyProgress());
      store.visit({ protocol: 'tcp' });
      expect(Object.keys(store.get().visited)).toEqual(['protocol:tcp']);
      expect(store.persistent()).toBe(false);
    }
  });
  it('reads a damaged stored value as empty and overwrites it on the next visit', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: '{oops' });
    const store = createProgressStore(storage);
    expect(store.get()).toEqual(emptyProgress());
    store.visit({ topic: 'cpu' });
    expect(parseProgress(storage.data[STORAGE_KEY]).visited['topic:cpu']).toBeGreaterThan(0);
  });
  it('picks up changes made by another tab on reload', () => {
    const storage = memoryStorage();
    const a = createProgressStore(storage);
    const b = createProgressStore(storage);
    a.visit({ topic: 'cpu' });
    expect(b.get().visited).toEqual({});
    b.reload();
    expect(Object.keys(b.get().visited)).toEqual(['topic:cpu']);
  });
});
