import type { FieldDef, LayerDef, LayerInstance, Source } from '../schema';
import { buildStruct, type Annotations } from '../lib/build';
import { hex, hexBytes } from '../lib/encode';

// QUIC version 1: RFC 9000 (packets section 17, variable-length integers section 16),
// RFC 9001 (packet protection with TLS).

const OSI_NOTE =
  'QUIC is a transport protocol (like TCP: streams, reliability, congestion control) that runs on top of UDP and includes TLS 1.3 for encryption. It covers parts of OSI layers 4 to 6 at once; it is shown at layer 4 here.';

const Q = (section: string): Source => ({ rfc: 9000, section });

const protectedNote = 'Protected by header protection (RFC 9001 section 5.4): on the wire these bits are XORed with a mask derived from the encrypted payload, so the value shown is not the real one.';

const commonLong: FieldDef[] = [
  { id: 'form', name: 'Header Form', short: 'F', bits: 1, about: '1 = long header, used during the handshake.', source: Q('17.2') },
  { id: 'fixed', name: 'Fixed Bit', short: 'X', bits: 1, about: 'Always 1. Lets QUIC share a UDP port with other protocols that set this bit to 0.', source: Q('17.2') },
  { id: 'type', name: 'Long Packet Type', bits: 2, about: '0 = Initial, 1 = 0-RTT, 2 = Handshake, 3 = Retry.', source: Q('17.2') },
  { id: 'protectedBits', name: 'Reserved Bits, Packet Number Length', bits: 4, about: `Two reserved bits and the length of the packet number minus one. ${protectedNote}`, source: Q('17.2') },
  { id: 'version', name: 'Version', bits: 32, about: '0x00000001 = QUIC version 1 (RFC 9000).', source: Q('17.2') },
  { id: 'dcidLen', name: 'Destination Connection ID Length', bits: 8, about: 'Length of the following connection ID in octets.', source: Q('17.2') },
  {
    id: 'dcid',
    name: 'Destination Connection ID',
    bits: 'variable',
    about: 'Identifies the connection at the receiver. Not the address and port: a QUIC connection survives a change of IP address (for example from Wi-Fi to mobile data), because the connection ID stays.',
    source: Q('5.1'),
  },
  { id: 'scidLen', name: 'Source Connection ID Length', bits: 8, about: 'Length of the following connection ID in octets.', source: Q('17.2') },
  { id: 'scid', name: 'Source Connection ID', bits: 'variable', about: 'The connection ID the sender wants the peer to use as Destination Connection ID from now on.', source: Q('7.2') },
  { id: 'tokenLen', name: 'Token Length', bits: 'variable', about: 'Initial packets only: length of the token, a variable-length integer. Empty in a first contact.', source: Q('17.2.2') },
  { id: 'token', name: 'Token', bits: 'variable', about: 'Initial packets only: an address validation token from a Retry or an earlier connection.', source: Q('17.2.2') },
  { id: 'length', name: 'Length', bits: 'variable', about: 'Length of the packet number and the payload, as a variable-length integer (the first two bits give its size: 1, 2, 4 or 8 octets).', source: Q('16') },
  { id: 'pn', name: 'Packet Number', bits: 'variable', about: `1 to 4 octets. ${protectedNote}`, source: Q('17.1') },
  {
    id: 'payload',
    name: 'Packet Payload',
    bits: 'variable',
    compact: true,
    about: 'QUIC frames (CRYPTO, ACK, STREAM, PADDING, ...), encrypted with AEAD and followed by a 16-octet tag. The octets shown are random stand-ins, not real ciphertext.',
    source: { rfc: 9001, section: '5' },
  },
];

export const longDef: LayerDef = {
  id: 'quic-long',
  name: 'QUIC long header packet',
  short: 'QUIC',
  osi: [4],
  osiNote: OSI_NOTE,
  tcpip: 'transport',
  about:
    'Long header packets carry the handshake. They name the version and both connection IDs. Initial packets are encrypted with keys derived from the Destination Connection ID, which anyone can compute: this protects against tampering by middleboxes, not against observers. Handshake packets use real handshake keys.',
  fields: commonLong,
  sources: [Q('17.2'), Q('17.2.2'), Q('17.2.4'), { rfc: 9001, section: '5.2' }],
};

