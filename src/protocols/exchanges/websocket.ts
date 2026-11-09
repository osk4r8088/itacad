import type { Exchange, LayerInstance, Source, Step } from '../../shared/schema';
import { textMessage } from '../../shared/headers/text';
import { closePayload, wsFrame } from '../../shared/headers/websocket';
import { ascii } from '../../shared/lib/encode';
import { CLIENT_LAN, TcpConversation, clientServer, dir, type Side } from './conversation';

// Addresses: IPv4 RFC 5737, MAC RFC 7042, names RFC 2606. The key, the accept value and the
// masked "Hello" frame are the examples from RFC 6455 sections 1.3 and 5.7.
const CLIENT_IP = '192.0.2.50';
const SERVER_IP = '203.0.113.80';

const conn = new TcpConversation({
  client: { mac: CLIENT_LAN.mac, ip: CLIENT_IP, port: 52240, isn: 902117345 },
  server: { mac: '', ip: SERVER_IP, port: 80, isn: 3170055812 },
  link: 'lan',
  gatewayMac: CLIENT_LAN.gatewayMac,
  hops: 9,
  ipId: { client: 0x6a80, server: 0x2d11 },
  window: { client: 502, server: 509 },
});

export const WS_KEY = 'dGhlIHNhbXBsZSBub25jZQ==';
export const WS_ACCEPT = 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=';

function http(kind: 'request' | 'response', start: string, headers: string): LayerInstance {
  const req = kind === 'request';
  return textMessage({
    id: 'http',
    name: req ? 'HTTP/1.1 upgrade request' : 'HTTP/1.1 101 response',
    short: 'HTTP',
    about: 'The WebSocket opening handshake is an ordinary HTTP/1.1 request and response. After the response, the connection stops speaking HTTP and carries WebSocket frames.',
    sources: [{ rfc: 6455, section: '4' }, { rfc: 9110, section: '7.8' }],
    summary: start.replace(/\r\n$/, ''),
    parts: [
      { id: 'startLine', name: req ? 'Request line' : 'Status line', text: start, about: req ? 'A normal GET for the WebSocket endpoint.' : '101 Switching Protocols: the server agrees to change the protocol of this connection.', source: { rfc: 9112, section: req ? '3' : '4' } },
      { id: 'headers', name: 'Header fields', text: headers, about: 'Upgrade and Connection ask for (or confirm) the switch; the Sec-WebSocket fields prove that both sides really speak WebSocket.', source: { rfc: 6455, section: '4.1' } },
      { id: 'blank', name: 'Empty line', text: '\r\n', about: 'Ends the HTTP header section. After the 101 response, the next octets are WebSocket frames.', source: { rfc: 9112, section: '2.1' } },
    ],
  });
}

const upgrade = http(
  'request',
  'GET /chat HTTP/1.1\r\n',
  `Host: www.example.com\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${WS_KEY}\r\nOrigin: http://www.example.com\r\nSec-WebSocket-Version: 13\r\n`,
);
const switching = http('response', 'HTTP/1.1 101 Switching Protocols\r\n', `Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${WS_ACCEPT}\r\n`);

const RFC_MASK = Uint8Array.of(0x37, 0xfa, 0x21, 0x3d);
const frames = {
  hello: wsFrame({ opcode: 1, payload: ascii('Hello'), display: '"Hello"', maskKey: RFC_MASK }),
  reply: wsFrame({ opcode: 1, payload: ascii('{"from":"bob","text":"Hi Alice"}'), display: '{"from":"bob","text":"Hi Alice"}' }),
  ping: wsFrame({ opcode: 9, payload: new Uint8Array(0), display: '' }),
  pong: wsFrame({ opcode: 10, payload: new Uint8Array(0), display: '', maskKey: Uint8Array.of(0x9c, 0x41, 0x0e, 0x72) }),
  close: wsFrame({ opcode: 8, payload: closePayload(1000, 'bye'), display: 'status 1000 (normal closure), reason "bye"', maskKey: Uint8Array.of(0x51, 0xd3, 0x88, 0x2a) }),
  closeEcho: wsFrame({ opcode: 8, payload: closePayload(1000, ''), display: 'status 1000 (normal closure)' }),
};

interface Turn {
  from: Side;
  id: string;
  label: string;
  payload: LayerInstance;
  time: number;
  category: string;
  protocol: string;
  info: string;
  details: Step['details'];
  sources: Source[];
}

const frameKeys = (...ids: string[]) => ids.map((field) => ({ layer: 'ws-frame', field }));

