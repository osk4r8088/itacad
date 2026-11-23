/**
 * Two sessions sell the last items of a stock at the same time, for the figure on transactions.
 * The rules follow the PostgreSQL documentation, chapter "Transaction Isolation" (13.2):
 *
 * - Read committed: a plain SELECT sees what was committed when the statement started. UPDATE and
 *   SELECT ... FOR UPDATE wait for a concurrent updater of the row; after it commits, they work on
 *   the updated version of the row.
 * - Repeatable read: all statements see the snapshot taken at the first statement of the transaction.
 *   If an UPDATE or SELECT ... FOR UPDATE finds that a concurrent transaction committed a change to
 *   the row after that snapshot, it fails with "could not serialize access due to concurrent update",
 *   and the application has to retry the whole transaction.
 */

export type Level = 'read committed' | 'repeatable read';
export type SessionId = 1 | 2;

export type Op =
  | { op: 'begin'; level: Level }
  | { op: 'select'; forUpdate: boolean }
  /** UPDATE ... SET stock = <value the application computed from its last read, minus one>. */
  | { op: 'set-from-read' }
  /** UPDATE ... SET stock = stock - 1, computed by the database. */
  | { op: 'decrement' }
  | { op: 'commit' };

export interface Event {
  session: SessionId;
  sql: string;
  /** What happened, in a few words. */
  result: string;
  kind: 'ok' | 'wait' | 'resume' | 'error';
  /** Committed stock after this event. */
  committed: number;
}

interface Session {
  level: Level;
  active: boolean;
  aborted: boolean;
  /** Version of the committed row this transaction's snapshot shows (repeatable read). */
  snapshot?: { version: number; value: number };
  /** Value the application last read. */
  read?: number;
  /** Value this transaction wrote and has not committed yet. */
  pending?: number;
}

export interface Scenario {
  id: string;
  title: string;
  /** The SQL the application runs in each session. */
  summary: string;
  /** Order in which the two sessions try to run their statements. */
  schedule: [SessionId, Op][];
}

const sqlOf = (o: Op): string => {
  switch (o.op) {
    case 'begin':
      return o.level === 'read committed' ? 'BEGIN;' : 'BEGIN ISOLATION LEVEL REPEATABLE READ;';
    case 'select':
      return `SELECT stock FROM items WHERE id = 7${o.forUpdate ? ' FOR UPDATE' : ''};`;
    case 'set-from-read':
      return 'UPDATE items SET stock = <read - 1> WHERE id = 7;';
    case 'decrement':
      return 'UPDATE items SET stock = stock - 1 WHERE id = 7;';
    case 'commit':
      return 'COMMIT;';
  }
};

export const START = 5;

