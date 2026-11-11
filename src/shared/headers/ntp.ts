import type { LayerDef, LayerInstance } from '../schema';
import { buildStruct, type Annotations } from '../lib/build';
import { hex, parseIpv4 } from '../lib/encode';

// NTP packet header: RFC 5905 section 7.3. Timestamp formats: section 6.

const S73 = { rfc: 5905, section: '7.3' };

const timestamp = (id: string, name: string, about: string) => ({
  id,
  name,
  bits: 64,
  about: `${about} NTP timestamp format: 32 bits of seconds since 1900-01-01 00:00 UTC and 32 bits of fraction (units of 2^-32 s, about 233 ps).`,
  source: S73,
});

export const ntpDef: LayerDef = {
  id: 'ntp',
  name: 'NTP packet',
  short: 'NTP',
  osi: [7],
  tcpip: 'application',
  about:
    'The NTP header is 48 octets, the same for requests and responses. Four timestamps carry the whole measurement: when the request left the client, when it arrived at the server, when the response left the server, and (not in the packet, but noted by the client) when it arrived back. From these the client computes its clock offset and the round-trip delay. Optional extension fields and a message authentication code can follow; they are not used here.',
  fields: [
    {
      id: 'li',
      name: 'LI',
      bits: 2,
      about: 'Leap Indicator: 0 = no warning, 1 = last minute of the day has 61 seconds, 2 = it has 59 seconds, 3 = clock not synchronized.',
      source: S73,
    },
    { id: 'vn', name: 'VN', bits: 3, about: 'Version Number: 4 for NTPv4. A server answers with the version of the request.', source: S73 },
    { id: 'mode', name: 'Mode', bits: 3, about: '3 = client, 4 = server. Other modes are used between peers (1, 2), for broadcast (5) and for control messages (6, 7).', source: S73 },
    {
      id: 'stratum',
      name: 'Stratum',
      bits: 8,
      about: 'Distance from a reference clock: 1 = attached directly (GPS, atomic clock), 2 = synchronized to a stratum 1 server, and so on up to 15. 16 = unsynchronized. 0 = unspecified, or a Kiss-o\'-Death message.',
      source: S73,
    },
    { id: 'poll', name: 'Poll', bits: 8, about: 'Maximum interval between successive messages, as a power of two in seconds (signed). 6 means 64 s.', source: S73 },
    {
      id: 'precision',
      name: 'Precision',
      bits: 8,
      about: 'Precision of the sender clock, as a power of two in seconds (signed). -23 means about 119 ns.',
      source: S73,
    },
    {
      id: 'rootDelay',
      name: 'Root Delay',
      bits: 32,
      about: 'Total round-trip delay from this server to its reference clock, in NTP short format (16 bits seconds, 16 bits fraction).',
      source: S73,
    },
    {
      id: 'rootDisp',
      name: 'Root Dispersion',
      bits: 32,
      about: 'Total error the server could have relative to its reference clock, in NTP short format. Together with Root Delay it tells the client how much to trust this server.',
      source: S73,
    },
    {
      id: 'refid',
      name: 'Reference ID',
      bits: 32,
      about:
        'Identifies the source of the server time. For stratum 1 a four-character code such as "GPS" or "PPS". For stratum 2 and higher over IPv4 the address of the upstream server, which lets servers detect timing loops.',
      source: S73,
    },
    timestamp('refTs', 'Reference Timestamp', 'When the server clock was last set or corrected.'),
    timestamp('orgTs', 'Origin Timestamp', 'In a response: the Transmit Timestamp of the request, copied by the server (T1). The client checks it to match the response to its request.'),
    timestamp('recTs', 'Receive Timestamp', 'In a response: when the request arrived at the server (T2), by the server clock.'),
    timestamp('xmtTs', 'Transmit Timestamp', 'When this packet left the sender, by the sender clock. In a request T1, in a response T3.'),
  ],
  sources: [{ rfc: 5905 }],
};

/** Time as whole Unix seconds plus microseconds, so the fraction is exact. */
export interface Instant {
  unix: number;
  us: number;
}

const NTP_EPOCH_OFFSET = 2208988800n;

