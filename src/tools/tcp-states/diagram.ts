import type { State } from './logic';

// Layout of the state diagram, following the arrangement of RFC 9293 Figure 5.
// CLOSED is drawn twice (top and bottom), as in the RFC.

export const VIEW = { width: 780, height: 640 };
export const NODE = { w: 136, h: 34 };

export interface NodePos {
  key: string;
  state: State;
  x: number;
  y: number;
}

export const NODES: NodePos[] = [
  { key: 'CLOSED', state: 'CLOSED', x: 390, y: 40 },
  { key: 'LISTEN', state: 'LISTEN', x: 390, y: 130 },
  { key: 'SYN-RECEIVED', state: 'SYN-RECEIVED', x: 150, y: 225 },
  { key: 'SYN-SENT', state: 'SYN-SENT', x: 630, y: 225 },
  { key: 'ESTABLISHED', state: 'ESTABLISHED', x: 390, y: 320 },
  { key: 'FIN-WAIT-1', state: 'FIN-WAIT-1', x: 150, y: 415 },
  { key: 'CLOSE-WAIT', state: 'CLOSE-WAIT', x: 630, y: 415 },
  { key: 'FIN-WAIT-2', state: 'FIN-WAIT-2', x: 150, y: 510 },
  { key: 'CLOSING', state: 'CLOSING', x: 390, y: 510 },
  { key: 'LAST-ACK', state: 'LAST-ACK', x: 630, y: 510 },
  { key: 'TIME-WAIT', state: 'TIME-WAIT', x: 390, y: 605 },
  { key: 'CLOSED-2', state: 'CLOSED', x: 640, y: 605 },
];

export interface EdgeShape {
  /** Transition id. */
  id: string;
  points: [number, number][];
  label: { x: number; y: number; anchor: 'start' | 'middle' | 'end' };
}

export const EDGES: EdgeShape[] = [
  { id: 'passive-open', points: [[380, 57], [380, 113]], label: { x: 372, y: 82, anchor: 'end' } },
  { id: 'listen-close', points: [[400, 113], [400, 57]], label: { x: 408, y: 82, anchor: 'start' } },
  { id: 'active-open', points: [[458, 34], [640, 34], [640, 208]], label: { x: 650, y: 90, anchor: 'start' } },
  { id: 'synsent-close', points: [[620, 208], [620, 46], [458, 46]], label: { x: 612, y: 72, anchor: 'end' } },
  { id: 'listen-send', points: [[458, 140], [580, 208]], label: { x: 540, y: 160, anchor: 'start' } },
  { id: 'listen-syn', points: [[322, 140], [210, 208]], label: { x: 262, y: 162, anchor: 'end' } },
  { id: 'synrcvd-rst-passive', points: [[120, 208], [120, 124], [322, 124]], label: { x: 128, y: 150, anchor: 'start' } },
  { id: 'synsent-syn', points: [[562, 230], [218, 230]], label: { x: 390, y: 210, anchor: 'middle' } },
  { id: 'synsent-synack', points: [[600, 242], [458, 312]], label: { x: 548, y: 290, anchor: 'start' } },
  { id: 'synrcvd-ack', points: [[190, 242], [322, 312]], label: { x: 236, y: 290, anchor: 'end' } },
  { id: 'synrcvd-close', points: [[120, 242], [120, 398]], label: { x: 112, y: 315, anchor: 'end' } },
  { id: 'estab-close', points: [[322, 330], [210, 398]], label: { x: 274, y: 346, anchor: 'end' } },
  { id: 'estab-fin', points: [[458, 330], [570, 398]], label: { x: 506, y: 346, anchor: 'start' } },
  { id: 'fw1-ack', points: [[150, 432], [150, 493]], label: { x: 158, y: 462, anchor: 'start' } },
  { id: 'fw1-fin', points: [[218, 425], [330, 493]], label: { x: 290, y: 440, anchor: 'start' } },
  { id: 'fw1-finack', points: [[82, 415], [40, 415], [40, 612], [322, 612]], label: { x: 48, y: 560, anchor: 'start' } },
  { id: 'fw2-fin', points: [[190, 527], [322, 594]], label: { x: 268, y: 548, anchor: 'start' } },
  { id: 'closewait-close', points: [[630, 432], [630, 493]], label: { x: 638, y: 462, anchor: 'start' } },
  { id: 'closing-ack', points: [[390, 527], [390, 588]], label: { x: 398, y: 552, anchor: 'start' } },
  { id: 'lastack-ack', points: [[640, 527], [640, 588]], label: { x: 648, y: 552, anchor: 'start' } },
  { id: 'timewait-timeout', points: [[458, 605], [572, 605]], label: { x: 515, y: 582, anchor: 'middle' } },
];
