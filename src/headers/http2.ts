import type { LayerDef, LayerInstance, StructDef, StructInstance } from '../schema';
import { buildStruct, type Annotations } from '../lib/build';
import { ascii, concat } from '../lib/encode';

// HTTP/2 framing: RFC 9113 section 4.1. HPACK: RFC 7541.

export const prefaceDef: LayerDef = {
  id: 'h2-preface',
  name: 'HTTP/2 connection preface',
  short: 'Preface',
  osi: [7],
  tcpip: 'application',
  about: 'The first 24 octets a client sends on an HTTP/2 connection. They look like a broken HTTP/1 request on purpose: an HTTP/1.1 server answers with an error instead of misreading HTTP/2 frames.',
  fields: [{ id: 'magic', name: 'Client magic', bits: 'variable', compact: true, about: 'PRI * HTTP/2.0 CR LF CR LF SM CR LF CR LF. It must be followed by a SETTINGS frame.', source: { rfc: 9113, section: '3.4' } }],
  sources: [{ rfc: 9113, section: '3.4' }],
};

export const frameDef: LayerDef = {
  id: 'h2-frame',
  name: 'HTTP/2 frame',
  short: 'H2 frame',
  osi: [7],
  tcpip: 'application',
  about:
    'Everything in HTTP/2 travels in frames with a 9-octet header: payload length, type, flags and a stream identifier. Each request and its response form a stream with its own number; frames of different streams can be interleaved on the one TCP connection.',
  fields: [
    { id: 'length', name: 'Length', bits: 24, about: 'Length of the frame payload in octets, not counting the 9-octet header. At most 16384 unless the receiver allows more with SETTINGS_MAX_FRAME_SIZE.', source: { rfc: 9113, section: '4.1' } },
    { id: 'type', name: 'Type', bits: 8, about: '0 DATA, 1 HEADERS, 3 RST_STREAM, 4 SETTINGS, 6 PING, 7 GOAWAY, 8 WINDOW_UPDATE, 9 CONTINUATION.', source: { rfc: 9113, section: '6' } },
    {
      id: 'flags',
      name: 'Flags',
      bits: 8,
      about: 'Meaning depends on the type. 0x01 END_STREAM (DATA, HEADERS) or ACK (SETTINGS, PING); 0x04 END_HEADERS (the header block is complete); 0x08 PADDED; 0x20 PRIORITY.',
      source: { rfc: 9113, section: '6' },
    },
    { id: 'r', name: 'R', short: 'R', bits: 1, about: 'Reserved bit, 0.', source: { rfc: 9113, section: '4.1' } },
    {
      id: 'stream',
      name: 'Stream Identifier',
      bits: 31,
      about: 'The stream this frame belongs to. 0 means the connection as a whole (SETTINGS, PING, GOAWAY). Streams opened by the client have odd numbers: 1, 3, 5, ...',
      source: { rfc: 9113, section: '5.1.1' },
    },
    { id: 'payload', name: 'Frame Payload', bits: 'variable', compact: true, about: 'The content, structured according to the frame type.', source: { rfc: 9113, section: '4.1' } },
  ],
  sources: [{ rfc: 9113, section: '4.1' }],
};

// ---- SETTINGS

const SETTINGS_NAMES: Record<number, string> = {
  1: 'HEADER_TABLE_SIZE',
  2: 'ENABLE_PUSH',
  3: 'MAX_CONCURRENT_STREAMS',
  4: 'INITIAL_WINDOW_SIZE',
  5: 'MAX_FRAME_SIZE',
  6: 'MAX_HEADER_LIST_SIZE',
};

export const settingDef: StructDef = {
  id: 'h2-setting',
  name: 'Setting',
  about: 'One parameter: a 16-bit identifier and a 32-bit value.',
  fields: [
    { id: 'id', name: 'Identifier', bits: 16, about: '1 HEADER_TABLE_SIZE, 2 ENABLE_PUSH, 3 MAX_CONCURRENT_STREAMS, 4 INITIAL_WINDOW_SIZE, 5 MAX_FRAME_SIZE, 6 MAX_HEADER_LIST_SIZE.' },
    { id: 'value', name: 'Value', bits: 32, about: 'The value of the parameter.' },
  ],
  sources: [{ rfc: 9113, section: '6.5.1' }],
};

