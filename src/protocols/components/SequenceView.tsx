import type { Exchange } from '../../shared/schema';

const MARGIN = 98;
/** Distance between lifelines: wide for two, tighter for more, so the diagram stays readable. */
const spacingFor = (n: number) => Math.min(200, Math.max(130, 330 / Math.max(n - 1, 1)));
const HEAD = 44;
const ROW = 40;
const SLOPE = 12;

interface Props {
  exchange: Exchange;
  index: number;
  onSelect: (index: number) => void;
}

export function SequenceView({ exchange, index, onSelect }: Props) {
  const lifelines = exchange.participants.filter((p) => p.lifeline).sort((a, b) => a.pos.x - b.pos.x);
  const SPACING = spacingFor(lifelines.length);
  const xOf = new Map(lifelines.map((p, i) => [p.id, MARGIN + i * SPACING]));
  const width = MARGIN * 2 + (lifelines.length - 1) * SPACING;
  const top = HEAD + 28;
  const height = top + exchange.steps.length * ROW + 24;
  const leftmost = lifelines[0]?.id;

  const stateLabel = (id: string, state: string, y: number, key: string) => {
    const x = xOf.get(id);
    if (x === undefined) return null;
    const left = id === leftmost;
    return (
      <text key={key} x={left ? x - 10 : x + 10} y={y} textAnchor={left ? 'end' : 'start'} className="state">
        {state}
      </text>
    );
  };

  return (
    <div className="sequence">
      <svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Sequence diagram, one arrow per step">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" className="arrowhead" />
          </marker>
          <marker id="arrow-current" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" className="arrowhead current" />
          </marker>
        </defs>
        {lifelines.map((p) => (
          <g key={p.id} className="lifeline">
            <text x={xOf.get(p.id)} y={18} textAnchor="middle" className="lifeline-label">
              {p.label}
            </text>
            <line x1={xOf.get(p.id)} y1={HEAD - 14} x2={xOf.get(p.id)} y2={height - 8} />
          </g>
        ))}
        {Object.entries(exchange.initialStates ?? {}).map(([id, s]) => stateLabel(id, s, HEAD + 6, `init-${id}`))}
        {exchange.steps.map((s, i) => {
          const x1 = xOf.get(s.from)!;
          const x2 = xOf.get(s.to)!;
          const y = top + i * ROW;
          const dir = Math.sign(x2 - x1);
          const status = i === index ? 'current' : i < index ? 'past' : 'future';
          return (
            <g
              key={s.id}
              className={`message ${status}`}
              role="button"
              tabIndex={0}
              aria-current={i === index ? 'step' : undefined}
              aria-label={`Step ${i + 1}: ${s.label}`}
              onClick={() => onSelect(i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(i);
                }
              }}
            >
              <rect x={Math.min(x1, x2)} y={y - 22} width={Math.abs(x2 - x1)} height={ROW - 4} className="hit" />
              {(s.extraPaths ?? []).map((p, k) => {
                // Copies of a broadcast: thin dashed arrows to the other receivers that have a lifeline.
                const xe = xOf.get(p[p.length - 1]);
                if (xe === undefined) return null;
                const d = Math.sign(xe - x1);
                return <line key={k} className="copy" x1={x1 + d * 2} y1={y} x2={xe - d * 3} y2={y + SLOPE * 0.5} markerEnd="url(#arrow)" />;
              })}
              {s.lost ? (
                // A lost message ends between the lifelines with a cross.
                <>
                  <line x1={x1 + dir * 2} y1={y} x2={x1 + (x2 - x1) * 0.6} y2={y + SLOPE * 0.6} />
                  <path className="lost-mark" d={`M${x1 + (x2 - x1) * 0.6 - 5} ${y + SLOPE * 0.6 - 5} l10 10 m0 -10 l-10 10`} />
                </>
              ) : (
                <line x1={x1 + dir * 2} y1={y} x2={x2 - dir * 3} y2={y + SLOPE} markerEnd={`url(#${status === 'current' ? 'arrow-current' : 'arrow'})`} />
              )}
              <text x={(x1 + x2) / 2} y={y - 2} textAnchor="middle" className="message-label">
                <tspan className="step-no">{i + 1}</tspan> {s.label}
              </text>
              {Object.entries(s.states ?? {}).map(([id, st]) => stateLabel(id, st, y + SLOPE + 4, `${s.id}-${id}`))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
