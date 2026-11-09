import type { LayerDef, LayerInstance, StructDef, StructInstance } from '../schema';
import { buildStruct, type Annotations } from '../lib/build';
import { concat, hex, internetChecksum, parseIpv4 } from '../lib/encode';

const FLAG_ABOUT: Record<string, string> = {
  CWR: 'Congestion Window Reduced: the sender has reduced its sending rate after an ECN echo (RFC 3168).',
  ECE: 'ECN-Echo: tells the peer that a packet arrived with a congestion mark; in a SYN it offers ECN (RFC 3168).',
  URG: 'The Urgent Pointer field is valid. Almost unused today; RFC 6093 advises new applications not to use it.',
  ACK: 'The Acknowledgment Number field is valid. Set in every segment after the initial SYN.',
  PSH: 'Push: deliver the data to the application without waiting for more. Senders usually set it on the last segment of a write.',
  RST: 'Reset: abort the connection immediately, for example when a segment arrives for a port with no listener.',
  SYN: 'Synchronize sequence numbers: only set in the first segment from each side. Occupies one sequence number.',
  FIN: 'No more data from the sender. Occupies one sequence number, so it is acknowledged like data.',
};

const FLAGS = ['CWR', 'ECE', 'URG', 'ACK', 'PSH', 'RST', 'SYN', 'FIN'] as const;
export type TcpFlag = (typeof FLAGS)[number];

export const tcpDef: LayerDef = {
  id: 'tcp',
  name: 'TCP header',
  short: 'TCP',
  osi: [4],
  tcpip: 'transport',
  about:
    'TCP turns the unreliable packet service of IP into a reliable, ordered byte stream between two applications, identified by IP address and port on each side. Every byte has a sequence number; the receiver acknowledges what it has received and the sender retransmits what is not acknowledged in time. TCP also does flow control (the receiver advertises how much it can buffer) and congestion control (the sender slows down when the network drops packets).',
  fields: [
    {
      id: 'srcPort',
      name: 'Source Port',
      bits: 16,
      about: 'Port of the sending application. Clients usually get a random ephemeral port from the operating system.',
      source: { rfc: 9293, section: '3.1' },
    },
    {
      id: 'dstPort',
      name: 'Destination Port',
      bits: 16,
      about: 'Port of the receiving application, for example 80 for HTTP, 443 for HTTPS.',
      source: { rfc: 9293, section: '3.1' },
    },
    {
      id: 'seq',
      name: 'Sequence Number',
      bits: 32,
      about:
        'Sequence number of the first data octet in this segment. In a SYN it is the Initial Sequence Number (ISN) and the first data octet will be ISN+1. SYN and FIN each count as one sequence number. Numbers wrap around at 2^32.',
      source: { rfc: 9293, section: '3.4' },
    },
    {
      id: 'ack',
      name: 'Acknowledgment Number',
      bits: 32,
      about:
        'If ACK is set: the next sequence number the sender of this segment expects to receive. This acknowledges everything before it (cumulative acknowledgment).',
      source: { rfc: 9293, section: '3.1' },
    },
    {
      id: 'dataOffset',
      name: 'Data Offset',
      short: 'DOff',
      bits: 4,
      about: 'Length of the TCP header in 32-bit words, so the receiver knows where data starts. 5 means no options (20 octets); the maximum 15 allows 40 octets of options.',
      source: { rfc: 9293, section: '3.1' },
    },
    {
      id: 'reserved',
      name: 'Reserved',
      short: 'Rsrvd',
      bits: 4,
      about: 'Reserved for future use, must be zero.',
      source: { rfc: 9293, section: '3.1' },
    },
    ...FLAGS.map((f) => ({
      id: `flag${f}`,
      name: f,
      short: f,
      bits: 1,
      about: FLAG_ABOUT[f],
      source: { rfc: 9293, section: '3.1' },
    })),
    {
      id: 'window',
      name: 'Window',
      bits: 16,
      about:
        'How many octets the sender of this segment is willing to receive, starting at the Acknowledgment Number (flow control). With the Window Scale option the value is shifted left by the negotiated factor, except in SYN segments, where it is never scaled.',
      source: { rfc: 9293, section: '3.1' },
    },
    {
      id: 'checksum',
      name: 'Checksum',
      bits: 16,
      about:
        'Internet checksum over a pseudo-header (source and destination IP address, protocol, TCP length), the TCP header and the data. Including the IP addresses detects segments delivered to the wrong host. The value shown is computed for this example.',
      source: { rfc: 9293, section: '3.1' },
    },
    {
      id: 'urgentPointer',
      name: 'Urgent Pointer',
      bits: 16,
      about: 'Only meaningful when URG is set. Zero here.',
      source: { rfc: 9293, section: '3.1' },
    },
    {
      id: 'options',
      name: 'Options',
      bits: 'variable',
      about: 'Optional extensions, each starting with a Kind octet. The options area is padded to a multiple of 32 bits.',
      source: { rfc: 9293, section: '3.2' },
    },
  ],
  sources: [{ rfc: 9293 }, { rfc: 7323 }, { rfc: 2018 }, { rfc: 3168 }],
};

