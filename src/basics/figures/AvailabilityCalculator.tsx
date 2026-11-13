import { useState } from 'react';
import { DAY, MONTH, YEAR, downtime, formatDuration, formatPercent, inParallel, inSeries } from './availability';

/** Downtime that an availability allows, and what chaining or doubling components does to it. */
export default function AvailabilityCalculator() {
  const [percent, setPercent] = useState('99.9');
  const [count, setCount] = useState(3);
  const value = Number(percent.replace(',', '.'));
  const valid = percent.trim() !== '' && Number.isFinite(value) && value >= 0 && value <= 100;
  const a = value / 100;

  return (
    <div className="avail-figure">
      <div className="avail-inputs">
        <label>
          <span>Availability of one component, in percent</span>
          <input type="text" inputMode="decimal" value={percent} maxLength={12} onChange={(e) => setPercent(e.target.value)} aria-invalid={!valid} />
        </label>
        <label>
          <span>Number of components: {count}</span>
          <input type="range" min={1} max={8} value={count} onChange={(e) => setCount(Number(e.target.value))} />
        </label>
      </div>
      {valid ? (
        <div className="avail-results" aria-live="polite">
          <div className="avail-card">
            <h4>One component</h4>
            <p className="avail-value">{formatPercent(a)}</p>
            <Downtime a={a} />
          </div>
          <div className="avail-card">
            <h4>{count} in a chain (all needed)</h4>
            <p className="avail-value">{formatPercent(inSeries(a, count))}</p>
            <Downtime a={inSeries(a, count)} />
          </div>
          <div className="avail-card">
            <h4>{count} as spares (one is enough)</h4>
            <p className="avail-value">{formatPercent(inParallel(a, count))}</p>
            <Downtime a={inParallel(a, count)} />
          </div>
        </div>
      ) : (
        <p className="avail-error" role="alert">
          Enter a number between 0 and 100, for example 99.95.
        </p>
      )}
      <p className="avail-note">The spares only reach this value if they fail independently of each other and the switch between them works. A shared power feed, switch or faulty update makes them one component again.</p>
    </div>
  );
}

function Downtime({ a }: { a: number }) {
  return (
    <dl className="avail-downtime">
      <div>
        <dt>Downtime per year</dt>
        <dd>{formatDuration(downtime(a, YEAR))}</dd>
      </div>
      <div>
        <dt>per 30 days</dt>
        <dd>{formatDuration(downtime(a, MONTH))}</dd>
      </div>
      <div>
        <dt>per day</dt>
        <dd>{formatDuration(downtime(a, DAY))}</dd>
      </div>
    </dl>
  );
}
