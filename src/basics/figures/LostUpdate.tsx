import { useMemo, useState } from 'react';
import { SCENARIOS, START, run } from './lost-update';
import StepButtons from './StepButtons';

/** Two sessions sell from the same stock at the same time; four ways of writing it, step by step. */
export default function LostUpdate() {
  const [id, setId] = useState(SCENARIOS[0].id);
  const scenario = SCENARIOS.find((s) => s.id === id)!;
  const { events, final } = useMemo(() => run(scenario.schedule), [scenario]);
  const [shown, setShown] = useState(1);
  const n = Math.min(shown, events.length);
  const done = n === events.length;
  const pick = (next: string) => {
    setId(next);
    setShown(1);
  };

  return (
    <div className="lu-figure">
      <div className="vm-choice" role="group" aria-label="How the sale is written">
        {SCENARIOS.map((s) => (
          <button key={s.id} type="button" className="chip" aria-pressed={s.id === id} onClick={() => pick(s.id)}>
            {s.title}
          </button>
        ))}
      </div>
      <p className="lu-summary">{scenario.summary} The stock starts at {START}, and both sessions sell one item.</p>

      <div className="lu-scroll">
        <table className="lu-table">
          <thead>
            <tr>
              <th scope="col">Session 1</th>
              <th scope="col">Session 2</th>
              <th scope="col">Stock</th>
            </tr>
          </thead>
          <tbody>
            {events.slice(0, n).map((e, i) => (
              <tr key={i} className={`lu-${e.kind}${i === n - 1 ? ' is-now' : ''}`}>
                {e.session === 1 ? <Cell sql={e.sql} result={e.result} /> : <td />}
                {e.session === 2 ? <Cell sql={e.sql} result={e.result} /> : <td />}
                <td className="mono">{e.committed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <StepButtons value={n} min={1} max={events.length} onChange={setShown}>
        <span className="lu-count">
          Step {n} of {events.length}
        </span>
        <button type="button" className="link-button" onClick={() => setShown(events.length)} disabled={done}>
          Show all
        </button>
      </StepButtons>

      <p className="lu-verdict" aria-live="polite">
        {done ? (
          final === START - 2 ? (
            <>
              <strong>Correct:</strong> two items sold, stock {final}.
            </>
          ) : (
            <>
              <strong>Lost update:</strong> two items sold, but the stock says {final}. Session 2 wrote a value it had computed from a reading that was already out of date, and overwrote the sale of session 1.
            </>
          )
        ) : (
          <>Step through to the end to see the result.</>
        )}
      </p>
      <p className="vm-note">The rules follow PostgreSQL, whose documentation on transaction isolation describes how each level treats a row that another session changed. Other databases differ in details, for example in which level reports the conflict.</p>
    </div>
  );
}

function Cell({ sql, result }: { sql: string; result: string }) {
  return (
    <td>
      <code className="lu-sql">{sql}</code>
      <span className="lu-result">{result}</span>
    </td>
  );
}