const turns: Turn[] = [
  {
    from: 'client',
    id: 'upgrade',
    label: 'GET Upgrade',
    payload: upgrade,
    time: 0,
    category: 'handshake',
    protocol: 'HTTP',
    info: 'GET /chat HTTP/1.1',
    details: {
      what:
        'The JavaScript of a chat page calls new WebSocket("ws://www.example.com/chat"). The browser sends an HTTP GET with Upgrade: websocket, Connection: Upgrade, a random Sec-WebSocket-Key and version 13.',
      why: 'Starting as HTTP lets WebSocket use port 80 or 443, pass through proxies and reuse the web server, its authentication and its cookies.',
      keyFields: [
        { layer: 'http', field: 'headers' },
        { layer: 'http', field: 'startLine' },
      ],
      typical: 'Sec-WebSocket-Key is 16 random octets in Base64. The value here is the example from RFC 6455. Origin tells the server which web page wants the connection, so it can refuse foreign sites.',
    },
    sources: [{ rfc: 6455, section: '4.1' }, { rfc: 6455, section: '1.3' }, { rfc: 6455, section: '10.2' }],
  },
  {
    from: 'server',
    id: 'switching',
    label: '101 Switching',
    payload: switching,
    time: 30,
    category: 'handshake',
    protocol: 'HTTP',
    info: 'HTTP/1.1 101 Switching Protocols',
    details: {
      what: `The server accepts with 101 Switching Protocols. Sec-WebSocket-Accept is the Base64 SHA-1 hash of the client key followed by the fixed GUID 258EAFA5-E914-47DA-95CA-C5AB0DC85B11: ${WS_ACCEPT}.`,
      why: 'The accept value is not about security. It proves that the server understood the WebSocket handshake and is not a plain HTTP server or cache that happens to return a response.',
      keyFields: [
        { layer: 'http', field: 'startLine' },
        { layer: 'http', field: 'headers' },
      ],
      insight: 'From the next octet on, the same TCP connection speaks a different protocol. HTTP is only the doorway.',
    },
    sources: [{ rfc: 6455, section: '4.2.2' }, { rfc: 6455, section: '1.3' }],
  },
  {
    from: 'client',
    id: 'hello',
    label: 'Text "Hello"',
    payload: frames.hello,
    time: 31,
    category: 'data',
    protocol: 'WebSocket',
    info: 'WebSocket Text [FIN] [MASKED]',
    details: {
      what: 'The client sends a text message "Hello" in one frame: FIN set, opcode 1 (text), MASK set, length 5, the masking key 37 fa 21 3d, and the masked payload. This is the exact example frame from RFC 6455.',
      why: 'The masking key is random for every frame, so a client script cannot choose which octets appear on the wire. That prevents attacks on broken proxies that might mistake crafted WebSocket data for HTTP requests and poison their cache.',
      keyFields: frameKeys('opcode', 'mask', 'len', 'maskKey', 'payload'),
      typical: 'Masking is not encryption: the key travels in the same frame. For confidentiality use wss:// (WebSocket over TLS, port 443).',
    },
    sources: [{ rfc: 6455, section: '5.2' }, { rfc: 6455, section: '5.3' }, { rfc: 6455, section: '5.7' }, { rfc: 6455, section: '10.3' }],
  },
  {
    from: 'server',
    id: 'push',
    label: 'Text (server push)',
    payload: frames.reply,
    time: 2400,
    category: 'data',
    protocol: 'WebSocket',
    info: 'WebSocket Text [FIN]',
    details: {
      what: 'Two seconds later Bob writes in the chat, and the server pushes the message to Alice without any request: an unmasked text frame with a small JSON document.',
      why: 'This is what WebSocket is for. With plain HTTP the browser would have to ask again and again (polling); here the server sends whenever it has something.',
      keyFields: frameKeys('mask', 'len', 'payload'),
      typical: 'WebSocket does not define what is inside the messages. Applications agree on their own format, often JSON; Sec-WebSocket-Protocol can name it during the handshake.',
    },
    sources: [{ rfc: 6455, section: '5.1' }, { rfc: 6455, section: '5.6' }],
  },
  {
    from: 'server',
    id: 'ping',
    label: 'Ping',
    payload: frames.ping,
    time: 30000,
    category: 'control',
    protocol: 'WebSocket',
    info: 'WebSocket Ping [FIN]',
    details: {
      what: 'After a quiet half minute the server sends a Ping control frame.',
      why: 'Pings check that the other side is still there and keep NAT routers and proxies from dropping the idle connection.',
      keyFields: frameKeys('opcode', 'len'),
      typical: 'The interval is up to the implementation; 20 to 60 seconds is common. Control frames carry at most 125 octets and are never fragmented.',
    },
    sources: [{ rfc: 6455, section: '5.5.2' }, { rfc: 6455, section: '5.5' }],
  },
  {
    from: 'client',
    id: 'pong',
    label: 'Pong',
    payload: frames.pong,
    time: 30015,
    category: 'control',
    protocol: 'WebSocket',
    info: 'WebSocket Pong [FIN] [MASKED]',
    details: {
      what: 'The browser answers automatically with a Pong carrying the same (here empty) payload, masked like every client frame.',
      why: 'A Pong must answer a Ping as soon as practical; scripts in the page never see Ping or Pong.',
      keyFields: frameKeys('opcode', 'mask', 'maskKey'),
    },
    sources: [{ rfc: 6455, section: '5.5.3' }],
  },
  {
    from: 'client',
    id: 'close',
    label: 'Close 1000',
    payload: frames.close,
    time: 45000,
    category: 'close',
    protocol: 'WebSocket',
    info: 'WebSocket Connection Close [FIN] [MASKED]',
    details: {
      what: 'Alice leaves the page. The browser sends a Close frame with status code 1000 (normal closure) and the reason "bye".',
      why: 'The closing handshake lets both sides know that all messages were delivered before the TCP connection goes away.',
      keyFields: frameKeys('opcode', 'payload'),
      typical: 'Other status codes: 1001 going away (page closed), 1002 protocol error, 1008 policy violation, 1011 server error.',
    },
    sources: [{ rfc: 6455, section: '5.5.1' }, { rfc: 6455, section: '7.4.1' }],
  },
  {
    from: 'server',
    id: 'close-echo',
    label: 'Close 1000',
    payload: frames.closeEcho,
    time: 45030,
    category: 'close',
    protocol: 'WebSocket',
    info: 'WebSocket Connection Close [FIN]',
    details: {
      what: 'The server answers with its own Close frame and status 1000, then closes the TCP connection.',
      why: 'RFC 6455 asks the server to close the TCP connection first, so the server holds the TIME-WAIT state and not the client, which could otherwise not reopen the same connection for twice the maximum segment lifetime.',
      keyFields: frameKeys('opcode', 'payload', 'mask'),
      insight: 'Compare the client frames with the server frames: same format, but only the client masks. Look at the header lengths: 2 octets for the server, 6 for the client (the masking key).',
    },
    sources: [{ rfc: 6455, section: '5.5.1' }, { rfc: 6455, section: '7.1.1' }],
  },
];

