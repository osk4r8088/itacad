import { useEffect, useState } from 'react';
import type { Exchange, Participant, Step } from '../schema';
import { useReducedMotion } from '../hooks/useHashRoute';

const UNIT_X = 56;
const UNIT_Y = 120;
const PAD_X = 56;
const PAD_TOP = 70;
const MS_PER_HOP = 450;
/** Half the size of the rounded tile behind each node icon. */
const TILE = 24;

type Point = { x: number; y: number };

function center(p: Participant): Point {
  return { x: PAD_X + p.pos.x * UNIT_X, y: PAD_TOP + p.pos.y * UNIT_Y };
}

function segmentLengths(points: Point[]): number[] {
  return points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
}

/** The part of a polyline from its start to fraction t of its length, ending at the packet position. */
function travelled(points: Point[], t: number): Point[] {
  if (points.length === 1) return points;
  const lengths = segmentLengths(points);
  let d = t * lengths.reduce((a, b) => a + b, 0);
  const out = [points[0]];
  for (let i = 0; i < lengths.length; i++) {
    if (d <= lengths[i] || i === lengths.length - 1) {
      const f = lengths[i] === 0 ? 1 : Math.min(d / lengths[i], 1);
      out.push({ x: points[i].x + (points[i + 1].x - points[i].x) * f, y: points[i].y + (points[i + 1].y - points[i].y) * f });
      return out;
    }
    d -= lengths[i];
    out.push(points[i + 1]);
  }
  return out;
}

/** Rough text width for the label pills; the SVG uses fixed font sizes, so this is close enough. */
const textWidth = (s: string, px: number, mono = false) => s.length * px * (mono ? 0.6 : 0.55);

function NodeIcon({ kind }: { kind: Participant['kind'] }) {
  switch (kind) {
    case 'router':
      return (
        <>
          <circle r={11} />
          <path d="M-7 -3.5 H6 M3 -6.5 L6 -3.5 L3 -0.5 M7 3.5 H-6 M-3 0.5 L-6 3.5 L-3 6.5" />
        </>
      );
    case 'switch':
      return (
        <>
          <rect x={-13} y={-7} width={26} height={14} rx={2.5} />
          <path d="M-8 -1.5 H8 M5 -4 L8 -1.5 L5 1 M8 2.5 H-8 M-5 0 L-8 2.5 L-5 5" />
        </>
      );
    case 'server':
      return (
        <>
          <rect x={-9} y={-13} width={18} height={26} rx={2.5} />
          <path d="M-5 -7 H5 M-5 -2 H5 M-5 3 H1" />
          <circle cx={4} cy={8} r={1.2} className="icon-dot" />
        </>
      );
    case 'resolver':
      return (
        <>
          <circle cx={-2.5} cy={-2.5} r={7.5} />
          <path d="M3 3 L10 10" />
        </>
      );
    default:
      // Laptop
      return (
        <>
          <rect x={-11} y={-10} width={22} height={15} rx={2} />
          <path d="M-15 8 H15 L13 11 H-13 Z" />
        </>
      );
  }
}

function Node({ p, role, busy }: { p: Participant; role: 'sender' | 'receiver' | 'via' | ''; busy: boolean }) {
  const c = center(p);
  const cls = `node${role ? ` ${role}` : ''}${busy ? ' busy' : ''}`;
  return (
    <g transform={`translate(${c.x} ${c.y})`} className={cls}>
      <title>{[p.label, p.addr?.ipv4, p.addr?.mac, p.note].filter(Boolean).join('\n')}</title>
      {p.kind === 'internet' ? (
        <path className="tile cloud" d="M-30 12 a12 12 0 0 1 1 -24 a17 17 0 0 1 31 -6 a14 14 0 0 1 26 9 a11 11 0 0 1 -2 21 z" />
      ) : (
        <>
          <rect className="tile" x={-TILE} y={-TILE} width={TILE * 2} height={TILE * 2} rx={12} />
          <g className="icon">
            <NodeIcon kind={p.kind} />
          </g>
        </>
      )}
      <text y={TILE + 19} textAnchor="middle" className="node-label">
        {p.label}
      </text>
      {/* IP address under the node; the MAC address is in the tooltip and in the packet view per link. */}
      {p.addr?.ipv4 && (
        <text y={TILE + 34} textAnchor="middle" className="node-addr">
          {p.addr.ipv4}
        </text>
      )}
    </g>
  );
}

