import type { FieldDef, LayerDef, LayerInstance, Source, StructInstance } from '../schema';
import { buildStruct, type Annotations } from '../lib/build';
import { hex, internetChecksum } from '../lib/encode';

// ICMP messages share Type, Code and Checksum; the rest of the layout depends on the type.
// Each layout is its own LayerDef so the header diagram shows the right fields.

const RFC792: Source = { rfc: 792 };

const OSI_NOTE =
  'ICMP travels inside an IP packet (protocol 1), which makes it look like a layer above IP. It is still counted as part of the network layer: RFC 792 calls it an integral part of IP, and it only exists to report on IP delivery.';

const ABOUT =
  'The Internet Control Message Protocol carries error reports and diagnostics for IP. Routers and hosts send ICMP messages back to the source of a packet when something goes wrong (destination unreachable, TTL expired, packet too big). Ping and traceroute are built on it. ICMP errors are never sent about ICMP errors, to avoid loops.';

const typeField = (about: string): FieldDef => ({ id: 'type', name: 'Type', bits: 8, about, source: RFC792 });
const codeField = (about: string): FieldDef => ({ id: 'code', name: 'Code', bits: 8, about, source: RFC792 });
const checksumField: FieldDef = {
  id: 'checksum',
  name: 'Checksum',
  bits: 16,
  about: 'Internet checksum over the whole ICMP message, starting at the Type field. Unlike TCP and UDP there is no pseudo-header. The value shown is computed for this example.',
  source: RFC792,
};
const originalField: FieldDef = {
  id: 'original',
  name: 'Internet Header + Original Data',
  bits: 'variable',
  compact: true,
  about:
    'The start of the packet that caused the error, as it arrived. RFC 792 requires the IP header plus the first 8 octets of its data, which is enough for the source to find the TCP or UDP ports and match the error to a connection or socket. RFC 1812 asks routers to include as much as fits into a 576-octet ICMP packet; this example does that.',
  source: { rfc: 1812, section: '4.3.2.3' },
};

export const icmpEchoDef: LayerDef = {
  id: 'icmp-echo',
  name: 'ICMP Echo message',
  short: 'ICMP',
  osi: [3],
  tcpip: 'internet',
  osiNote: OSI_NOTE,
  about: `${ABOUT} Echo Request (type 8) asks the destination to answer; it replies with an Echo Reply (type 0) that carries the same identifier, sequence number and data.`,
  fields: [
    typeField('8 = Echo Request, 0 = Echo Reply.'),
    codeField('Always 0 for echo messages.'),
    checksumField,
    {
      id: 'identifier',
      name: 'Identifier',
      bits: 16,
      about: 'Chosen by the sender to match replies to the ping process that sent the request, like a port number. Copied into the reply.',
      source: RFC792,
    },
    {
      id: 'sequence',
      name: 'Sequence Number',
      bits: 16,
      about: 'Counts the requests of one ping run, so the sender can match each reply and detect losses. Copied into the reply.',
      source: RFC792,
    },
    {
      id: 'data',
      name: 'Data',
      bits: 'variable',
      compact: true,
      about: 'Arbitrary data, returned unchanged in the reply. Linux ping puts a timestamp at the start to measure the round-trip time without keeping state.',
      source: RFC792,
    },
  ],
  sources: [RFC792, { rfc: 1122, section: '3.2.2.6' }],
};

export const icmpTimeExceededDef: LayerDef = {
  id: 'icmp-time-exceeded',
  name: 'ICMP Time Exceeded message',
  short: 'ICMP',
  osi: [3],
  tcpip: 'internet',
  osiNote: OSI_NOTE,
  about: `${ABOUT} Time Exceeded (type 11) is sent by a router that dropped a packet because its TTL reached zero (code 0), or by a host that gave up reassembling fragments (code 1). Traceroute relies on code 0.`,
  fields: [
    typeField('11 = Time Exceeded.'),
    codeField('0 = time to live exceeded in transit, 1 = fragment reassembly time exceeded.'),
    checksumField,
    { id: 'unused', name: 'Unused', bits: 32, about: 'Must be zero.', source: RFC792 },
    originalField,
  ],
  sources: [RFC792, { rfc: 1812, section: '4.3.2' }],
};

export const icmpDestUnreachableDef: LayerDef = {
  id: 'icmp-dest-unreachable',
  name: 'ICMP Destination Unreachable message',
  short: 'ICMP',
  osi: [3],
  tcpip: 'internet',
  osiNote: OSI_NOTE,
  about: `${ABOUT} Destination Unreachable (type 3) says why a packet could not be delivered: for example code 1 host unreachable, code 3 port unreachable (a host received a UDP datagram for a port nobody listens on).`,
  fields: [
    typeField('3 = Destination Unreachable.'),
    codeField('0 net, 1 host, 2 protocol, 3 port unreachable, 4 fragmentation needed and DF set, 13 communication administratively prohibited (RFC 1812).'),
    checksumField,
    { id: 'unused', name: 'Unused', bits: 32, about: 'Must be zero for this code.', source: RFC792 },
    originalField,
  ],
  sources: [RFC792, { rfc: 1122, section: '3.2.2.1' }],
};