const steps: Step[] = turns.map((t) => ({
  id: t.id,
  ...dir(t.from),
  label: t.label,
  time: t.time,
  category: t.category,
  protocol: t.protocol,
  info: t.info,
  details: t.details,
  captures: [conn.segment(t.from, t.payload)],
  sources: t.sources,
}));

export const websocketExchange: Exchange = {
  id: 'websocket',
  title: 'WebSocket',
  summary: 'An HTTP upgrade turns the connection into a two-way message channel: masked client frames, server push, ping and close.',
  group: 'Application',
  scenario:
    'A chat page on www.example.com opens a WebSocket to ws://www.example.com/chat. The TCP connection to port 80 is open (see the TCP exchange). Alice sends a message, the server pushes Bob\'s answer, the connection idles, and Alice leaves.',
  intro:
    'HTTP only lets the client ask; WebSocket gives both sides a channel to send messages at any time. It starts as an HTTP/1.1 request with Upgrade: websocket. Once the server answers 101 Switching Protocols, the same TCP connection carries WebSocket frames: small headers with an opcode and a length, and masking for everything the client sends. Real sites use wss:// over TLS; this example uses ws:// so the frames are readable. Times are illustrative, with a round trip of 30 ms.',
  sources: [
    { rfc: 6455, note: 'The WebSocket Protocol' },
    { rfc: 9110, section: '7.8', note: 'Upgrade' },
    { rfc: 9112, note: 'HTTP/1.1' },
    { rfc: 7692, note: 'Compression extension' },
    { rfc: 5737, note: 'Documentation IPv4 addresses used here' },
  ],
  ...clientServer({ client: { label: 'Browser', ip: CLIENT_IP }, server: { label: 'Web server', ip: SERVER_IP, note: 'www.example.com, port 80' } }),
  categories: [
    { id: 'handshake', label: 'HTTP upgrade', color: 'blue' },
    { id: 'data', label: 'Data frame', color: 'green' },
    { id: 'control', label: 'Ping and pong', color: 'gray' },
    { id: 'close', label: 'Close', color: 'yellow' },
  ],
  steps,
};