export const shortDef: LayerDef = {
  id: 'quic-short',
  name: 'QUIC short header packet (1-RTT)',
  short: 'QUIC',
  osi: [4],
  osiNote: OSI_NOTE,
  tcpip: 'transport',
  about: 'After the handshake, packets use the short header: no version, no source connection ID, and no length (the packet fills the rest of the datagram). Everything except the connection ID is protected.',
  fields: [
    { id: 'form', name: 'Header Form', short: 'F', bits: 1, about: '0 = short header.', source: Q('17.3.1') },
    { id: 'fixed', name: 'Fixed Bit', short: 'X', bits: 1, about: 'Always 1.', source: Q('17.3.1') },
    { id: 'spin', name: 'Spin Bit', short: 'S', bits: 1, about: 'Optional: flips once per round trip, so network operators can measure latency without seeing anything else.', source: Q('17.4') },
    { id: 'protectedBits', name: 'Reserved Bits, Key Phase, Packet Number Length', bits: 5, about: `Two reserved bits, the key phase (for key updates) and the packet number length. ${protectedNote}`, source: Q('17.3.1') },
    { id: 'dcid', name: 'Destination Connection ID', bits: 'variable', about: 'The connection ID chosen by the receiver. Its length is not sent; the receiver knows it.', source: Q('17.3.1') },
    { id: 'pn', name: 'Packet Number', bits: 'variable', about: `1 to 4 octets. ${protectedNote}`, source: Q('17.1') },
    commonLong[commonLong.length - 1],
  ],
  sources: [Q('17.3.1'), { rfc: 9001, section: '5' }],
};

/** Variable-length integer, RFC 9000 section 16. */
export function varint(n: number): Uint8Array {
  if (n < 64) return Uint8Array.of(n);
  if (n < 16384) return Uint8Array.of(0x40 | (n >> 8), n & 0xff);
  if (n < 2 ** 30) return Uint8Array.of(0x80 | (n >>> 24), (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff);
  throw new Error('varint: value too large for this example');
}

const TYPES = ['Initial', '0-RTT', 'Handshake', 'Retry'];

export interface LongParams extends Annotations {
  type: 0 | 2;
  dcid: Uint8Array;
  scid: Uint8Array;
  pnLen: number;
  /** Encrypted payload including the 16-octet tag; length is taken from it. */
  payload: Uint8Array;
  /** What the encrypted payload contains, for the display. */
  contents: string;
  /** Random octets standing in for the protected header bits and packet number. */
  mask: Uint8Array;
}

const cid = (b: Uint8Array) => ({ raw: b, display: hexBytes(b) });

export function longPacket(p: LongParams): LayerInstance {
  const initial = p.type === 0;
  const length = p.pnLen + p.payload.length;
  return buildStruct(
    longDef,
    {
      form: { raw: 1, display: '1 (long)' },
      fixed: { raw: 1, display: '1' },
      type: { raw: p.type, display: `${p.type} (${TYPES[p.type]})` },
      protectedBits: { raw: p.mask[0] & 0x0f, display: `${hex(p.mask[0] & 0x0f, 1)} (protected)` },
      version: { raw: 1, display: '0x00000001 (QUIC v1)' },
      dcidLen: { raw: p.dcid.length, display: String(p.dcid.length) },
      dcid: cid(p.dcid),
      scidLen: { raw: p.scid.length, display: String(p.scid.length) },
      scid: cid(p.scid),
      tokenLen: initial ? { raw: varint(0), display: '0 (no token)' } : { raw: new Uint8Array(0), display: 'not present in Handshake packets' },
      token: { raw: new Uint8Array(0), display: initial ? '(empty)' : 'not present' },
      length: { raw: varint(length), display: `${length} (${p.pnLen} packet number + ${p.payload.length} payload)` },
      pn: { raw: p.mask.subarray(1, 1 + p.pnLen), display: `${hexBytes(p.mask.subarray(1, 1 + p.pnLen))} (protected, ${p.pnLen} octet${p.pnLen > 1 ? 's' : ''})` },
      payload: { raw: p.payload, display: `${p.payload.length} octets encrypted: ${p.contents}, and the 16-octet tag` },
    },
    p,
    `${TYPES[p.type]}, ${7 + p.dcid.length + p.scid.length + (initial ? 1 : 0) + varint(length).length + length} octets`,
  );
}

export interface ShortParams extends Annotations {
  dcid: Uint8Array;
  pnLen: number;
  payload: Uint8Array;
  contents: string;
  mask: Uint8Array;
}

export function shortPacket(p: ShortParams): LayerInstance {
  return buildStruct(
    shortDef,
    {
      form: { raw: 0, display: '0 (short)' },
      fixed: { raw: 1, display: '1' },
      spin: { raw: 0, display: '0' },
      protectedBits: { raw: p.mask[0] & 0x1f, display: `${hex(p.mask[0] & 0x1f, 2)} (protected)` },
      dcid: cid(p.dcid),
      pn: { raw: p.mask.subarray(1, 1 + p.pnLen), display: `${hexBytes(p.mask.subarray(1, 1 + p.pnLen))} (protected, ${p.pnLen} octet${p.pnLen > 1 ? 's' : ''})` },
      payload: { raw: p.payload, display: `${p.payload.length} octets encrypted: ${p.contents}, and the 16-octet tag` },
    },
    p,
    `1-RTT, ${1 + p.dcid.length + p.pnLen + p.payload.length} octets`,
  );
}