/** Shows a 64-bit NTP timestamp as a date in era 0, to the microsecond. */
export function ntpTimestampDisplay(raw: bigint): string {
  if (raw === 0n) return '0 (not set)';
  let secs = raw >> 32n;
  let us = ((raw & 0xffffffffn) * 1000000n + (1n << 31n)) >> 32n;
  if (us === 1000000n) {
    secs += 1n;
    us = 0n;
  }
  const iso = new Date(Number(secs - NTP_EPOCH_OFFSET) * 1000).toISOString().replace('T', ' ').replace('.000Z', '');
  return `${iso}.${String(us).padStart(6, '0')} UTC (${hex(raw, 16)})`;
}

function ntpTimestamp(t: Instant | null): { raw: bigint; display: string } {
  if (!t) return { raw: 0n, display: ntpTimestampDisplay(0n) };
  const secs = BigInt(t.unix) + NTP_EPOCH_OFFSET;
  const frac = (BigInt(t.us) << 32n) / 1000000n;
  const raw = (secs << 32n) | frac;
  return { raw, display: ntpTimestampDisplay(raw) };
}

/** NTP short format: 16 bits of seconds and 16 bits of fraction. */
export const ntpShortDisplay = (raw: number) => `${hex(raw, 8)} (${(raw / 65536).toFixed(4)} s)`;

function short(seconds: number): { raw: number; display: string } {
  const raw = Math.round(seconds * 65536);
  return { raw, display: ntpShortDisplay(raw) };
}

function signed8(n: number) {
  return n < 0 ? 256 + n : n;
}

/** RFC 5905 Figure 9. */
export const NTP_LI = ['0 (no warning)', '1 (61 s minute)', '2 (59 s minute)', '3 (not synchronized)'];
/** RFC 5905 Figure 10. */
export const NTP_MODES = ['reserved', 'symmetric active', 'symmetric passive', 'client', 'server', 'broadcast', 'NTP control message', 'reserved for private use'];

/** RFC 5905 Figure 11. */
export function ntpStratumDisplay(stratum: number): string {
  if (stratum === 0) return '0 (unspecified)';
  if (stratum === 1) return '1 (primary server)';
  if (stratum <= 15) return `${stratum} (secondary server)`;
  return stratum === 16 ? '16 (unsynchronized)' : `${stratum} (reserved)`;
}

/** Poll as a signed power of two in seconds. */
export const ntpPollDisplay = (poll: number) => `${poll} (${2 ** poll} s)`;

/** Precision as a signed power of two in seconds, with the value in a readable unit. */
export function ntpPrecisionDisplay(precision: number): string {
  if (precision === 0) return '0';
  const s = 2 ** precision;
  const approx = s < 1e-6 ? `${Math.round(s * 1e9)} ns` : s < 1e-3 ? `${+(s * 1e6).toPrecision(3)} us` : s < 1 ? `${+(s * 1e3).toPrecision(3)} ms` : `${s} s`;
  return `${precision} (about ${approx})`;
}

export interface NtpParams extends Annotations {
  li: number;
  vn: number;
  mode: 3 | 4;
  stratum: number;
  poll: number;
  precision: number;
  rootDelay: number;
  rootDisp: number;
  /** IPv4 address for stratum 2 and higher, or null for zero. */
  refid: string | null;
  refTs: Instant | null;
  orgTs: Instant | null;
  recTs: Instant | null;
  xmtTs: Instant | null;
}

export function ntp(p: NtpParams): LayerInstance {
  return buildStruct(
    ntpDef,
    {
      li: { raw: p.li, display: NTP_LI[p.li] },
      vn: { raw: p.vn, display: String(p.vn) },
      mode: { raw: p.mode, display: `${p.mode} (${NTP_MODES[p.mode]})` },
      stratum: { raw: p.stratum, display: ntpStratumDisplay(p.stratum) },
      poll: { raw: signed8(p.poll), display: ntpPollDisplay(p.poll) },
      precision: { raw: signed8(p.precision), display: ntpPrecisionDisplay(p.precision) },
      rootDelay: short(p.rootDelay),
      rootDisp: short(p.rootDisp),
      refid: p.refid ? { raw: parseIpv4(p.refid), display: p.refid } : { raw: 0, display: '0' },
      refTs: ntpTimestamp(p.refTs),
      orgTs: ntpTimestamp(p.orgTs),
      recTs: ntpTimestamp(p.recTs),
      xmtTs: ntpTimestamp(p.xmtTs),
    },
    p,
    `NTPv${p.vn} ${NTP_MODES[p.mode]}, stratum ${p.stratum}`,
  );
}
