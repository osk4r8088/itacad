import type { Exchange, LayerInstance, Source, Step } from '../../shared/schema';
import { HpackEncoder, data, headers, preface, settings, settingsAck } from '../../shared/headers/http2';
import { CLIENT_LAN, TcpConversation, clientServer, dir, type Side } from './conversation';

// Addresses: IPv4 RFC 5737, MAC RFC 7042, names RFC 2606.
const CLIENT_IP = '192.0.2.50';
const SERVER_IP = '203.0.113.80';

const conn = new TcpConversation({
  client: { mac: CLIENT_LAN.mac, ip: CLIENT_IP, port: 53120, isn: 3402561139 },
  server: { mac: '', ip: SERVER_IP, port: 80, isn: 1179044730 },
  link: 'lan',
  gatewayMac: CLIENT_LAN.gatewayMac,
  hops: 9,
  ipId: { client: 0x5d00, server: 0x7e40 },
  window: { client: 502, server: 509 },
});

// Each direction has its own HPACK compression context.
const clientHpack = new HpackEncoder();
const serverHpack = new HpackEncoder();

const MESSAGES = '[{"from":"bob","text":"Lunch tomorrow?"},{"from":"carol","text":"Meeting moved to 3"}]';
const PROFILE = '{"name":"Alice","email":"alice@example.com"}';
const len = (s: string) => String(new TextEncoder().encode(s).length);

const EXAMPLE_SETTINGS = 'Example values; every implementation chooses its own.';

const f = {
  preface: preface(),
  clientSettings: settings(
    [
      [2, 0],
      [3, 100],
      [4, 6291456],
    ],
    { unverified: { payload: EXAMPLE_SETTINGS } },
  ),
  req1: headers(
    clientHpack,
    1,
    [
      [':method', 'GET'],
      [':scheme', 'http'],
      [':authority', 'www.example.com'],
      [':path', '/api/profile'],
      ['user-agent', 'example-app/2.1'],
      ['accept', 'application/json'],
    ],
    true,
  ),
  req2: headers(
    clientHpack,
    3,
    [
      [':method', 'GET'],
      [':scheme', 'http'],
      [':authority', 'www.example.com'],
      [':path', '/api/messages'],
      ['user-agent', 'example-app/2.1'],
      ['accept', 'application/json'],
    ],
    true,
  ),
  serverSettings: settings(
    [
      [3, 128],
      [4, 65536],
      [5, 16777215],
    ],
    { unverified: { payload: EXAMPLE_SETTINGS } },
  ),
  serverAck: settingsAck(),
  res3: headers(
    serverHpack,
    3,
    [
      [':status', '200'],
      ['content-type', 'application/json'],
      ['content-length', len(MESSAGES)],
    ],
    false,
  ),
  data3: data(3, MESSAGES, true),
  clientAck: settingsAck(),
  res1: headers(
    serverHpack,
    1,
    [
      [':status', '200'],
      ['content-type', 'application/json'],
      ['content-length', len(PROFILE)],
    ],
    false,
  ),
  data1: data(1, PROFILE, true),
};

interface Turn {
  from: Side;
  id: string;
  label: string;
  layer: LayerInstance;
  time: number;
  category: string;
  info: string;
  details: Step['details'];
  sources: Source[];
}

const fr = (...ids: string[]) => ids.map((field) => ({ layer: 'h2-frame', field }));