// ---- options

function optionDef(id: string, name: string, about: string, source: StructDef['sources'][number], fields: StructDef['fields']): StructDef {
  return { id, name, about, fields, sources: [source] };
}

const kindField = (about: string) => ({ id: 'kind', name: 'Kind', bits: 8, about });
const lengthField = { id: 'length', name: 'Length', bits: 8, about: 'Length of the whole option in octets, including Kind and Length.' };

export const optEolDef = optionDef('tcp-opt-eol', 'End of Option List', 'Marks the end of the options; the rest of the options area is padding.', { rfc: 9293, section: '3.2' }, [
  kindField('0 = End of Option List.'),
]);

export const optNopDef = optionDef(
  'tcp-opt-nop',
  'No-Operation (NOP)',
  'A single filler octet. Senders use it to align the next option on a 32-bit boundary.',
  { rfc: 9293, section: '3.2' },
  [kindField('1 = No-Operation.')],
);

export const optMssDef = optionDef(
  'tcp-opt-mss',
  'Maximum Segment Size (MSS)',
  'The largest amount of data (not counting TCP and IP headers) the sender of this option is willing to receive in one segment. Only sent in SYN segments. On Ethernet with an MTU of 1500 it is typically 1500 - 20 (IPv4) - 20 (TCP) = 1460. Without the option, 536 is assumed.',
  { rfc: 9293, section: '3.7.1' },
  [kindField('2 = Maximum Segment Size.'), lengthField, { id: 'mss', name: 'Maximum Segment Size', bits: 16, about: 'Value in octets.' }],
);

export const optWsDef = optionDef(
  'tcp-opt-ws',
  'Window Scale (WS)',
  'The 16-bit Window field allows at most 65535 octets in flight, too little for fast long-distance links. Window Scale lets both sides shift the window left by up to 14 bits. Both must send it in their SYN, otherwise neither side scales. The factor applies to windows the sender of this option advertises.',
  { rfc: 7323, section: '2' },
  [kindField('3 = Window Scale.'), lengthField, { id: 'shift', name: 'shift.cnt', bits: 8, about: 'Shift count: the window is multiplied by 2^shift.cnt. Maximum 14.' }],
);

export const optSackPermDef = optionDef(
  'tcp-opt-sackperm',
  'SACK-Permitted',
  'Says "I understand Selective Acknowledgments". If both sides send it in their SYN, a receiver can report exactly which blocks arrived after a gap, so the sender only retransmits what is really missing.',
  { rfc: 2018, section: '2' },
  [kindField('4 = SACK-Permitted.'), lengthField],
);

export const optTsDef = optionDef(
  'tcp-opt-ts',
  'Timestamps (TS)',
  'The sender puts a timestamp from its own clock in TSval; the receiver echoes the most recent one it got in TSecr. This gives round-trip time measurements and Protection Against Wrapped Sequences (PAWS) on fast connections. The values are not wall-clock times; each host uses its own counter, often with a random per-connection offset.',
  { rfc: 7323, section: '3' },
  [
    kindField('8 = Timestamps.'),
    lengthField,
    { id: 'tsval', name: 'TSval', bits: 32, about: 'Timestamp Value: the current value of the sender clock.' },
    { id: 'tsecr', name: 'TSecr', bits: 32, about: 'Timestamp Echo Reply: the most recent TSval received from the peer. Zero in the initial SYN, which has nothing to echo.' },
  ],
);

