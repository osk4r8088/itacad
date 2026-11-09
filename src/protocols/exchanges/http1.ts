import type { Exchange, LayerInstance } from '../../shared/schema';
import { textMessage } from '../../shared/headers/text';
import { CLIENT_LAN, TcpConversation, clientServer, dir } from './conversation';

// Addresses: IPv4 RFC 5737, MAC RFC 7042, names RFC 2606.
const CLIENT_IP = '192.0.2.50';
const SERVER_IP = '203.0.113.80';

const conn = new TcpConversation({
  client: { mac: CLIENT_LAN.mac, ip: CLIENT_IP, port: 51744, isn: 2841907716 },
  server: { mac: '', ip: SERVER_IP, port: 80, isn: 921406183 },
  link: 'lan',
  gatewayMac: CLIENT_LAN.gatewayMac,
  hops: 9,
  ipId: { client: 0x7a10, server: 0x0c35 },
  window: { client: 502, server: 509 },
});

const UA = 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0\r\n';
const ETAG = '"5f2c-1a7"';
const PAGE = '<!doctype html>\n<html><head><title>Example</title></head>\n<body><h1>Hello from www.example.com</h1></body></html>\n';
const NOT_FOUND = '<!doctype html>\n<title>404 Not Found</title>\n<h1>Not Found</h1>\n';

const SOURCES = [{ rfc: 9110 }, { rfc: 9111 }, { rfc: 9112 }];
const ABOUT =
  'An HTTP/1.1 message is text: a start line (request line or status line), header fields one per line, an empty line, then the body if there is one. Lines end with CR LF. The length of the body comes from Content-Length (or chunked transfer coding), so the receiver knows where the next message on the same connection begins.';

function message(kind: 'request' | 'response', start: string, headers: string, body: string, summary: string): LayerInstance {
  const req = kind === 'request';
  return textMessage({
    id: 'http',
    name: req ? 'HTTP/1.1 request' : 'HTTP/1.1 response',
    short: 'HTTP',
    about: ABOUT,
    sources: SOURCES,
    summary,
    parts: [
      req
        ? { id: 'startLine', name: 'Request line', text: start, about: 'Method, request target and protocol version, separated by single spaces.', source: { rfc: 9112, section: '3' } }
        : { id: 'startLine', name: 'Status line', text: start, about: 'Protocol version, three-digit status code and a reason phrase that clients ignore.', source: { rfc: 9112, section: '4' } },
      { id: 'headers', name: 'Header fields', text: headers, about: 'One field per line: name, colon, value. Names are case-insensitive.', source: { rfc: 9112, section: '5' } },
      { id: 'blank', name: 'Empty line', text: '\r\n', about: 'An empty line (CR LF) ends the header section.', source: { rfc: 9112, section: '2.1' } },
      { id: 'body', name: 'Message body', text: body, about: 'The content. Its length is given by Content-Length; a request without a body has none.', source: { rfc: 9112, section: '6' } },
    ],
  });
}

const len = (s: string) => new TextEncoder().encode(s).length;

const req1 = message('request', 'GET / HTTP/1.1\r\n', `Host: www.example.com\r\n${UA}Accept: text/html\r\n`, '', 'GET /');
const res1 = message(
  'response',
  'HTTP/1.1 200 OK\r\n',
  `Date: Fri, 06 Nov 2026 09:15:00 GMT\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${len(PAGE)}\r\nETag: ${ETAG}\r\nCache-Control: no-cache\r\n`,
  PAGE,
  '200 OK, text/html',
);
const req2 = message('request', 'GET /favicon.ico HTTP/1.1\r\n', `Host: www.example.com\r\n${UA}Accept: image/*\r\n`, '', 'GET /favicon.ico');
const res2 = message(
  'response',
  'HTTP/1.1 404 Not Found\r\n',
  `Date: Fri, 06 Nov 2026 09:15:00 GMT\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${len(NOT_FOUND)}\r\n`,
  NOT_FOUND,
  '404 Not Found',
);
const req3 = message('request', 'GET / HTTP/1.1\r\n', `Host: www.example.com\r\n${UA}Accept: text/html\r\nIf-None-Match: ${ETAG}\r\n`, '', 'GET / (conditional)');
const res3 = message('response', 'HTTP/1.1 304 Not Modified\r\n', `Date: Fri, 06 Nov 2026 09:15:30 GMT\r\nETag: ${ETAG}\r\nCache-Control: no-cache\r\n`, '', '304 Not Modified');

