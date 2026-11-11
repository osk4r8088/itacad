import type { Source } from '../../shared/schema';

// ---- units

export interface Unit {
  id: string;
  /** Size in bits. */
  bits: number;
  kind: 'bit' | 'decimal' | 'binary';
}

const unit = (id: string, bits: number, kind: Unit['kind']): Unit => ({ id, bits, kind });

/** Data units. Decimal prefixes are powers of 1000 (SI), binary prefixes powers of 1024 (IEC 80000-13). */
export const UNITS: Unit[] = [
  unit('bit', 1, 'bit'),
  unit('kbit', 1e3, 'bit'),
  unit('Mbit', 1e6, 'bit'),
  unit('Gbit', 1e9, 'bit'),
  unit('Tbit', 1e12, 'bit'),
  unit('B', 8, 'decimal'),
  unit('kB', 8e3, 'decimal'),
  unit('MB', 8e6, 'decimal'),
  unit('GB', 8e9, 'decimal'),
  unit('TB', 8e12, 'decimal'),
  unit('KiB', 8 * 1024, 'binary'),
  unit('MiB', 8 * 1024 ** 2, 'binary'),
  unit('GiB', 8 * 1024 ** 3, 'binary'),
  unit('TiB', 8 * 1024 ** 4, 'binary'),
];

export const unitById = (id: string) => UNITS.find((u) => u.id === id)!;

/** Rates use decimal prefixes only: 1 Mbit/s is 1,000,000 bit/s. */
export const RATES = [
  { id: 'kbit/s', bps: 1e3 },
  { id: 'Mbit/s', bps: 1e6 },
  { id: 'Gbit/s', bps: 1e9 },
];

export function convert(value: number, from: string): { id: string; value: number; kind: Unit['kind'] }[] {
  const bits = value * unitById(from).bits;
  return UNITS.map((u) => ({ id: u.id, value: bits / u.bits, kind: u.kind }));
}

/** Readable number: up to 4 significant digits, thousands separators, no exponent for everyday sizes. */
export function num(v: number): string {
  if (v === 0) return '0';
  if (Math.abs(v) >= 1e15 || Math.abs(v) < 1e-6) return v.toExponential(3);
  const digits = Math.abs(v) >= 1000 ? 0 : Math.max(0, 3 - Math.floor(Math.log10(Math.abs(v))));
  return v.toLocaleString('en-US', { maximumFractionDigits: digits });
}

export function duration(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'never';
  if (seconds < 1e-3) return `${num(seconds * 1e6)} µs`;
  if (seconds < 1) return `${num(seconds * 1e3)} ms`;
  if (seconds < 120) return `${num(seconds)} s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return h > 0 ? `${h} h ${m} min ${s} s` : `${m} min ${s} s`;
}

// ---- overhead

export interface Framing {
  mtu: number;
  ipv6: boolean;
  /** TCP timestamps option, 12 octets including padding, on every segment (RFC 7323). */
  timestamps: boolean;
  /** 802.1Q tag, 4 octets. */
  vlan: boolean;
}

/** Octets on the wire per full-sized segment, and the TCP payload it carries. */
export function perSegment(f: Framing) {
  const ip = f.ipv6 ? 40 : 20;
  const tcp = 20 + (f.timestamps ? 12 : 0);
  const payload = f.mtu - ip - tcp;
  const ethernet = 14 + (f.vlan ? 4 : 0) + 4; // header, optional tag, FCS
  const phy = 8 + 12; // preamble and SFD, interpacket gap
  const wire = f.mtu + ethernet + phy;
  return { payload, ip, tcp, ethernet, phy, wire, efficiency: payload / wire };
}

export function transfer(bytes: number, bps: number, f: Framing) {
  const seg = perSegment(f);
  const segments = Math.ceil(bytes / seg.payload);
  const raw = (bytes * 8) / bps;
  const withOverhead = (bytes * 8) / (bps * seg.efficiency);
  return { segments, raw, withOverhead, goodput: bps * seg.efficiency, seg };
}

// ---- window and round trip

/** Bandwidth-delay product in octets: how much data is "in flight" when the link is full. */
export const bdp = (bps: number, rttSeconds: number) => (bps * rttSeconds) / 8;

/** The smallest window scale shift that lets the window reach this many octets; undefined if more than RFC 7323 allows (14). */
export function scaleFor(windowBytes: number): number | undefined {
  for (let shift = 0; shift <= 14; shift++) if (65535 * 2 ** shift >= windowBytes) return shift;
  return undefined;
}

/** At most one window per round trip: throughput <= window / RTT (RFC 6349 section 3.3.1). */
export const windowLimit = (windowBytes: number, rttSeconds: number) => (windowBytes * 8) / rttSeconds;

export const SOURCES: Source[] = [
  { spec: 'IEC 80000-13:2008', note: 'binary prefixes kibi, mebi, gibi' },
  { rfc: 6349, section: '3.3.1', note: 'minimum TCP window from the bandwidth-delay product' },
  { rfc: 6349, section: '4.1.1', note: 'maximum achievable TCP throughput with frame overhead' },
  { rfc: 7323, section: '2', note: 'TCP window scale option' },
  { rfc: 9293, section: '3.8.6', note: 'TCP window management' },
  { spec: 'IEEE 802.3-2022', note: 'preamble, SFD, frame format and the 96-bit interpacket gap' },
];
