import type { LayerDef, LayerInstance } from '../schema';
import { buildStruct } from '../lib/build';
import { ascii, concat, hexBytes } from '../lib/encode';

// WebSocket framing: RFC 6455 section 5.2.

const S = { rfc: 6455, section: '5.2' };

export const wsFrameDef: LayerDef = {
  id: 'ws-frame',
  name: 'WebSocket frame',
  short: 'WS frame',
  osi: [7],
  tcpip: 'application',
  about:
    'After the HTTP upgrade, both sides exchange frames on the same TCP connection. A frame header is 2 to 14 octets: flags, an opcode, a mask bit and a payload length that grows in two steps (7 bits, or 16 or 64 more bits). Frames from the client must be masked; frames from the server must not.',
  fields: [
    { id: 'fin', name: 'FIN', short: 'FIN', bits: 1, about: '1 = this is the final fragment of a message. A message can be split into several frames.', source: S },
    { id: 'rsv1', name: 'RSV1', short: 'R1', bits: 1, about: 'Reserved for extensions, for example permessage-deflate (RFC 7692). 0 here.', source: S },
    { id: 'rsv2', name: 'RSV2', short: 'R2', bits: 1, about: 'Reserved, 0.', source: S },
    { id: 'rsv3', name: 'RSV3', short: 'R3', bits: 1, about: 'Reserved, 0.', source: S },
    { id: 'opcode', name: 'opcode', bits: 4, about: '1 = text, 2 = binary, 0 = continuation; control frames: 8 = close, 9 = ping, 10 = pong.', source: S },
    { id: 'mask', name: 'MASK', short: 'M', bits: 1, about: '1 = the payload is masked and a 4-octet masking key follows. Set on every frame from the client.', source: S },
    {
      id: 'len',
      name: 'Payload len',
      bits: 7,
      about: '0 to 125: the payload length. 126: a 16-bit length follows. 127: a 64-bit length follows.',
      source: S,
    },
    { id: 'extLen', name: 'Extended payload length', bits: 'variable', about: 'Present only if Payload len is 126 or 127.', source: S },
    {
      id: 'maskKey',
      name: 'Masking-key',
      bits: 'variable',
      about: '32 random bits chosen by the client for each frame. Present only when MASK is 1.',
      source: { rfc: 6455, section: '5.3' },
    },
    {
      id: 'payload',
      name: 'Payload data',
      bits: 'variable',
      about: 'The data. When masked, octet i is XORed with octet (i mod 4) of the masking key; the receiver applies the same XOR to get the original back.',
      source: { rfc: 6455, section: '5.3' },
    },
  ],
  sources: [S, { rfc: 6455, section: '5.3' }, { rfc: 6455, section: '5.5' }],
};

const OPCODES: Record<number, string> = { 1: 'text', 2: 'binary', 8: 'close', 9: 'ping', 10: 'pong' };

export function mask(data: Uint8Array, key: Uint8Array): Uint8Array {
  return data.map((b, i) => b ^ key[i % 4]);
}

/** Payload of a Close frame: 2-octet status code and an optional UTF-8 reason. */
export function closePayload(code: number, reason: string): Uint8Array {
  return concat(Uint8Array.of(code >> 8, code & 0xff), ascii(reason));
}

export function wsFrame(p: { opcode: number; payload: Uint8Array; display: string; maskKey?: Uint8Array }): LayerInstance {
  if (p.payload.length > 125) throw new Error('wsFrame: only short frames are used in the examples');
  const masked = p.maskKey ? mask(p.payload, p.maskKey) : p.payload;
  const name = OPCODES[p.opcode];
  return buildStruct(
    wsFrameDef,
    {
      fin: { raw: 1, display: '1' },
      rsv1: { raw: 0, display: '0' },
      rsv2: { raw: 0, display: '0' },
      rsv3: { raw: 0, display: '0' },
      opcode: { raw: p.opcode, display: `${p.opcode} (${name})` },
      mask: { raw: p.maskKey ? 1 : 0, display: p.maskKey ? '1 (masked)' : '0' },
      len: { raw: p.payload.length, display: String(p.payload.length) },
      extLen: { raw: new Uint8Array(0), display: 'not present' },
      maskKey: p.maskKey ? { raw: p.maskKey, display: hexBytes(p.maskKey) } : { raw: new Uint8Array(0), display: 'not present' },
      payload: {
        raw: masked,
        display: p.payload.length === 0 ? '(empty)' : p.maskKey ? `${p.display} (on the wire, masked: ${hexBytes(masked)})` : p.display,
      },
    },
    {},
    `${name}${p.maskKey ? ', masked' : ''}, ${p.payload.length} octets`,
  );
}