const turns: Turn[] = [
  {
    from: 'client',
    id: 'preface',
    label: 'Preface',
    layer: f.preface,
    time: 0,
    category: 'connection',
    info: 'Magic',
    details: {
      what: 'The client starts the HTTP/2 connection with the fixed 24-octet preface "PRI * HTTP/2.0".',
      why: 'If the server only speaks HTTP/1.1, it reads this as a request with an unknown method and answers with an error, instead of trying to interpret binary frames as text.',
      keyFields: [{ layer: 'h2-preface', field: 'magic' }],
      typical:
        'Browsers use HTTP/2 only over TLS, where both sides agree on "h2" with ALPN during the handshake (see the TLS exchange). Without TLS, a client must know in advance that the server speaks HTTP/2 ("prior knowledge"), as here. The frames are the same in both cases; without TLS you can read them.',
    },
    sources: [{ rfc: 9113, section: '3.4' }, { rfc: 9113, section: '3.3' }],
  },
  {
    from: 'client',
    id: 'client-settings',
    label: 'SETTINGS',
    layer: f.clientSettings,
    time: 0,
    category: 'connection',
    info: 'SETTINGS[0]',
    details: {
      what: 'The client sends its SETTINGS on stream 0, the connection itself: no server push, up to 100 parallel streams, and a large flow control window.',
      why: 'Each side announces its limits once at the start. The peer must respect them and acknowledges them with SETTINGS ACK.',
      keyFields: [...fr('type', 'stream', 'payload')],
      typical: 'The preface and this SETTINGS frame usually leave in the same TCP segment; they are shown as separate steps here.',
    },
    sources: [{ rfc: 9113, section: '6.5' }, { rfc: 9113, section: '6.5.2' }],
  },
  {
    from: 'client',
    id: 'request-1',
    label: 'HEADERS s1',
    layer: f.req1,
    time: 0.1,
    category: 'request',
    info: 'HEADERS[1]: GET /api/profile',
    details: {
      what:
        'The first request opens stream 1: GET /api/profile. The request line of HTTP/1.1 has become pseudo-header fields (:method, :scheme, :authority, :path), and the whole header block is HPACK-compressed. END_STREAM says the request has no body.',
      why: 'The client does not wait for the server SETTINGS; it may send requests right after its preface.',
      keyFields: fr('stream', 'flags', 'payload'),
      typical:
        ':method GET, :scheme http and :path / are in the HPACK static table and cost one octet each. :authority, user-agent and accept are sent as literals once and added to the dynamic table. Real clients also Huffman-code the strings; this one does not, so you can read them.',
      insight: 'Header names in HTTP/2 must be lowercase. HTTP/1.1 treats them case-insensitively; HTTP/2 makes the canonical form part of the protocol.',
    },
    sources: [{ rfc: 9113, section: '8.3.1' }, { rfc: 9113, section: '8.2' }, { rfc: 9113, section: '6.2' }, { rfc: 7541, section: '6.1' }, { rfc: 7541, section: '6.2.1' }],
  },
  {
    from: 'client',
    id: 'request-3',
    label: 'HEADERS s3',
    layer: f.req2,
    time: 0.2,
    category: 'request',
    info: 'HEADERS[3]: GET /api/messages',
    details: {
      what: 'At the same time the app requests /api/messages on stream 3. Both requests are now open on the one connection.',
      why: 'This is multiplexing: no second TCP connection, and no waiting for the first response.',
      keyFields: fr('stream', 'payload', 'length'),
      typical: `Compare the sizes: the first header block is ${f.req1.values.payload.bits / 8} octets, this one ${f.req2.values.payload.bits / 8}. The repeated :authority, user-agent and accept now cost one octet each, as references into the dynamic table; only the new :path is sent in full.`,
      insight: 'HPACK keeps a table per direction that both ends update in the same order. That is also why header blocks must arrive in order and cannot be split across streams.',
    },
    sources: [{ rfc: 9113, section: '5' }, { rfc: 7541, section: '2.3.2' }, { rfc: 7541, section: '4' }],
  },
  {
    from: 'server',
    id: 'server-settings',
    label: 'SETTINGS',
    layer: f.serverSettings,
    time: 15,
    category: 'connection',
    info: 'SETTINGS[0]',
    details: {
      what: 'The server sends its own SETTINGS: up to 128 parallel streams, a window of 64 KiB per stream, and frames up to 16 MiB.',
      why: 'The server preface consists of exactly this SETTINGS frame, the first frame it must send.',
      keyFields: fr('type', 'payload'),
    },
    sources: [{ rfc: 9113, section: '3.4' }, { rfc: 9113, section: '6.5.2' }],
  },
  {
    from: 'server',
    id: 'server-ack',
    label: 'SETTINGS ACK',
    layer: f.serverAck,
    time: 15,
    category: 'connection',
    info: 'SETTINGS[0] (ACK)',
    details: {
      what: 'The server acknowledges the client SETTINGS: an empty SETTINGS frame with the ACK flag.',
      why: 'Only after the ACK does the client know that the server applies its settings.',
      keyFields: fr('flags', 'length'),
    },
    sources: [{ rfc: 9113, section: '6.5.3' }],
  },
  {
    from: 'server',
    id: 'response-3',
    label: 'HEADERS s3',
    layer: f.res3,
    time: 15.5,
    category: 'response',
    info: 'HEADERS[3]: 200 OK',
    details: {
      what: 'The messages are ready first, so the server answers stream 3 before stream 1: :status 200 and the content type.',
      why: 'Responses do not have to come in request order. Each stream is independent, so a slow request does not block a fast one, unlike pipelining in HTTP/1.1.',
      keyFields: fr('stream', 'payload'),
      typical: ':status 200 is entry 8 in the static table: a whole status line in one octet.',
    },
    sources: [{ rfc: 9113, section: '8.3.2' }, { rfc: 9113, section: '5.1' }],
  },
  {
    from: 'server',
    id: 'data-3',
    label: 'DATA s3',
    layer: f.data3,
    time: 15.5,
    category: 'response',
    info: 'DATA[3] (END_STREAM)',
    details: {
      what: 'The JSON body of stream 3 in a DATA frame with END_STREAM: the response is complete and stream 3 is closed.',
      why: 'The frame length replaces Content-Length and chunked encoding for finding the end of the body; END_STREAM marks the end of the message.',
      keyFields: fr('stream', 'flags', 'payload'),
      typical: 'DATA frames count against flow control windows, per stream and for the whole connection. The receiver opens them again with WINDOW_UPDATE frames, not shown here.',
    },
    sources: [{ rfc: 9113, section: '6.1' }, { rfc: 9113, section: '5.2' }],
  },
  {
    from: 'client',
    id: 'client-ack',
    label: 'SETTINGS ACK',
    layer: f.clientAck,
    time: 30.2,
    category: 'connection',
    info: 'SETTINGS[0] (ACK)',
    details: {
      what: 'The client acknowledges the server SETTINGS.',
      why: 'Both sides have now confirmed each other\'s settings.',
      keyFields: fr('flags'),
    },
    sources: [{ rfc: 9113, section: '6.5.3' }],
  },
  {
    from: 'server',
    id: 'response-1',
    label: 'HEADERS s1',
    layer: f.res1,
    time: 60,
    category: 'response',
    info: 'HEADERS[1]: 200 OK',
    details: {
      what: 'The profile took longer (a slower database query). Now the server answers stream 1.',
      why: 'In HTTP/1.1 on one connection, the messages would have had to wait behind this slow response.',
      keyFields: fr('stream', 'payload'),
      typical: 'content-type application/json is now a reference into the server dynamic table, one octet. Only content-length is new.',
    },
    sources: [{ rfc: 9113, section: '8.3.2' }, { rfc: 7541, section: '2.3.2' }],
  },
  {
    from: 'server',
    id: 'data-1',
    label: 'DATA s1',
    layer: f.data1,
    time: 60,
    category: 'response',
    info: 'DATA[1] (END_STREAM)',
    details: {
      what: 'The body of stream 1 with END_STREAM. Both requests are done; the connection stays open for more.',
      why: 'One connection per site is enough for HTTP/2, with one TCP handshake, one TLS handshake and one congestion window.',
      keyFields: fr('stream', 'flags', 'payload'),
      insight:
        'HTTP/2 removed head-of-line blocking between requests, but not in TCP below it: if one TCP segment is lost, all streams wait for its retransmission. HTTP/3 moves the streams into QUIC to fix that.',
    },
    sources: [{ rfc: 9113, section: '6.1' }, { rfc: 9114, section: '1' }],
  },
];