// ---- HPACK

const STATIC: [string, string][] = [
  [':authority', ''], [':method', 'GET'], [':method', 'POST'], [':path', '/'], [':path', '/index.html'], [':scheme', 'http'], [':scheme', 'https'],
  [':status', '200'], [':status', '204'], [':status', '206'], [':status', '304'], [':status', '400'], [':status', '404'], [':status', '500'],
  ['accept-charset', ''], ['accept-encoding', 'gzip, deflate'], ['accept-language', ''], ['accept-ranges', ''], ['accept', ''],
  ['access-control-allow-origin', ''], ['age', ''], ['allow', ''], ['authorization', ''], ['cache-control', ''], ['content-disposition', ''],
  ['content-encoding', ''], ['content-language', ''], ['content-length', ''], ['content-location', ''], ['content-range', ''], ['content-type', ''],
  ['cookie', ''], ['date', ''], ['etag', ''], ['expect', ''], ['expires', ''], ['from', ''], ['host', ''], ['if-match', ''],
  ['if-modified-since', ''], ['if-none-match', ''], ['if-range', ''], ['if-unmodified-since', ''], ['last-modified', ''], ['link', ''],
  ['location', ''], ['max-forwards', ''], ['proxy-authenticate', ''], ['proxy-authorization', ''], ['range', ''], ['referer', ''],
  ['refresh', ''], ['retry-after', ''], ['server', ''], ['set-cookie', ''], ['strict-transport-security', ''], ['transfer-encoding', ''],
  ['user-agent', ''], ['vary', ''], ['via', ''], ['www-authenticate', ''],
];
/** The HPACK static table, RFC 7541 Appendix A. Index 1 is STATIC_TABLE[0]. */
export const STATIC_TABLE = STATIC;

export const hpackIndexedDef: StructDef = {
  id: 'hpack-indexed',
  name: 'Indexed Header Field',
  about: 'A complete header field (name and value) taken from the static or dynamic table: one octet for the most common fields.',
  fields: [
    { id: 'pattern', name: 'Pattern', bits: 1, about: '1 = indexed representation.' },
    { id: 'index', name: 'Index', bits: 7, about: 'Index 1 to 61: static table. 62 and up: dynamic table, newest entry first.' },
  ],
  sources: [{ rfc: 7541, section: '6.1' }],
};

export const hpackLiteralDef: StructDef = {
  id: 'hpack-literal',
  name: 'Literal Header Field with Incremental Indexing',
  about: 'The name comes from a table index, the value is sent as a string, and the field is added to the dynamic table so later requests can refer to it with one octet.',
  fields: [
    { id: 'pattern', name: 'Pattern', bits: 2, about: '01 = literal with incremental indexing.' },
    { id: 'nameIndex', name: 'Name Index', bits: 6, about: 'Index of an entry whose name is used.' },
    { id: 'huffman', name: 'H', short: 'H', bits: 1, about: '1 = the value is Huffman coded. 0 here, so the value is readable.' },
    { id: 'valueLength', name: 'Value Length', bits: 7, about: 'Length of the value string in octets.' },
    { id: 'value', name: 'Value String', bits: 'variable', about: 'The header value.' },
  ],
  sources: [{ rfc: 7541, section: '6.2.1' }],
};

export type Header = [string, string];

/**
 * HPACK encoder with a dynamic table (RFC 7541 sections 2.3 and 6). Uses only indexed fields and
 * literals with incremental indexing and an indexed name, without Huffman coding, so every value
 * stays readable in the packet. Small indexes and short values only (single-octet prefixes).
 */
export class HpackEncoder {
  private dynamic: Header[] = [];

  /** Current dynamic table, newest first (index 62 is the first element). */
  table(): Header[] {
    return [...this.dynamic];
  }

  private find(name: string, value?: string): number {
    const all: Header[] = [...STATIC, ...this.dynamic];
    const i = all.findIndex(([n, v]) => n === name && (value === undefined || v === value));
    return i < 0 ? -1 : i + 1;
  }

