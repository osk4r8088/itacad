import { useSyncExternalStore } from 'react';
import type { EntryRef } from './refs';

/**
 * Progress of the reader, kept only in this browser (localStorage): which topics, protocols and
 * lessons were opened, and the last and best score of each quiz. Nothing is sent anywhere.
 * The site works the same without it; when storage is unavailable, progress lasts until the page is closed.
 */

export interface QuizResult {
  score: number;
  total: number;
  /** Time of the attempt, milliseconds since 1970. */
  at: number;
}

export interface Progress {
  version: 1;
  /** Key of the page (see progressKey) to the time it was last opened. */
  visited: Record<string, number>;
  /** Key of the page the quiz belongs to: a topic, a protocol or a lesson. */
  quizzes: Record<string, { last: QuizResult; best: QuizResult }>;
}

export const STORAGE_KEY = 'itacad.progress';

export const emptyProgress = (): Progress => ({ version: 1, visited: {}, quizzes: {} });

/** The key of a page in the progress: "topic:cpu", "protocol:tcp", "entry:syn-flood". */
export const progressKey = (ref: EntryRef): string => ('topic' in ref ? `topic:${ref.topic}` : 'protocol' in ref ? `protocol:${ref.protocol}` : `entry:${ref.entry}`);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

function quizResult(v: unknown): QuizResult | undefined {
  if (!isRecord(v) || !isCount(v.score) || !isCount(v.total) || v.total === 0 || v.score > v.total || !isTime(v.at)) return undefined;
  return { score: v.score, total: v.total, at: v.at };
}

/**
 * Reads stored progress. Anything that does not have the expected shape is dropped entry by entry,
 * so a damaged or foreign value never breaks a page; unreadable text gives empty progress.
 */
export function parseProgress(raw: string | null): Progress {
  const p = emptyProgress();
  if (!raw) return p;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return p;
  }
  if (!isRecord(data) || data.version !== 1) return p;
  if (isRecord(data.visited)) for (const [k, v] of Object.entries(data.visited)) if (isTime(v)) p.visited[k] = v;
  if (isRecord(data.quizzes))
    for (const [k, v] of Object.entries(data.quizzes)) {
      if (!isRecord(v)) continue;
      const last = quizResult(v.last);
      const best = quizResult(v.best);
      if (last && best) p.quizzes[k] = { last, best };
    }
  return p;
}

export const withVisit = (p: Progress, key: string, at: number): Progress => ({ ...p, visited: { ...p.visited, [key]: at } });

/** Records a finished quiz. The best result is the higher share of right answers; a tie keeps the earlier one. */
export function withQuiz(p: Progress, key: string, result: QuizResult): Progress {
  const old = p.quizzes[key]?.best;
  const better = !old || result.score / result.total > old.score / old.total;
  return { ...p, quizzes: { ...p.quizzes, [key]: { last: result, best: better ? result : old } } };
}

/** The part of the Web Storage interface the store uses, so tests can pass their own. */
export type ProgressStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface ProgressStore {
  get(): Progress;
  /** Whether progress is kept beyond this page view; false when the browser refuses storage. */
  persistent(): boolean;
  visit(ref: EntryRef): void;
  quiz(ref: EntryRef, score: number, total: number): void;
  reset(): void;
  subscribe(listener: () => void): () => void;
  /** Reads the stored value again, after another tab changed it. */
  reload(): void;
}

export function createProgressStore(storage: ProgressStorage | null, now: () => number = Date.now): ProgressStore {
  let persistent = storage !== null;
  const read = () => {
    if (!storage) return emptyProgress();
    try {
      return parseProgress(storage.getItem(STORAGE_KEY));
    } catch {
      persistent = false;
      return emptyProgress();
    }
  };
  let state = read();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  const save = (next: Progress) => {
    state = next;
    if (storage && persistent) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Full or forbidden: keep the progress in memory for this page view.
        persistent = false;
      }
    }
    notify();
  };
  return {
    get: () => state,
    persistent: () => persistent,
    visit: (ref) => save(withVisit(state, progressKey(ref), now())),
    quiz: (ref, score, total) => save(withQuiz(state, progressKey(ref), { score, total, at: now() })),
    reset: () => {
      state = emptyProgress();
      if (storage) {
        try {
          storage.removeItem(STORAGE_KEY);
        } catch {
          persistent = false;
        }
      }
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reload: () => {
      state = read();
      notify();
    },
  };
}

/** localStorage, or null where the browser refuses it (access alone can throw, for example with cookies blocked). */
function browserStorage(): ProgressStorage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const probe = `${STORAGE_KEY}.probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The progress of this browser, shared by every page. */
export const progress = createProgressStore(browserStorage());

if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY || e.key === null) progress.reload();
  });

/** The current progress; components re-render when it changes, also from another tab. */
export const useProgress = (): Progress => useSyncExternalStore(progress.subscribe, progress.get, progress.get);

/** "17 Nov 2026", the same on every system. */
export const formatDay = (at: number): string =>
  new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** "last 3 of 5 on 17 Nov 2026, best 5 of 5" */
export function describeQuiz(entry: { last: QuizResult; best: QuizResult }): string {
  const { last, best } = entry;
  const base = `last ${last.score} of ${last.total} on ${formatDay(last.at)}`;
  return best === last || (best.score === last.score && best.total === last.total) ? base : `${base}, best ${best.score} of ${best.total}`;
}