const steps: Step[] = turns.map((t) => ({
  id: t.id,
  ...dir(t.from),
  label: t.label,
  time: t.time,
  category: t.category,
  protocol: 'HTTP2',
  info: t.info,
  details: t.details,
  captures: [conn.segment(t.from, t.layer)],
  sources: t.sources,
}));

export const http2Exchange: Exchange = {
  id: 'http2',
  title: 'HTTP/2',
  summary: 'Two requests in parallel on one connection: binary frames, streams, HPACK header compression, answers out of order.',
  group: 'Application',
  scenario:
    'A chat app on Alice\'s laptop fetches her profile and her messages from www.example.com at the same time. The TCP connection is open (see the TCP exchange) and the app knows the server speaks HTTP/2.',
  intro:
    'HTTP/2 keeps the meaning of HTTP (methods, status codes, header fields) but changes how messages travel. Everything is cut into binary frames that belong to numbered streams, one stream per request and response. Frames of different streams can be interleaved on one TCP connection, so many requests run in parallel and a slow response does not hold up the others. Header fields are compressed with HPACK, which remembers fields already sent. This example runs without TLS (prior knowledge) so the frames stay readable, and without Huffman coding so header values are visible; browsers always use TLS. Times are illustrative, with a round trip of 30 ms.',
  sources: [
    { rfc: 9113, note: 'HTTP/2' },
    { rfc: 7541, note: 'HPACK header compression' },
    { rfc: 9110, note: 'HTTP Semantics' },
    { rfc: 9114, note: 'HTTP/3' },
    { rfc: 5737, note: 'Documentation IPv4 addresses used here' },
  ],
  ...clientServer({ client: { label: 'App', ip: CLIENT_IP }, server: { label: 'Web server', ip: SERVER_IP, note: 'www.example.com, port 80, HTTP/2 with prior knowledge' } }),
  categories: [
    { id: 'connection', label: 'Connection setup', color: 'gray' },
    { id: 'request', label: 'Request', color: 'blue' },
    { id: 'response', label: 'Response', color: 'green' },
  ],
  steps,
};