export type TcpOption =
  | { kind: 'eol' }
  | { kind: 'nop' }
  | { kind: 'mss'; mss: number }
  | { kind: 'ws'; shift: number }
  | { kind: 'sackPerm' }
  | { kind: 'ts'; tsval: number; tsecr: number };

function buildOption(o: TcpOption): StructInstance {
  switch (o.kind) {
    case 'eol':
      return buildStruct(optEolDef, { kind: { raw: 0, display: '0' } }, {}, 'EOL');
    case 'nop':
      return buildStruct(optNopDef, { kind: { raw: 1, display: '1' } }, {}, 'NOP');
    case 'mss':
      return buildStruct(
        optMssDef,
        { kind: { raw: 2, display: '2' }, length: { raw: 4, display: '4' }, mss: { raw: o.mss, display: String(o.mss) } },
        {},
        `MSS ${o.mss}`,
      );
    case 'ws':
      return buildStruct(
        optWsDef,
        { kind: { raw: 3, display: '3' }, length: { raw: 3, display: '3' }, shift: { raw: o.shift, display: `${o.shift} (factor ${2 ** o.shift})` } },
        {},
        `WS ${o.shift}`,
      );
    case 'sackPerm':
      return buildStruct(optSackPermDef, { kind: { raw: 4, display: '4' }, length: { raw: 2, display: '2' } }, {}, 'SACK-Permitted');
    case 'ts':
      return buildStruct(
        optTsDef,
        {
          kind: { raw: 8, display: '8' },
          length: { raw: 10, display: '10' },
          tsval: { raw: o.tsval, display: String(o.tsval) },
          tsecr: { raw: o.tsecr, display: String(o.tsecr) },
        },
        {},
        `TS ${o.tsval}/${o.tsecr}`,
      );
  }
}

// ---- header builder

export interface TcpParams extends Annotations {
  srcPort: number;
  dstPort: number;
  seq: number;
  ack: number;
  flags: TcpFlag[];
  window: number;
  options?: TcpOption[];
}

export interface TcpContext {
  srcIp: string;
  dstIp: string;
}

export function tcp(p: TcpParams, ctx: TcpContext, payload: Uint8Array): LayerInstance {
  const opts = (p.options ?? []).map(buildOption);
  let optBytes = concat(...opts.map((o) => o.bytes));
  if (optBytes.length % 4 !== 0) optBytes = concat(optBytes, new Uint8Array(4 - (optBytes.length % 4)));
  if (optBytes.length > 40) throw new Error('TCP options longer than 40 octets');
  const dataOffset = 5 + optBytes.length / 4;
  const flagSet = new Set(p.flags);

  const fields = (checksum: number) => ({
    srcPort: { raw: p.srcPort, display: String(p.srcPort) },
    dstPort: { raw: p.dstPort, display: String(p.dstPort) },
    seq: { raw: p.seq, display: String(p.seq) },
    ack: { raw: p.ack, display: String(p.ack) },
    dataOffset: { raw: dataOffset, display: `${dataOffset} (${dataOffset * 4} octets)` },
    reserved: { raw: 0, display: '0' },
    ...Object.fromEntries(FLAGS.map((f) => [`flag${f}`, { raw: flagSet.has(f) ? 1 : 0, display: flagSet.has(f) ? '1' : '0' }])),
    window: { raw: p.window, display: String(p.window) },
    checksum: { raw: checksum, display: hex(checksum, 4) },
    urgentPointer: { raw: 0, display: '0' },
    options: {
      raw: optBytes,
      display: opts.length ? opts.map((o) => o.summary).join(', ') : 'none',
      ...(opts.length ? { items: opts } : {}),
    },
  });

  const draft = buildStruct(tcpDef, fields(0));
  const tcpLength = draft.bytes.length + payload.length;
  const pseudo = concat(parseIpv4(ctx.srcIp), parseIpv4(ctx.dstIp), Uint8Array.of(0, 6, tcpLength >> 8, tcpLength & 0xff));
  const checksum = internetChecksum(concat(pseudo, draft.bytes, payload));
  const flagText = FLAGS.filter((f) => flagSet.has(f)).join(', ');
  return buildStruct(tcpDef, fields(checksum), p, `${p.srcPort} to ${p.dstPort}, [${flagText}]`);
}
