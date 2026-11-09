import { useState } from 'react';
import { SourceLink, SourceList } from '../../shared/components/SourceList';
import { href } from '../../app/router';
import { tcpStepNumbers } from './steps';
import { available, next, SCENARIOS, SOURCES, STATE_INFO, TRANSITIONS, run, type Context, type State, type Transition } from './logic';
import { EDGES, NODE, NODES, VIEW } from './diagram';

const KIND_LABEL = { user: 'Application', segment: 'Segment arrives', timer: 'Timer' } as const;

function Diagram({ state, options, last, visited, onTake }: { state: State; options: Transition[]; last?: Transition; visited: Set<State>; onTake: (t: Transition) => void }) {
  const byId = new Map(TRANSITIONS.map((t) => [t.id, t]));
  const optionIds = new Set(options.map((o) => o.id));
  return (
    <svg className="tcp-diagram" viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} role="img" aria-label={`TCP state diagram. Current state: ${state}.`}>
      <defs>
        {['plain', 'option', 'last'].map((k) => (
          <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className={`arrowhead ${k}`} />
          </marker>
        ))}
      </defs>
      {EDGES.map((e) => {
        const t = byId.get(e.id)!;
        const kind = last?.id === e.id ? 'last' : optionIds.has(e.id) ? 'option' : 'plain';
        const d = e.points.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
        return (
          <g key={e.id} className={`edge ${kind}${t.inFigure ? '' : ' extra'}`} onClick={kind === 'option' ? () => onTake(t) : undefined}>
            <path d={d} markerEnd={`url(#arrow-${kind})`} />
            <text x={e.label.x} y={e.label.y} textAnchor={e.label.anchor}>
              <tspan x={e.label.x}>{t.event}</tspan>
              {t.action && (
                <tspan x={e.label.x} dy="1.15em" className="action">
                  {t.action}
                </tspan>
              )}
            </text>
          </g>
        );
      })}
      {NODES.map((n) => (
        <g key={n.key} className={`node${n.state === state ? ' current' : visited.has(n.state) ? ' visited' : ''} phase-${STATE_INFO[n.state].phase}`}>
          <rect x={n.x - NODE.w / 2} y={n.y - NODE.h / 2} width={NODE.w} height={NODE.h} rx={6} />
          <text x={n.x} y={n.y + 4} textAnchor="middle">
            {n.state}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** TCP state machine: the RFC 9293 state diagram, walked through one event at a time. */
export default function TcpStatesTool() {
  const [path, setPath] = useState<Transition[]>([]);
  const [scenario, setScenario] = useState<string | null>(null);

  let state: State = 'CLOSED';
  let ctx: Context = { passive: false };
  for (const t of path) {
    ctx = next(ctx, t);
    state = t.to;
  }
  const options = available(state, ctx);
  const last = path.at(-1);
  const visited = new Set<State>(['CLOSED', ...path.map((t) => t.to)]);
  const steps = tcpStepNumbers();

  const take = (t: Transition) => {
    setPath([...path, t]);
    setScenario(null);
  };

  const play = (id: string) => {
    const s = SCENARIOS.find((x) => x.id === id)!;
    run(s.path); // validates the path
    setPath(s.path.map((tid) => TRANSITIONS.find((t) => t.id === tid)!));
    setScenario(id);
  };

  return (
    <div className="index tool tcp-states-tool">
      <h1>TCP state machine</h1>
      <p className="lead">Every TCP connection moves through these states. Start at CLOSED and choose what happens next: a call of the application, an arriving segment or a timer. The diagram follows RFC 9293, Figure 5.</p>

      <div className="tcp-layout">
        <div className="tcp-diagram-wrap">
          <Diagram state={state} options={options} last={last} visited={visited} onTake={take} />
          <p className="legend small muted">
            <span className="key option" /> possible now <span className="key last" /> last step <span className="key extra" /> not drawn in the RFC figure. Labels: event, then action.
          </p>
        </div>

        <div className="tcp-panel">
          <section aria-live="polite" aria-labelledby="h-state" className="tcp-current">
            <h2 id="h-state">
              <span className="muted small">Current state</span> {state}
            </h2>
            <p>{STATE_INFO[state].about}</p>
            {last && (
              <p className="small">
                <strong>Last step:</strong> {last.event}
                {last.action ? ` / ${last.action}` : ''}. {last.about}
              </p>
            )}
          </section>

          <section aria-labelledby="h-next">
            <h2 id="h-next">What can happen now</h2>
            <ul className="tcp-options">
              {options.map((t) => (
                <li key={t.id}>
                  <button type="button" className="tcp-option" onClick={() => take(t)}>
                    <span className={`kind kind-${t.kind}`}>{KIND_LABEL[t.kind]}</span>
                    <span className="mono">
                      {t.event}
                      {t.action ? ` / ${t.action}` : ''}
                    </span>
                    <span className="to">to {t.to}</span>
                  </button>
                  <p className="small muted">
                    {t.about} <SourceLink source={t.source} />
                    {t.exchange && steps[t.exchange.step] && (
                      <>
                        {' '}
                        <a href={href.exchange('tcp', steps[t.exchange.step])}>See it in the TCP exchange, step {steps[t.exchange.step]}</a>
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="h-path">
            <h2 id="h-path">Path</h2>
            <ol className="tcp-path small">
              <li className="mono">CLOSED</li>
              {path.map((t, i) => (
                <li key={i}>
                  <button type="button" className="link-button" onClick={() => setPath(path.slice(0, i + 1))} title="Go back to this state">
                    {t.to}
                  </button>{' '}
                  <span className="muted">
                    ({t.event}
                    {t.action ? ` / ${t.action}` : ''})
                  </span>
                </li>
              ))}
            </ol>
            <button type="button" onClick={() => (setPath([]), setScenario(null))} disabled={path.length === 0}>
              Start over
            </button>
          </section>
        </div>
      </div>

      <section aria-labelledby="h-scenarios">
        <h2 id="h-scenarios">Scenarios</h2>
        <ul className="cards">
          {SCENARIOS.map((s) => (
            <li key={s.id}>
              <button type="button" className={`card${scenario === s.id ? ' selected' : ''}`} onClick={() => play(s.id)}>
                <strong>{s.title}</strong>
                <span>{s.about}</span>
                <span className="mono small muted">{run(s.path).states.join(' > ')}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="h-how">
        <h2 id="h-how">How to read it</h2>
        <div className="prose">
          <p>
            The upper half opens a connection, the lower half closes it. A client takes the right path (active open: CLOSED, SYN-SENT, ESTABLISHED); a server takes the left one (passive open: LISTEN, SYN-RECEIVED, ESTABLISHED). For closing, it matters who closes first, not who opened: the active closer goes through FIN-WAIT-1, FIN-WAIT-2 and TIME-WAIT, the passive closer through CLOSE-WAIT and LAST-ACK.
          </p>
          <p>
            The figure leaves out some transitions to stay readable: a FIN that arrives together with the ACK of our FIN (FIN-WAIT-1 straight to TIME-WAIT), and resets. A RST moves almost every state to CLOSED; only a connection that came from LISTEN returns to LISTEN. These appear here as options, drawn dashed or not drawn at all.
          </p>
          <p>
            You can watch real states with <span className="mono">ss -tan</span> on Linux or <span className="mono">netstat -an</span> on Windows. Many connections in CLOSE-WAIT usually mean an application that forgets to close its sockets; many in TIME-WAIT are normal on a busy client.
          </p>
        </div>
      </section>

      <section aria-labelledby="h-sources">
        <h2 id="h-sources">Sources</h2>
        <SourceList sources={SOURCES} />
      </section>
    </div>
  );
}