export const http1Exchange: Exchange = {
  id: 'http1',
  title: 'HTTP/1.1',
  summary: 'A page, a missing favicon and a reload with a conditional request, all on one persistent connection.',
  group: 'Application',
  scenario:
    'A browser loads http://www.example.com/. The TCP connection to port 80 is already open (see the TCP exchange). The browser fetches the page, asks for the site icon, and 30 seconds later the user reloads the page.',
  intro:
    'HTTP/1.1 is a request and response protocol in plain text over TCP. The client sends a request, the server sends exactly one response, and then the connection can carry the next request: connections are persistent by default. Because the messages are text, you can read every step below directly in the packet. Two things make the protocol efficient despite its simplicity: persistent connections save a TCP handshake per request, and conditional requests let a cache check whether its copy is still current without downloading it again. Today most sites use HTTPS, which carries exactly these messages inside TLS. The User-Agent string is shortened.',
  sources: [
    { rfc: 9110, note: 'HTTP Semantics' },
    { rfc: 9111, note: 'HTTP Caching' },
    { rfc: 9112, note: 'HTTP/1.1 message syntax and connections' },
    { rfc: 9293, note: 'TCP' },
    { rfc: 5737, note: 'Documentation IPv4 addresses used here' },
    { rfc: 2606, note: 'Reserved example domains' },
  ],
  ...clientServer({ client: { label: 'Browser', ip: CLIENT_IP }, server: { label: 'Web server', ip: SERVER_IP, note: 'www.example.com, port 80' } }),
  categories: [
    { id: 'request', label: 'Request', color: 'blue' },
    { id: 'ok', label: 'Success or cache hit', color: 'green' },
    { id: 'error', label: 'Client error', color: 'red' },
  ],
  steps: [
    {
      id: 'get-page',
      ...dir('client'),
      label: 'GET /',
      time: 0,
      category: 'request',
      protocol: 'HTTP',
      info: 'GET / HTTP/1.1',
      details: {
        what:
          'The browser sends its first request: method GET, target "/", version HTTP/1.1. The Host header names the site, because one server address can host many sites. The request has no body; the empty line ends it.',
        why: 'The request line says what the client wants, the headers add context: which site, which software, which formats it accepts.',
        keyFields: [
          { layer: 'http', field: 'startLine' },
          { layer: 'http', field: 'headers' },
          { layer: 'http', field: 'blank' },
          { layer: 'tcp', field: 'dstPort' },
        ],
        typical:
          'Host is the only header HTTP/1.1 requires in every request; a server must reject a request without it with 400 (Bad Request). Real browsers send ten or more headers, including Accept-Language, Accept-Encoding and cookies.',
        insight: 'TCP sees only a stream of octets. Where one HTTP message ends and the next begins is decided by HTTP itself: here, the empty line after the headers.',
      },
      captures: [conn.segment('client', req1)],
      sources: [{ rfc: 9112, section: '3' }, { rfc: 9110, section: '7.2' }, { rfc: 9110, section: '9.3.1' }],
    },
    {
      id: 'page',
      ...dir('server'),
      label: '200 OK',
      time: 25,
      category: 'ok',
      protocol: 'HTTP',
      info: 'HTTP/1.1 200 OK (text/html)',
      details: {
        what:
          'The server answers with status 200 (OK) and the page. Content-Length says how many octets of body follow, so the browser knows when the response is complete and the connection is free for the next request.',
        why: 'With a persistent connection, closing the connection can no longer mark the end of the body. The length has to be stated in advance.',
        keyFields: [
          { layer: 'http', field: 'startLine' },
          { layer: 'http', field: 'headers' },
          { layer: 'http', field: 'body' },
        ],
        typical:
          'ETag is a version tag for this representation of the page. Cache-Control: no-cache does not mean "do not cache": the browser may store the page, but must check with the server before it uses the copy again.',
        wrong: 'If Content-Length does not match the real body length, the client either waits forever for missing octets or reads the start of the next response as part of this one.',
      },
      captures: [conn.segment('server', res1)],
      sources: [{ rfc: 9112, section: '4' }, { rfc: 9112, section: '6.3' }, { rfc: 9110, section: '8.6' }, { rfc: 9110, section: '8.8.3' }, { rfc: 9111, section: '5.2.2.4' }],
    },
    {
      id: 'get-icon',
      ...dir('client'),
      label: 'GET /favicon.ico',
      time: 26,
      category: 'request',
      protocol: 'HTTP',
      info: 'GET /favicon.ico HTTP/1.1',
      details: {
        what: 'The page does not reference an icon, so the browser tries the traditional location /favicon.ico. It reuses the open connection.',
        why: 'Reusing the connection saves a new TCP handshake (one round trip) and lets TCP keep its learned congestion window.',
        keyFields: [
          { layer: 'http', field: 'startLine' },
          { layer: 'tcp', field: 'seq' },
          { layer: 'tcp', field: 'srcPort' },
        ],
        typical: 'Same source port, same connection: the sequence number simply continues after the first request.',
        insight:
          'HTTP/1.1 can only carry one response at a time per connection. A slow response blocks everything behind it (head-of-line blocking), so browsers open up to six connections per site. HTTP/2 solves this with streams on one connection.',
      },
      captures: [conn.segment('client', req2)],
      sources: [{ rfc: 9112, section: '9.3' }],
    },
    {
      id: 'not-found',
      ...dir('server'),
      label: '404 Not Found',
      time: 51,
      category: 'error',
      protocol: 'HTTP',
      info: 'HTTP/1.1 404 Not Found (text/html)',
      details: {
        what: 'There is no favicon on this server. It answers 404 (Not Found) with a small error page. The connection stays open: an error response is still a complete response.',
        why: 'Status codes are grouped by their first digit: 2xx success, 3xx redirection, 4xx client error, 5xx server error. A client that does not know a code treats it like x00 of its class.',
        keyFields: [
          { layer: 'http', field: 'startLine' },
          { layer: 'http', field: 'headers' },
        ],
        typical: 'Browsers remember a missing favicon for a while and do not ask again on every page.',
      },
      captures: [conn.segment('server', res2)],
      sources: [{ rfc: 9110, section: '15' }, { rfc: 9110, section: '15.5.5' }],
    },
    {
      id: 'revalidate',
      ...dir('client'),
      label: 'GET / If-None-Match',
      time: 30000,
      category: 'request',
      protocol: 'HTTP',
      info: 'GET / HTTP/1.1',
      details: {
        what: `30 seconds later the user reloads. The browser has the page in its cache, but Cache-Control: no-cache requires a check first. It sends a conditional request: If-None-Match: ${ETAG}, "send the page only if your current version is a different one".`,
        why: 'The check costs one round trip but saves downloading the whole page again when it has not changed, which for real pages with images and scripts is most of the traffic.',
        keyFields: [
          { layer: 'http', field: 'headers' },
          { layer: 'tcp', field: 'seq' },
        ],
        typical:
          'The connection is still open after 30 seconds of silence. Servers close idle persistent connections after a timeout of their own, often around a minute; then the browser opens a new one.',
      },
      captures: [conn.segment('client', req3)],
      sources: [{ rfc: 9110, section: '13.1.2' }, { rfc: 9111, section: '4.3.1' }, { rfc: 9112, section: '9.3' }],
    },
    {
      id: 'not-modified',
      ...dir('server'),
      label: '304 Not Modified',
      time: 30025,
      category: 'ok',
      protocol: 'HTTP',
      info: 'HTTP/1.1 304 Not Modified',
      details: {
        what: 'The ETag still matches, so the server answers 304 (Not Modified) without a body. The browser shows the page from its cache.',
        why: 'A 304 response never has a body, so it needs no Content-Length: the empty line ends it.',
        keyFields: [
          { layer: 'http', field: 'startLine' },
          { layer: 'http', field: 'headers' },
          { layer: 'http', field: 'body' },
        ],
        typical: `Compare the sizes: the 200 response carried ${len(PAGE)} octets of page, the 304 none. For a real page of a few hundred kilobytes the difference is large.`,
        insight: 'Caching in HTTP rests on two ideas: freshness (how long a copy may be used without asking) and validation (asking cheaply whether a copy is still current). This exchange shows validation.',
      },
      captures: [conn.segment('server', res3)],
      sources: [{ rfc: 9110, section: '15.4.5' }, { rfc: 9111, section: '4.3.3' }],
    },
  ],
};
