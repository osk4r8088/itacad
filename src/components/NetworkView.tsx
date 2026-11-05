import { useEffect, useState } from 'react';
import type { Exchange, Participant, Step } from '../schema';
import { useReducedMotion } from '../hooks/useHashRoute';

const UNIT_X = 68;
const UNIT_Y = 120;
const PAD_X = 64;
const PAD_TOP = 56;
const MS_PER_HOP = 450;

type Point = { x: number; y: number };

function center(p: Participant): Point {
  return { x: PAD_X + p.pos.x * UNIT_X, y: PAD_TOP + p.pos.y * UNIT_Y };
}

function pointAlong(points: Point[], t: number): Point {
  if (points.length === 1) return points[0];
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  const total = lengths.reduce((a, b) => a + b, 0);
  let d = t * total;
  for (let i = 0; i < lengths.length; i++) {
    if (d <= lengths[i] || i === lengths.length - 1) {
      const f = lengths[i] === 0 ? 1 : Math.min(d / lengths[i], 1);
      return { x: points[i].x + (points[i + 1].x - points[i].x) * f, y: points[i].y + (points[i + 1].y - points[i].y) * f };
    }
    d -= lengths[i];
  }
  return points[points.length - 1];
}

function NodeShape({ p, active }: { p: Participant; active: boolean }) {
  const cls = `node-shape${active ? ' active' : ''}`;
  switch (p.kind) {
    case 'router':
      return (
        <g className={cls}>
          <circle r={22} />
          <path d="M-11 -5 H9 M5 -9 L9 -5 L5 -1 M11 5 H-9 M-5 1 L-9 5 L-5 9" className="node-glyph" />
        </g>
      );
    case 'internet':
      return (
        <g className={cls}>
          <path d="M-34 12 a14 14 0 0 1 2 -26 a18 18 0 0 1 32 -8 a16 16 0 0 1 30 10 a12 12 0 0 1 -2 24 z" />
        </g>
      );
    case 'server':
      return (
        <g className={cls}>
          <rect x={-18} y={-26} width={36} height={52} rx={4} />
          <path d="M-11 -14 H11 M-11 -4 H11 M-11 6 H11" className="node-glyph" />
        </g>
      );
    case 'switch':
      return (
        <g className={cls}>
          <rect x={-28} y={-14} width={56} height={28} rx={4} />
        </g>
      );
    default:
      return (
        <g className={cls}>
          <rect x={-26} y={-20} width={52} height={34} rx={4} />
          <path d="M-10 22 H10 M0 14 V22" className="node-glyph" />
        </g>
      );
  }
}

export function NetworkView({ exchange, step }: { exchange: Exchange; step: Step }) {
  const reduced = useReducedMotion();
  const byId = new Map(exchange.participants.map((p) => [p.id, p]));
  const points = step.path.map((id) => center(byId.get(id)!));
  const [t, setT] = useState(reduced ? 1 : 0);
  const [replay, setReplay] = useState(0);

  useEffect(() => {
    if (reduced) {
      setT(1);
      return;
    }
    const duration = MS_PER_HOP * Math.max(points.length - 1, 1);
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
  const height = PAD_TOP + maxY * UNIT_Y + 92;
  const onPath = new Set(step.path);
  const pathLinks = new Set(
    step.path.slice(1).map((id, i) => [step.path[i], id].sort().join('|')),
  );
  // On arrival the packet rests just above the receiver, so it does not cover the node.
  const along = pointAlong(points, t);
  const packet = { x: along.x, y: along.y - 36 * Math.max(0, (t - 0.9) / 0.1) };

  return (
    <div className="network">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${byId.get(step.from)!.label} sends ${step.label} to ${byId.get(step.to)!.label}`}>
        {exchange.links.map((l) => {
          const a = center(byId.get(l.a)!);
          const b = center(byId.get(l.b)!);
          const active = pathLinks.has([l.a, l.b].sort().join('|'));
          return (
            <g key={l.id} className={`link${active ? ' active' : ''}`}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 8} textAnchor="middle" className="link-label">
                {l.label}
              </text>
            </g>
          );
        })}
        {exchange.participants.map((p) => {
          const c = center(p);
          const role = p.id === step.from ? 'sender' : p.id === step.to ? 'receiver' : '';
          return (
            <g key={p.id} transform={`translate(${c.x} ${c.y})`} className={`node ${role}`}>
              <title>{[p.label, p.addr?.ipv4, p.addr?.mac, p.note].filter(Boolean).join('\n')}</title>
              <NodeShape p={p} active={p.id === step.from || p.id === step.to || (onPath.has(p.id) && t > 0 && t < 1)} />
              <text y={44} textAnchor="middle" className="node-label">
                {p.label}
              </text>
              {p.addr?.ipv4 && (
                <text y={58} textAnchor="middle" className="node-addr">
                  {p.addr.ipv4}
                </text>
              )}
              {p.addr?.mac && (
                <text y={p.addr.ipv4 ? 71 : 58} textAnchor="middle" className="node-addr">
                  {p.addr.mac}
                </text>
              )}
            </g>
          );
        })}
        <g className="packet" transform={`translate(${packet.x} ${packet.y})`}>
          <rect x={-9} y={-7} width={18} height={14} rx={3} />
          <text y={-14} textAnchor="middle" className="packet-label">
            {step.label}
          </text>
        </g>
      </svg>
      {!reduced && (
        <button type="button" className="link-button replay" onClick={() => setReplay((r) => r + 1)}>
          Replay animation
        </button>
      )}
    </div>
  );
}
