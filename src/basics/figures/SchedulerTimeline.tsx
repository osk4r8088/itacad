import { useMemo, useState, type ReactNode } from 'react';
import { PROCESSES, describeTick, simulate, type State } from './scheduler';

const CORE_CHOICES = [1, 2];
const SLICE_CHOICES = [1, 2, 4];

const STATE_LABEL: Record<State, string> = {
  running: 'Running',
  ready: 'Ready',
  blocked: 'Blocked',
  done: 'Finished',
};

/** Processes taking turns on one or two cores: a timeline of who runs, who waits and who is blocked. */
export default function SchedulerTimeline() {
  const [cores, setCores] = useState(1);
  const [slice, setSlice] = useState(2);
  const run = useMemo(() => simulate(PROCESSES, cores, slice), [cores, slice]);
  const last = run.ticks.length - 1;
  const [tick, setTick] = useState(0);
  const t = Math.min(tick, last);
  const lines = describeTick(run, PROCESSES, t);
  const end = Math.max(...Object.values(run.finished));

  return (
    <div className="sch-figure">
      <div className="sch-controls">
        <div className="vm-choice" role="group" aria-label="Cores">
          <span>Cores</span>
          {CORE_CHOICES.map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={cores === c} onClick={() => setCores(c)}>
              {c}
            </button>
          ))}
        </div>
        <div className="vm-choice" role="group" aria-label="Time slice in ticks">
          <span>Time slice</span>
          {SLICE_CHOICES.map((s) => (
            <button key={s} type="button" className="chip" aria-pressed={slice === s} onClick={() => setSlice(s)}>
              {s} {s === 1 ? 'tick' : 'ticks'}
            </button>
          ))}
        </div>
      </div>

      <ul className="sch-processes">
        {PROCESSES.map((p) => (
          <li key={p.id}>
            <span className={`sch-tag sch-p${p.id}`}>{p.id}</span> {p.name}: {p.kind}
          </li>
        ))}
      </ul>

      <div className="sch-scroll">
        <div className="sch-grid" style={{ gridTemplateColumns: `max-content repeat(${run.ticks.length}, 1.4rem)` }} aria-hidden="true">
          <span className="sch-label sch-axis">Tick</span>
          {run.ticks.map((_, i) => (
            <span key={i} className={`sch-axis${i === t ? ' is-now' : ''}`}>
              {i % 5 === 0 ? i : ''}
            </span>
          ))}
          {Array.from({ length: cores }, (_, c) => (
            <Row key={`core${c}`} label={`Core ${c + 1}`}>
              {run.ticks.map((tk, i) => {
                const id = tk.cores[c];
                return (
                  <span key={i} className={`sch-cell sch-core${id ? ` sch-p${id}` : ' is-idle'}${i === t ? ' is-now' : ''}`} onClick={() => setTick(i)}>
                    {id ?? ''}
                  </span>
                );
              })}
            </Row>
          ))}
          {PROCESSES.map((p) => (
            <Row key={p.id} label={`${p.id} ${p.name}`}>
              {run.ticks.map((tk, i) => {
                const s = tk.states[p.id];
                return (
                  <span key={i} className={`sch-cell sch-${s}${s === 'running' ? ` sch-p${p.id}` : ''}${i === t ? ' is-now' : ''}`} onClick={() => setTick(i)}>
                    {s === 'running' ? p.id : ''}
                  </span>
                );
              })}
            </Row>
          ))}
        </div>
      </div>

      <div className="sch-legend" aria-hidden="true">
        {(['running', 'ready', 'blocked', 'done'] as State[]).map((s) => (
          <span key={s}>
            <span className={`sch-cell sch-${s}`} /> {STATE_LABEL[s]}{s === 'done' ? ' (empty)' : ''}
          </span>
        ))}
      </div>

      <div className="sch-step">
        <button type="button" className="chip" onClick={() => setTick(Math.max(0, t - 1))} disabled={t === 0} aria-label="Previous tick">
          Back
        </button>
        <label className="sch-slider">
          <span>Tick {t} (last {last})</span>
          <input type="range" min={0} max={last} value={t} onChange={(e) => setTick(Number(e.target.value))} />
        </label>
        <button type="button" className="chip" onClick={() => setTick(Math.min(last, t + 1))} disabled={t === last} aria-label="Next tick">
          Next
        </button>
      </div>

      <ul className="sch-now" aria-live="polite">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>

      <p className="sch-stats">
        All four have finished after {end} ticks. The cores switched between processes {run.switches} times and were busy {Math.round(run.utilization * 100)} % of the time.
      </p>
      <p className="vm-note">
        Simplified for the picture: plain round robin with one queue and a fixed time slice, and a tick has no fixed length. Real schedulers also weigh priorities and how much processor time each process has had; Linux, for example, began moving to the EEVDF scheduler in version 6.6. Try a slice of 1 against 4, and one core against two.
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="sch-label">{label}</span>
      {children}
    </>
  );
}
