import { useState } from 'react';
import { HUMAN_SCALE, LATENCIES, humanDuration, techDuration } from './latency-data';

const logs = LATENCIES.map((l) => Math.log10(l.seconds));
const MIN = Math.min(...logs);
const MAX = Math.max(...logs);
/** Bar length on a logarithmic scale, so that nanoseconds and milliseconds both stay visible. */
const width = (seconds: number) => 4 + ((Math.log10(seconds) - MIN) / (MAX - MIN)) * 96;

/** The memory hierarchy as a latency scale, in real time or stretched to human time. */
export default function LatencyScale() {
  const [human, setHuman] = useState(false);
  return (
    <div className="latency">
      <div className="latency-toggle" role="group" aria-label="Time scale">
        <button type="button" className="chip" aria-pressed={!human} onClick={() => setHuman(false)}>
          Real time
        </button>
        <button type="button" className="chip" aria-pressed={human} onClick={() => setHuman(true)}>
          Human time: 1 ns becomes 1 s
        </button>
      </div>
      <div className="table-scroll">
        <table className="latency-table">
          <thead>
            <tr>
              <th scope="col">Access</th>
              <th scope="col">{human ? 'Human time' : 'Typical time'}</th>
              <th scope="col" className="latency-bar-col">
                <span className="visually-hidden">Bar, logarithmic scale</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {LATENCIES.map((l) => (
              <tr key={l.id}>
                <th scope="row">
                  {l.name}
                  <span className="latency-note">
                    {l.note}
                    {l.size && `; ${l.size}`}
                  </span>
                </th>
                <td className="latency-value">{human ? humanDuration(l.seconds * HUMAN_SCALE) : techDuration(l.seconds)}</td>
                <td className="latency-bar-col" aria-hidden="true">
                  <span className="latency-bar" style={{ width: `${width(l.seconds)}%` }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted latency-scale-note">Bars use a logarithmic scale: each step to the right is ten times longer.</p>
    </div>
  );
}