export function NetworkView({ exchange, step }: { exchange: Exchange; step: Step }) {
  const reduced = useReducedMotion();
  const byId = new Map(exchange.participants.map((p) => [p.id, p]));
  const color = exchange.categories.find((c) => c.id === step.category)?.color ?? 'blue';
  // The main path plus any copies of the same message (broadcast, flooding).
  const paths = [step.path, ...(step.extraPaths ?? [])];
  const pointSets = paths.map((path) => path.map((id) => center(byId.get(id)!)));
  const [t, setT] = useState(reduced ? 1 : 0);
  const [replay, setReplay] = useState(0);

  useEffect(() => {
    if (reduced) {
      setT(1);
      return;
    }
    const duration = MS_PER_HOP * Math.max(...pointSets.map((pts) => pts.length - 1), 1);
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      setT(p < 1 ? 0.5 - Math.cos(Math.PI * p) / 2 : 1);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // points derive from step; restart only when the step changes or on replay
  }, [step.id, reduced, replay]);

  const maxX = Math.max(...exchange.participants.map((p) => p.pos.x));
  const maxY = Math.max(...exchange.participants.map((p) => p.pos.y));
  const width = PAD_X * 2 + maxX * UNIT_X;
  const height = PAD_TOP + maxY * UNIT_Y + TILE + 44;
  const linkKey = (a: string, b: string) => [a, b].sort().join('|');
  const pathLinks = new Set(paths.flatMap((path) => path.slice(1).map((id, i) => linkKey(path[i], id))));
  const receivers = new Set(paths.map((path) => path[path.length - 1]));
  const via = new Set(paths.flatMap((path) => path.slice(1, -1)));

  // A lost message stops halfway. On arrival the packet rises above the receiver, so it does not cover the node.
  const reach = step.lost ? t * 0.5 : t;
  const lift = step.lost ? 0 : (TILE + 14) * Math.max(0, (t - 0.9) / 0.1);
  const trails = pointSets.map((pts) => travelled(pts, reach));
  const packets = trails.map((tr) => {
    const end = tr[tr.length - 1];
    return { x: end.x, y: end.y - lift };
  });
  // The node the packet is passing right now, so it lights up as the packet goes through.
  const near = (p: Participant) => packets.some((pk) => Math.hypot(pk.x - center(p).x, pk.y - center(p).y) < TILE + 6);

  const label = step.label;
  const labelW = textWidth(label, 11, true) + 14;
  const lead = packets[0];
  // Keep the label pill inside the drawing.
  const labelX = Math.min(Math.max(lead.x, labelW / 2 + 2), width - labelW / 2 - 2);

  return (
    <div className="network">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${byId.get(step.from)!.label} sends ${label} to ${byId.get(step.to)!.label}`}>
        <defs>
          <pattern id="net-grid" width={14} height={14} patternUnits="userSpaceOnUse">
            <circle cx={1} cy={1} r={0.9} className="grid-dot" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#net-grid)" />

        <g className={`cat-${color}`}>
          {exchange.links.map((l) => {
            const a = center(byId.get(l.a)!);
            const b = center(byId.get(l.b)!);
            const active = pathLinks.has(linkKey(l.a, l.b));
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const w = textWidth(l.label, 10.5) + 12;
            return (
              <g key={l.id} className={`link${active ? ' active' : ''}`}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                {active && !reduced && <line className="flow" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />}
                <rect className="link-pill" x={mx - w / 2} y={my - 8} width={w} height={16} rx={8} />
                <text x={mx} y={my + 3.6} textAnchor="middle" className="link-label">
                  {l.label}
                </text>
              </g>
            );
          })}

          {trails.map((tr, i) => (
            <polyline key={i} className="trail" points={tr.map((p) => `${p.x},${p.y}`).join(' ')} />
          ))}

          {exchange.participants.map((p) => {
            const role = p.id === step.from ? 'sender' : receivers.has(p.id) ? 'receiver' : via.has(p.id) ? 'via' : '';
            return <Node key={p.id} p={p} role={role} busy={t > 0 && t < 1 && near(p)} />;
          })}

          {packets.map((pk, i) => (
            <g key={i} className="packet" transform={`translate(${pk.x} ${pk.y})`}>
              <rect x={-11} y={-7} width={22} height={14} rx={4} />
              <path d="M-6 -2.5 H6 M-6 1.5 H2" className="packet-lines" />
              {step.lost && t === 1 && <path d="M8 2 l10 10 m0 -10 l-10 10" className="lost-mark" />}
            </g>
          ))}
          <g className="packet-tag" transform={`translate(${labelX} ${lead.y - 21})`}>
            <rect x={-labelW / 2} y={-9} width={labelW} height={18} rx={9} />
            <text y={3.8} textAnchor="middle">
              {label}
            </text>
          </g>
        </g>
      </svg>
      <div className="network-foot">
        <span className="muted">
          {byId.get(step.from)!.label} to {byId.get(step.to)!.label}
          {step.path.length > 2 && <> via {step.path.slice(1, -1).map((id) => byId.get(id)!.label).join(', ')}</>}
          {step.extraPaths && step.extraPaths.length > 0 && <> (copies also reach {step.extraPaths.map((x) => byId.get(x[x.length - 1])!.label).join(', ')})</>}
          {step.lost && <strong> (lost on the way)</strong>}
        </span>
        {!reduced && (
          <button type="button" className="link-button" onClick={() => setReplay((r) => r + 1)}>
            Replay
          </button>
        )}
      </div>
    </div>
  );
}