  encode(headers: Header[]): StructInstance[] {
    return headers.map(([name, value]) => {
      const full = this.find(name, value);
      if (full > 0) {
        if (full > 126) throw new Error('hpack: index needs more than 7 bits');
        const where = full <= 61 ? 'static' : 'dynamic';
        return buildStruct(
          hpackIndexedDef,
          { pattern: { raw: 1, display: '1' }, index: { raw: full, display: `${full} (${where} table: ${name}: ${value})` } },
          {},
          `${name}: ${value} (index ${full})`,
        );
      }
      const nameIndex = this.find(name);
      if (nameIndex < 1 || nameIndex > 62) throw new Error(`hpack: name ${name} not in a 6-bit index`);
      const bytes = ascii(value);
      if (bytes.length > 126) throw new Error('hpack: value too long for a 7-bit length');
      this.dynamic.unshift([name, value]);
      return buildStruct(
        hpackLiteralDef,
        {
          pattern: { raw: 1, display: '01' },
          nameIndex: { raw: nameIndex, display: `${nameIndex} (${name})` },
          huffman: { raw: 0, display: '0' },
          valueLength: { raw: bytes.length, display: String(bytes.length) },
          value: { raw: bytes, display: value },
        },
        { notes: { value: 'Added to the dynamic table as entry 62.' } },
        `${name}: ${value} (literal, now dynamic 62)`,
      );
    });
  }
}

// ---- frame builders

const TYPES: Record<number, string> = { 0: 'DATA', 1: 'HEADERS', 4: 'SETTINGS' };

function flagNames(type: number, flags: number): string {
  const names: string[] = [];
  if (flags & 0x01) names.push(type === 4 ? 'ACK' : 'END_STREAM');
  if (flags & 0x04) names.push('END_HEADERS');
  return names.length ? names.join(' | ') : 'none';
}

function frame(type: number, flags: number, stream: number, payload: Uint8Array, display: string, items: StructInstance[] | undefined, summary: string, ann: Annotations = {}): LayerInstance {
  return buildStruct(
    frameDef,
    {
      length: { raw: payload.length, display: String(payload.length) },
      type: { raw: type, display: `${type} (${TYPES[type]})` },
      flags: { raw: flags, display: `0x${flags.toString(16).padStart(2, '0')} (${flagNames(type, flags)})` },
      r: { raw: 0, display: '0' },
      stream: { raw: stream, display: stream === 0 ? '0 (connection)' : String(stream) },
      payload: { raw: payload, display, ...(items && items.length ? { items } : {}) },
    },
    ann,
    summary,
  );
}

export function preface(): LayerInstance {
  const magic = 'PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n';
  return buildStruct(prefaceDef, { magic: { raw: ascii(magic), display: 'PRI * HTTP/2.0\\r\\n\\r\\nSM\\r\\n\\r\\n' } }, {}, 'Client connection preface');
}

export function settings(values: [number, number][], ann: Annotations = {}): LayerInstance {
  const items = values.map(([id, value]) =>
    buildStruct(settingDef, { id: { raw: id, display: `${id} (${SETTINGS_NAMES[id]})` }, value: { raw: value, display: String(value) } }, {}, `${SETTINGS_NAMES[id]} = ${value}`),
  );
  return frame(4, 0, 0, concat(...items.map((i) => i.bytes)), items.map((i) => i.summary).join(', '), items, `SETTINGS, ${values.length} parameters`, ann);
}

export function settingsAck(): LayerInstance {
  return frame(4, 0x01, 0, new Uint8Array(0), '(empty)', undefined, 'SETTINGS ACK');
}

export function headers(encoder: HpackEncoder, stream: number, fields: Header[], endStream: boolean): LayerInstance {
  const items = encoder.encode(fields);
  const block = concat(...items.map((i) => i.bytes));
  return frame(
    1,
    0x04 | (endStream ? 0x01 : 0),
    stream,
    block,
    `Header block, ${block.length} octets: ${fields.map(([n, v]) => `${n}: ${v}`).join(', ')}`,
    items,
    `HEADERS, stream ${stream}`,
  );
}

export function data(stream: number, text: string, endStream: boolean): LayerInstance {
  return frame(0, endStream ? 0x01 : 0, stream, ascii(text), text, undefined, `DATA, stream ${stream}`);
}