export const icmpFragNeededDef: LayerDef = {
  id: 'icmp-frag-needed',
  name: 'ICMP Destination Unreachable, Fragmentation Needed',
  short: 'ICMP',
  osi: [3],
  tcpip: 'internet',
  osiNote: OSI_NOTE,
  about: `${ABOUT} With code 4 a router reports that a packet was too big for the next link but had DF set, so it could not be fragmented. RFC 1191 added the MTU of that link to the message, which is what Path MTU Discovery uses.`,
  fields: [
    typeField('3 = Destination Unreachable.'),
    codeField('4 = fragmentation needed and DF set.'),
    checksumField,
    { id: 'unused', name: 'Unused', bits: 16, about: 'Must be zero.', source: { rfc: 1191, section: '4' } },
    {
      id: 'nextHopMtu',
      name: 'Next-Hop MTU',
      bits: 16,
      about: 'MTU of the link the packet could not be sent on. The source lowers its estimate of the path MTU to this value. Routers from before RFC 1191 send 0 here.',
      source: { rfc: 1191, section: '4' },
    },
    originalField,
  ],
  sources: [RFC792, { rfc: 1191 }],
};

// ---- builders

function finish(def: LayerDef, fields: (checksum: number) => Record<string, { raw: number | Uint8Array; display: string; items?: StructInstance[] }>, ann: Annotations, summary: string): LayerInstance {
  const draft = buildStruct(def, fields(0));
  const checksum = internetChecksum(draft.bytes);
  return buildStruct(def, fields(checksum), ann, summary);
}

export interface IcmpEchoParams extends Annotations {
  kind: 'request' | 'reply';
  identifier: number;
  sequence: number;
  data: Uint8Array;
  dataDisplay: string;
}

export function icmpEcho(p: IcmpEchoParams): LayerInstance {
  const type = p.kind === 'request' ? 8 : 0;
  return finish(
    icmpEchoDef,
    (checksum) => ({
      type: { raw: type, display: `${type} (Echo ${p.kind === 'request' ? 'Request' : 'Reply'})` },
      code: { raw: 0, display: '0' },
      checksum: { raw: checksum, display: hex(checksum, 4) },
      identifier: { raw: p.identifier, display: `${hex(p.identifier, 4)} (${p.identifier})` },
      sequence: { raw: p.sequence, display: String(p.sequence) },
      data: { raw: p.data, display: p.dataDisplay },
    }),
    p,
    `Echo ${p.kind}, id ${hex(p.identifier, 4)}, seq ${p.sequence}`,
  );
}

/** Maximum size of an ICMP error packet including the IP header, RFC 1812 section 4.3.2.3. */
const MAX_ERROR_PACKET = 576;

export interface IcmpErrorParams extends Annotations {
  kind: 'time-exceeded' | 'port-unreachable' | 'frag-needed';
  /** The offending IP datagram as it arrived, starting with its IP header. */
  original: Uint8Array;
  /** Decoded structures of the original, shown as the contents of the quote. */
  originalItems: StructInstance[];
  nextHopMtu?: number;
}

export function icmpError(p: IcmpErrorParams): LayerInstance {
  const quoteLen = Math.min(p.original.length, MAX_ERROR_PACKET - 20 - 8);
  const quote = p.original.subarray(0, quoteLen);
  const quoteDisplay = `${quoteLen} octets of the original packet${quoteLen < p.original.length ? ` (of ${p.original.length})` : ' (all of it)'}`;
  const common = (checksum: number) => ({
    checksum: { raw: checksum, display: hex(checksum, 4) },
    original: { raw: quote, display: quoteDisplay, items: p.originalItems },
  });
  switch (p.kind) {
    case 'time-exceeded':
      return finish(
        icmpTimeExceededDef,
        (c) => ({
          type: { raw: 11, display: '11 (Time Exceeded)' },
          code: { raw: 0, display: '0 (TTL exceeded in transit)' },
          unused: { raw: 0, display: '0' },
          ...common(c),
        }),
        p,
        'Time Exceeded, TTL exceeded in transit',
      );
    case 'port-unreachable':
      return finish(
        icmpDestUnreachableDef,
        (c) => ({
          type: { raw: 3, display: '3 (Destination Unreachable)' },
          code: { raw: 3, display: '3 (Port unreachable)' },
          unused: { raw: 0, display: '0' },
          ...common(c),
        }),
        p,
        'Destination Unreachable, port unreachable',
      );
    case 'frag-needed':
      return finish(
        icmpFragNeededDef,
        (c) => ({
          type: { raw: 3, display: '3 (Destination Unreachable)' },
          code: { raw: 4, display: '4 (Fragmentation needed and DF set)' },
          unused: { raw: 0, display: '0' },
          nextHopMtu: { raw: p.nextHopMtu ?? 0, display: String(p.nextHopMtu ?? 0) },
          ...common(c),
        }),
        p,
        `Fragmentation needed, next-hop MTU ${p.nextHopMtu}`,
      );
  }
}

