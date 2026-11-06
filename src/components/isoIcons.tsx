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

/** Rectangle on the front left face (y fixed), from x0 to x1 and z0 to z1. */
const onLeft = (y: number, x0: number, x1: number, z0: number, z1: number): P3[] => [
  [x0, y, z0],
  [x1, y, z0],
  [x1, y, z1],
  [x0, y, z1],
];
/** Rectangle on the front right face (x fixed), from y0 to y1 and z0 to z1. */
const onRight = (x: number, y0: number, y1: number, z0: number, z1: number): P3[] => [
  [x, y0, z0],
  [x, y1, z0],
  [x, y1, z1],
  [x, y0, z1],
];
/** Rectangle on a top face at height z. */
const onTop = (z: number, x0: number, x1: number, y0: number, y1: number): P3[] => [
  [x0, y0, z],
  [x1, y0, z],
  [x1, y1, z],
  [x0, y1, z],
];

function Laptop() {
  const keysX = [-11, -6, -1, 4];
  return (
    <>
      <Box w={34} d={26} h={3} />
      <Quad className="detail" ps={onTop(3, -12, 7, -10, 10)} />
      {keysX.map((x) => (
        <Line key={x} className="detail-line" a={[x, -10, 3]} b={[x, 10, 3]} />
      ))}
      {[-5, 0, 5].map((y) => (
        <Line key={y} className="detail-line" a={[-12, y, 3]} b={[7, y, 3]} />
      ))}
      <Quad className="detail" ps={onTop(3, 9.5, 14.5, -4, 4)} />
      {/* Screen, hinged at the back edge and tilted slightly backwards. */}
      <Quad className="face-screen" ps={[[-17, -13, 3], [-17, 13, 3], [-21, 13, 26], [-21, -13, 26]]} />
      <Quad className="detail" ps={[[-17.4, -10.5, 5.5], [-17.4, 10.5, 5.5], [-20.6, 10.5, 23.5], [-20.6, -10.5, 23.5]]} />
    </>
  );
}

function Router() {
  return (
    <>
      <Box w={30} d={24} h={11} />
      <Line className="antenna" a={[-11, -8, 11]} b={[-11, -8, 30]} />
      <circle className="antenna-tip" cx={iso([-11, -8, 31.5])[0]} cy={iso([-11, -8, 31.5])[1]} r={2.2} />
      {[-10, -5, 0, 5].map((x) => (
        <Quad key={x} className="led" ps={onTop(11, x, x + 3, 6, 8.5)} />
      ))}
      <Quad className="detail" ps={onLeft(12, -11, -6, 3, 8)} />
      <Quad className="detail" ps={onLeft(12, -3, 2, 3, 8)} />
      <Quad className="detail" ps={onRight(15, 8, -8, 3, 8)} />
    </>
  );
}

function Switch() {
  return (
    <>
      <Box w={42} d={18} h={9} />
      {[-17, -11, -5, 1, 7, 13].map((x) => (
        <Quad key={x} className="detail" ps={onLeft(9, x, x + 4, 2.5, 6.5)} />
      ))}
      <Quad className="led" ps={onTop(9, 14, 17, 3, 6)} />
    </>
  );
}

function Server({ bays }: { bays: number }) {
  const h = 6 + bays * 12;
  return (
    <>
      <Box w={24} d={24} h={h} />
      <Quad className="detail" ps={onTop(h, -7, 7, -7, 7)} />
      {Array.from({ length: bays }, (_, i) => {
        const z0 = 4 + i * 12;
        return (
          <g key={i}>
            <Quad className="detail" ps={onLeft(12, -9, 9, z0, z0 + 9)} />
            <Quad className="led" ps={onLeft(12, 4, 7, z0 + 3, z0 + 6)} />
            <Line className="detail-line" a={[-7, 12, z0 + 4.5]} b={[1, 12, z0 + 4.5]} />
          </g>
        );
      })}
      {Array.from({ length: bays * 2 }, (_, i) => (
        <Line key={i} className="detail-line" a={[12, 7, 6 + i * 6]} b={[12, -7, 6 + i * 6]} />
      ))}
    </>
  );
}

function Cloud() {
  return (
    <g transform="translate(0 -16)">
      <path className="face-top" d="M-30 16 a12 12 0 0 1 -2 -23 a14 14 0 0 1 18 -12 a17 17 0 0 1 30 2 a12 12 0 0 1 16 14 a10 10 0 0 1 -4 19 z" />
      <circle className="detail" r={10} />
      <ellipse className="detail-line" rx={4.5} ry={10} />
      <path className="detail-line" d="M-10 0 H10 M-8.5 -5 H8.5 M-8.5 5 H8.5" />
    </g>
  );
}

/** Highest point of each icon above the ground centre, in screen pixels (positive = up). */
export const ICON_TOP: Record<ParticipantKind, number> = {
  host: 43,
  router: 44,
  switch: 25,
  server: 54,
  resolver: 42,
  internet: 38,
};

/** Half the screen width of each icon, so link labels can be centred in the free space between two icons. */
export const ICON_HALF: Record<ParticipantKind, number> = {
  host: 27,
  router: 24,
  switch: 26,
  server: 21,
  resolver: 21,
  internet: 46,
};

/** Footprint used for the ground tile under each icon (width along x, depth along y). */
const FOOTPRINT: Record<ParticipantKind, [number, number]> = {
  host: [40, 32],
  router: [38, 32],
  switch: [50, 26],
  server: [32, 32],
  resolver: [32, 32],
  internet: [0, 0],
};

export function GroundTile({ kind }: { kind: ParticipantKind }) {
  const [w, d] = FOOTPRINT[kind];
  if (kind === 'internet') return <ellipse className="ground" cx={0} cy={4} rx={42} ry={12} />;
  return <Quad className="ground" ps={onTop(0, -w / 2, w / 2, -d / 2, d / 2)} />;
}

export function IsoIcon({ kind }: { kind: ParticipantKind }) {
  switch (kind) {
    case 'router':
      return <Router />;
    case 'switch':
      return <Switch />;
    case 'server':
      return <Server bays={3} />;
    case 'resolver':
      return <Server bays={2} />;
    case 'internet':
      return <Cloud />;
    default:
      return <Laptop />;
  }
}

/** The packet: a small cube. */
export function PacketCube() {
  return <Box w={11} d={11} h={8} z={-4} />;
}

/** Size of one cell of the background grid, in screen pixels (width and height of a rhombus). */
export const GRID = { w: 2 * 14 * C, h: 2 * 14 * S };
