import type { ParticipantKind } from '../schema';

/**
 * Isometric line icons for the network view, drawn in SVG by hand.
 *
 * Coordinates: x runs to the front right, y to the front left, z up. The origin is the
 * centre of the footprint on the ground, which is where links attach.
 */
const C = Math.cos(Math.PI / 6);
const S = 0.5;

type P3 = [number, number, number];

export function iso([x, y, z]: P3): [number, number] {
  return [(x - y) * C, (x + y) * S - z];
}

const pts = (ps: P3[]) =>
  ps
    .map(iso)
    .map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`)
    .join(' ');

function Quad({ ps, className }: { ps: P3[]; className?: string }) {
  return <polygon points={pts(ps)} className={className} />;
}

function Line({ a, b, className }: { a: P3; b: P3; className?: string }) {
  const [x1, y1] = iso(a);
  const [x2, y2] = iso(b);
  return <line x1={x1} y1={y1} x2={x2} y2={y2} className={className} />;
}

/** A box on the ground with its three visible faces: top, front left (y = +d/2), front right (x = +w/2). */
function Box({ w, d, h, z = 0 }: { w: number; d: number; h: number; z?: number }) {
  const x0 = -w / 2,
    x1 = w / 2,
    y0 = -d / 2,
    y1 = d / 2,
    z1 = z + h;
  return (
    <>
      <Quad className="face-left" ps={[[x0, y1, z], [x1, y1, z], [x1, y1, z1], [x0, y1, z1]]} />
      <Quad className="face-right" ps={[[x1, y1, z], [x1, y0, z], [x1, y0, z1], [x1, y1, z1]]} />
      <Quad className="face-top" ps={[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]} />
    </>
  );
}

/** Rectangle on a top face at height z. */
const onTop = (z: number, x0: number, x1: number, y0: number, y1: number): P3[] => [
  [x0, y0, z],
  [x1, y0, z],
  [x1, y1, z],
  [x0, y1, z],
];

function Laptop() {
  return (
    <>
      <Box w={22} d={22} h={2} />
      {/* Screen, hinged at the back edge and tilted slightly backwards. */}
      <Quad className="face-screen" ps={[[-11, -11, 2], [-11, 11, 2], [-14, 11, 20], [-14, -11, 20]]} />
    </>
  );
}

function Router() {
  return (
    <>
      <Box w={26} d={20} h={8} />
      <Line a={[-9, -6, 8]} b={[-9, -6, 21]} />
    </>
  );
}

function Switch() {
  return (
    <>
      <Box w={34} d={14} h={6} />
      <Line className="detail-line" a={[-12, 7, 3]} b={[12, 7, 3]} />
    </>
  );
}

function Server({ h }: { h: number }) {
  const lines = h > 25 ? [h / 3, (2 * h) / 3] : [h / 2];
  return (
    <>
      <Box w={20} d={20} h={h} />
      {lines.map((z) => (
        <Line key={z} className="detail-line" a={[-10, 10, z]} b={[10, 10, z]} />
      ))}
    </>
  );
}

function Cloud() {
  return <path className="face-top" transform="translate(2.6 0)" d="M-22 2 a8 8 0 0 1 -1 -16 a10 10 0 0 1 13 -8 a12 12 0 0 1 22 2 a8 8 0 0 1 11 10 a7 7 0 0 1 -3 12 z" />;
}

/** Highest point of each icon above the ground centre, in screen pixels (positive = up). */
export const ICON_TOP: Record<ParticipantKind, number> = {
  host: 33,
  router: 30,
  switch: 18,
  server: 42,
  resolver: 32,
  internet: 30,
};

/** Half the screen width of each icon, so link labels can be centred in the free space between two icons. */
export const ICON_HALF: Record<ParticipantKind, number> = {
  host: 22,
  router: 20,
  switch: 21,
  server: 18,
  resolver: 18,
  internet: 28,
};

/** Footprint used for the ground tile under each icon (width along x, depth along y). */
const FOOTPRINT: Record<ParticipantKind, [number, number]> = {
  host: [30, 30],
  router: [32, 26],
  switch: [40, 20],
  server: [26, 26],
  resolver: [26, 26],
  internet: [0, 0],
};

export function GroundTile({ kind }: { kind: ParticipantKind }) {
  const [w, d] = FOOTPRINT[kind];
  if (kind === 'internet') return <ellipse className="ground" cx={0} cy={4} rx={32} ry={9} />;
  return <Quad className="ground" ps={onTop(0, -w / 2, w / 2, -d / 2, d / 2)} />;
}

export function IsoIcon({ kind }: { kind: ParticipantKind }) {
  switch (kind) {
    case 'router':
      return <Router />;
    case 'switch':
      return <Switch />;
    case 'server':
      return <Server h={32} />;
    case 'resolver':
      return <Server h={22} />;
    case 'internet':
      return <Cloud />;
    default:
      return <Laptop />;
  }
}

/** The packet: a small cube. */
export function PacketCube() {
  return <Box w={10} d={10} h={7} z={-3.5} />;
}

/** Size of one cell of the background grid, in screen pixels (width and height of a rhombus). */
export const GRID = { w: 2 * 14 * C, h: 2 * 14 * S };
