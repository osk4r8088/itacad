import { href } from '../../app/router';
import { findTopic } from '../catalog';

interface Part {
  topic: string;
  label: string;
  sub: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Outside the computer, drawn dashed. */
  external?: boolean;
}

// Coordinates in the 640 x 320 viewBox. The bus row stands for the mainboard and its PCIe lanes.
const PARTS: Part[] = [
  { topic: 'cpu', label: 'CPU', sub: 'cores and caches', x: 20, y: 20, w: 180, h: 80 },
  { topic: 'memory', label: 'RAM', sub: 'DDR4, DDR5', x: 240, y: 20, w: 170, h: 80 },
  { topic: 'gpu', label: 'GPU', sub: 'graphics, parallel work', x: 450, y: 20, w: 170, h: 80 },
  { topic: 'mainboard', label: 'Mainboard', sub: 'PCI Express lanes and chipset', x: 20, y: 135, w: 600, h: 40 },
  { topic: 'storage', label: 'NVMe SSD', sub: 'on PCIe', x: 20, y: 210, w: 130, h: 80 },
  { topic: 'storage', label: 'SATA drive', sub: 'SSD or HDD', x: 170, y: 210, w: 130, h: 80 },
  { topic: 'nic', label: 'Network card', sub: 'Ethernet, Wi-Fi', x: 320, y: 210, w: 130, h: 80 },
  { topic: 'network-devices', label: 'Switch, router', sub: 'the network', x: 490, y: 210, w: 130, h: 80, external: true },
];

// Connections as [x1, y1, x2, y2].
const LINES: [number, number, number, number][] = [
  [200, 60, 240, 60], // CPU to RAM
  [110, 100, 110, 135], // CPU to the PCIe lanes
  [535, 100, 535, 135], // GPU
  [85, 175, 85, 210], // NVMe SSD
  [235, 175, 235, 210], // SATA drive (through the chipset)
  [385, 175, 385, 210], // network card
  [450, 250, 490, 250], // cable or radio
];

/** A computer drawn as its main parts; each part links to its topic, planned topics are greyed out. */
export default function ComputerDiagram() {
  return (
    <svg className="computer" viewBox="0 0 640 320" role="group" aria-label="Parts of a computer and how they connect">
      {LINES.map(([x1, y1, x2, y2], i) => (
        <line key={i} className="computer-line" x1={x1} y1={y1} x2={x2} y2={y2} />
      ))}
      {PARTS.map((p) => {
        const entry = findTopic(p.topic);
        const ready = entry?.status === 'ready';
        const shape = (
          <>
            <rect className={`computer-part${p.external ? ' is-external' : ''}`} x={p.x} y={p.y} width={p.w} height={p.h} rx={6} />
            <text className="computer-label" x={p.x + p.w / 2} y={p.y + (p.h > 50 ? p.h / 2 - 4 : p.h / 2 + 5)} textAnchor="middle">
              {p.label}
              {p.h <= 50 && <tspan className="computer-sub">{`: ${p.sub}`}</tspan>}
            </text>
            {p.h > 50 && (
              <text className="computer-sub" x={p.x + p.w / 2} y={p.y + p.h / 2 + 18} textAnchor="middle">
                {ready ? p.sub : 'planned'}
              </text>
            )}
          </>
        );
        const key = `${p.topic}-${p.label}`;
        return ready && entry ? (
          <a key={key} href={href.topic(entry.category, entry.id)} className="computer-link">
            <title>{`${entry.title}: open the topic`}</title>
            {shape}
          </a>
        ) : (
          <g key={key} className="computer-planned">
            <title>{`${entry?.title ?? p.label}: planned`}</title>
            {shape}
          </g>
        );
      })}
    </svg>
  );
}
