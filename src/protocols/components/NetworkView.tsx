import { useEffect, useRef, useState } from 'react';
import type { Exchange, Participant, Step } from '../../shared/schema';
import { useReducedMotion } from '../../shared/hooks';
import { GRID, GroundTile, ICON_HALF, ICON_TOP, IsoIcon, PacketCube } from './isoIcons';

// One position unit is 2.5 grid cells across and 3.5 down. Nodes snap to the nearest
// vertex of the isometric background grid, so every node sits on a grid point.
const CELLS_X = 2.5;
const UNIT_Y = 7 * GRID.h;
const PAD_X = 2 * GRID.w;
const MS_PER_HOP = 450;
/** Distance from the ground centre of a node to its name label. */
const LABEL_Y = 26;
/** Same condition as the dashboard layout in styles.css, where the panel has a fixed height. */
const DASHBOARD = '(min-width: 1100px) and (min-height: 650px)';

type Point = { x: number; y: number };

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
const textWidth = (s: string, px: number) => s.length * px * 0.6;

type Role = 'sender' | 'receiver' | 'via' | '';

function Node({ p, at, role, busy }: { p: Participant; at: Point; role: Role; busy: boolean }) {
  const cls = `node${role ? ` ${role}` : ''}${busy ? ' busy' : ''}${p.kind === 'attacker' ? ' node-attacker' : ''}`;
  return (
    <g transform={`translate(${at.x} ${at.y})`} className={cls}>
      <title>{[p.label, p.addr?.ipv4, p.addr?.mac, p.note].filter(Boolean).join('\n')}</title>
      <GroundTile kind={p.kind} />
      <g className="icon">
        <IsoIcon kind={p.kind} />
      </g>
      <text y={LABEL_Y} textAnchor="middle" className="node-label">
        {p.label}
      </text>
      {/* IP address under the node; the MAC address is in the tooltip and in the packet view per link. */}
      {p.addr?.ipv4 && (
        <text y={LABEL_Y + 15} textAnchor="middle" className="node-addr">
          {p.addr.ipv4}
        </text>
      )}
    </g>
  );
}