/** Runs a scenario. A statement that has to wait for the other session's row lock is resumed when that lock is released. */
export function run(schedule: [SessionId, Op][]): { events: Event[]; final: number } {
  let committed = START;
  let version = 0;
  let lockHolder: SessionId | undefined;
  const s: Record<SessionId, Session> = { 1: { level: 'read committed', active: false, aborted: false }, 2: { level: 'read committed', active: false, aborted: false } };
  const events: Event[] = [];
  const waiting: [SessionId, Op][] = [];
  const queue = [...schedule];
  const other = (id: SessionId): SessionId => (id === 1 ? 2 : 1);

  const snapshot = (id: SessionId) => {
    const x = s[id];
    if (x.level === 'repeatable read' && !x.snapshot) x.snapshot = { version, value: committed };
  };
  /** What a plain read in this session sees right now. */
  const visible = (id: SessionId) => {
    const x = s[id];
    if (x.pending !== undefined) return x.pending;
    if (x.level === 'repeatable read') return x.snapshot!.value;
    return committed;
  };
  /** Repeatable read: has someone else committed a change to the row since this snapshot? */
  const conflict = (id: SessionId) => s[id].level === 'repeatable read' && s[id].snapshot!.version !== version;

  const exec = (id: SessionId, o: Op, resumed: boolean): void => {
    const x = s[id];
    const sql = sqlOf(o);
    const push = (result: string, kind: Event['kind']) => events.push({ session: id, sql, result, kind, committed });
    if (x.aborted && o.op !== 'begin') {
      if (o.op === 'commit') x.active = false;
      push(o.op === 'commit' ? 'ends the aborted transaction; nothing of it is saved' : 'not run: the transaction was aborted', 'error');
      return;
    }
    switch (o.op) {
      case 'begin': {
        const retry = x.aborted;
        s[id] = { level: o.level, active: true, aborted: false };
        push(retry ? 'starts again: the application retries the whole sale' : 'starts a transaction', 'ok');
        return;
      }
      case 'select':
      case 'set-from-read':
      case 'decrement': {
        snapshot(id);
        const needsLock = o.op !== 'select' || o.forUpdate;
        if (needsLock && lockHolder === other(id)) {
          waiting.push([id, o]);
          push(`waits: session ${other(id)} has changed or locked the row and not committed yet`, 'wait');
          return;
        }
        if (needsLock && conflict(id)) {
          x.aborted = true;
          if (lockHolder === id) lockHolder = undefined;
          x.pending = undefined;
          push('ERROR: could not serialize access due to concurrent update', 'error');
          return;
        }
        if (o.op === 'select') {
          if (o.forUpdate) lockHolder = id;
          x.read = visible(id);
          push(`${resumed ? 'continues and ' : ''}reads ${x.read}${o.forUpdate ? ' and locks the row' : ''}`, resumed ? 'resume' : 'ok');
          return;
        }
        lockHolder = id;
        const base = o.op === 'decrement' ? (x.pending ?? (x.level === 'read committed' ? committed : x.snapshot!.value)) : x.read!;
        x.pending = base - 1;
        push(`${resumed ? 'continues and ' : ''}writes ${x.pending} (not yet visible to the other session)`, resumed ? 'resume' : 'ok');
        return;
      }
      case 'commit': {
        if (x.pending !== undefined) {
          committed = x.pending;
          version += 1;
        }
        x.active = false;
        x.pending = undefined;
        if (lockHolder === id) lockHolder = undefined;
        push(`commits; the stock is now ${committed}`, 'ok');
        // A statement of the other session that waited for this row can go on.
        const w = waiting.findIndex(([sid]) => sid === other(id));
        if (w >= 0) {
          const [sid, op] = waiting.splice(w, 1)[0];
          exec(sid, op, true);
        }
        return;
      }
    }
  };

  while (queue.length) {
    const [id, o] = queue.shift()!;
    // A session that is waiting cannot send its next statement yet; it goes after the one it waits for.
    if (waiting.some(([sid]) => sid === id)) {
      const blockedUntil = queue.findIndex(([sid]) => sid !== id);
      if (blockedUntil >= 0) {
        queue.splice(blockedUntil + 1, 0, [id, o]);
        continue;
      }
    }
    exec(id, o, false);
  }
  return { events, final: committed };
}

const sale = (level: Level, how: 'read-write' | 'for-update' | 'atomic'): Op[] => [
  { op: 'begin', level },
  ...(how === 'atomic' ? [] : [{ op: 'select', forUpdate: how === 'for-update' } as Op]),
  how === 'atomic' ? { op: 'decrement' } : { op: 'set-from-read' },
  { op: 'commit' },
];

/** Interleaves two sales statement by statement: first session 1, then session 2. */
const interleave = (a: Op[], b: Op[]): [SessionId, Op][] => a.flatMap((o, i) => [[1, o] as [SessionId, Op], [2, b[i]] as [SessionId, Op]]);

export const SCENARIOS: Scenario[] = [
  {
    id: 'lost',
    title: 'Read, then write the result',
    summary: 'Each session reads the stock, the application subtracts one, and writes the result back. Read committed.',
    schedule: interleave(sale('read committed', 'read-write'), sale('read committed', 'read-write')),
  },
  {
    id: 'atomic',
    title: 'Atomic update',
    summary: 'Each session lets the database subtract: SET stock = stock - 1. Read committed.',
    schedule: interleave(sale('read committed', 'atomic'), sale('read committed', 'atomic')),
  },
  {
    id: 'for-update',
    title: 'Lock while reading',
    summary: 'Each session reads with SELECT ... FOR UPDATE, then writes the result. Read committed.',
    schedule: interleave(sale('read committed', 'for-update'), sale('read committed', 'for-update')),
  },
  {
    id: 'repeatable',
    title: 'Repeatable read and retry',
    summary: 'Read, then write the result, at repeatable read. The second writer gets an error and the application runs its transaction again.',
    schedule: [...interleave(sale('repeatable read', 'read-write'), sale('repeatable read', 'read-write')), ...sale('repeatable read', 'read-write').map((o) => [2, o] as [SessionId, Op])],
  },
];