export function NetworkView({ exchange, step }: { exchange: Exchange; step: Step }) {
  const reduced = useReducedMotion();
  const byId = new Map(exchange.participants.map((p) => [p.id, p]));
  const [t, setT] = useState(reduced ? 1 : 0);
  const [replay, setReplay] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  // Size of the drawing area in the dashboard, where the panel has a fixed size. Null elsewhere.
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const mq = window.matchMedia(DASHBOARD);
    const measure = () => {
      const r = svg.getBoundingClientRect();
      setBox(mq.matches && r.width > 0 && r.height > 0 ? { w: r.width, h: r.height } : null);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(svg);
    mq.addEventListener('change', measure);
    return () => {
      ro.disconnect();
      mq.removeEventListener('change', measure);
    };
  }, []);

  // Room above the top row for the tallest icon plus the packet and its tag resting on it.
  const minY = Math.min(...exchange.participants.map((p) => p.pos.y));
  const tallest = Math.max(...exchange.participants.filter((p) => p.pos.y === minY).map((p) => ICON_TOP[p.kind]));
  const padTop = Math.ceil((tallest + 44) / GRID.h) * GRID.h;
  const center = (p: Participant): Point => ({ x: PAD_X + Math.round(p.pos.x * CELLS_X) * GRID.w, y: padTop + (p.pos.y - minY) * UNIT_Y });

  // The main path plus any copies of the same message (broadcast, flooding).
  const paths = [step.path, ...(step.extraPaths ?? [])];
  const pointSets = paths.map((path) => path.map((id) => center(byId.get(id)!)));

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
  const width = PAD_X * 2 + Math.round(maxX * CELLS_X) * GRID.w;
  const height = padTop + (maxY - minY) * UNIT_Y + LABEL_Y + 22;
  // In the dashboard the view fills its panel at no more than 1:1, so every exchange is drawn at the same size
  // as long as it fits; smaller topologies get more grid around them instead of being blown up.
  let viewBox = `0 0 ${width} ${height}`;
  if (box) {
    const scale = Math.min(1, box.w / width, box.h / height);
    const vw = box.w / scale;
    const vh = box.h / scale;
    viewBox = `${(width - vw) / 2} ${(height - vh) / 2} ${vw} ${vh}`;
  }
  const linkKey = (a: string, b: string) => [a, b].sort().join('|');
  const pathLinks = new Set(paths.flatMap((path) => path.slice(1).map((id, i) => linkKey(path[i], id))));
  const receivers = new Set(paths.map((path) => path[path.length - 1]));
  const via = new Set(paths.flatMap((path) => path.slice(1, -1)));

  // A lost message stops halfway. On arrival the packet rises onto the receiver, so it does not hide in the icon.
  const reach = step.lost ? t * 0.5 : t;
  const rise = (id: string) => (step.lost ? 0 : (ICON_TOP[byId.get(id)!.kind] + 8) * Math.max(0, (t - 0.9) / 0.1));
  const trails = pointSets.map((pts) => travelled(pts, reach));
  const packets = trails.map((tr, i) => {
    const end = tr[tr.length - 1];
    return { x: end.x, y: end.y - rise(paths[i][paths[i].length - 1]) };
  });
  // The node the packet is passing right now, so it lights up as the packet goes through.
  const near = (p: Participant) => packets.some((pk) => Math.hypot(pk.x - center(p).x, pk.y - center(p).y) < 26);

  const label = step.label;
  const labelW = textWidth(label, 11) + 14;
  const lead = packets[0];
  // Keep the label pill inside the drawing.
  const labelX = Math.min(Math.max(lead.x, labelW / 2 + 2), width - labelW / 2 - 2);

  return (
    <div className="network">
      <svg ref={svgRef} viewBox={viewBox} role="img" aria-label={`${byId.get(step.from)!.label} sends ${label} to ${byId.get(step.to)!.label}`}>
        <defs>
          <pattern id="net-grid" width={GRID.w} height={GRID.h} patternUnits="userSpaceOnUse" patternTransform={`translate(${PAD_X} ${padTop})`}>
            <path d={`M0 0 L${GRID.w} ${GRID.h} M${GRID.w} 0 L0 ${GRID.h}`} className="grid-line" />
          </pattern>
        </defs>
        {/* Background and grid reach far beyond the drawing, so they fill the whole panel whatever its shape. */}
        <rect x={-2000} y={-2000} width={width + 4000} height={height + 4000} className="net-bg" />
        <rect x={-2000} y={-2000} width={width + 4000} height={height + 4000} fill="url(#net-grid)" />

        <g>
          {exchange.links.map((l) => {
            const a = center(byId.get(l.a)!);
            const b = center(byId.get(l.b)!);
            const active = pathLinks.has(linkKey(l.a, l.b));
            // Centre the label in the gap between the two icons, not between their centres.
            const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            const ha = ICON_HALF[byId.get(l.a)!.kind];
            const hb = ICON_HALF[byId.get(l.b)!.kind];
            const f = (ha + (len - ha - hb) / 2) / len;
            const mx = a.x + (b.x - a.x) * f;
            const my = a.y + (b.y - a.y) * f;
            const w = textWidth(l.label, 9.5) + 10;
            return (
              <g key={l.id} className={`link${active ? ' active' : ''}`}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                {active && !reduced && <line className="flow" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />}
                {l.label && (
                  <>
                    <rect className="link-pill" x={mx - w / 2} y={my - 8} width={w} height={16} rx={3} />
                    <text x={mx} y={my + 3.5} textAnchor="middle" className="link-label">
                      {l.label}
                    </text>
                  </>
                )}
              </g>
            );
          })}

          {trails.map((tr, i) => (
            <polyline key={i} className="trail" points={tr.map((p) => `${p.x},${p.y}`).join(' ')} />
          ))}

          {exchange.participants.map((p) => {
            const role: Role = p.id === step.from ? 'sender' : receivers.has(p.id) ? 'receiver' : via.has(p.id) ? 'via' : '';
            return <Node key={p.id} p={p} at={center(p)} role={role} busy={t > 0 && t < 1 && near(p)} />;
          })}

          {packets.map((pk, i) => (
            <g key={i} className="packet" transform={`translate(${pk.x} ${pk.y})`}>
              <PacketCube />
              {step.lost && t === 1 && <path d="M10 -2 l10 10 m0 -10 l-10 10" className="lost-mark" />}
            </g>
          ))}
          <g className="packet-tag" transform={`translate(${labelX} ${lead.y - 24})`}>
            <rect x={-labelW / 2} y={-9} width={labelW} height={18} rx={3} />
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
