import type { Exchange, LayerInstance, Source, Step } from '../../shared/schema';
import { changeCipherSpec, clientHello, encrypted, ext, record, serverHello } from '../../shared/headers/tls';
import { randomBytes } from './common';
import { CLIENT_LAN, TcpConversation, clientServer, dir, type Side } from './conversation';

// Addresses: IPv4 RFC 5737, MAC RFC 7042, names RFC 2606. Random values, key shares and
// ciphertext are deterministic stand-ins (see randomBytes), not real keys or real ciphertext.
const CLIENT_IP = '192.0.2.50';
const SERVER_IP = '203.0.113.80';
const HOST = 'www.example.com';

const conn = new TcpConversation({
  client: { mac: CLIENT_LAN.mac, ip: CLIENT_IP, port: 51802, isn: 1838812016 },
  server: { mac: '', ip: SERVER_IP, port: 443, isn: 708241355 },
  link: 'lan',
  gatewayMac: CLIENT_LAN.gatewayMac,
  hops: 9,
  ipId: { client: 0x4d20, server: 0x1a70 },
  window: { client: 502, server: 509 },
});

const SESSION_ID = randomBytes(32, 11);

const ch = clientHello({
  random: randomBytes(32, 1),
  sessionId: SESSION_ID,
  suites: [0x1301, 0x1303, 0x1302],
  extensions: [
    ext.serverName(HOST),
    ext.supportedGroups([0x001d, 0x0017]),
    ext.signatureAlgorithms([0x0403, 0x0804, 0x0401]),
    ext.alpn(['h2', 'http/1.1']),
    ext.supportedVersionsClient([0x0304, 0x0303]),
    ext.pskModes(),
    ext.keyShareClient(0x001d, randomBytes(32, 2)),
  ],
  unverified: { extensions: 'A real browser sends more extensions (and today often a post-quantum key share); this list is reduced to the ones TLS 1.3 needs.' },
});

const sh = serverHello({
  random: randomBytes(32, 3),
  sessionId: SESSION_ID,
  suite: 0x1301,
  extensions: [ext.supportedVersionServer(), ext.keyShareServer(0x001d, randomBytes(32, 4))],
  notes: { sessionId: 'Same 32 octets as in the ClientHello.' },
});

/** An encrypted record: header (type 23, 0x0303) and content. */
function sealed(plaintext: number, seed: number, summary: string, unverified?: string): LayerInstance[] {
  const content = encrypted(plaintext, randomBytes(plaintext + 17, seed), summary, unverified ? { unverified: { ciphertext: unverified } } : {});
  return [record(23, 0x0303, plaintext + 17, { notes: { type: 'Shows application_data although the content is a handshake message or data: the real type is encrypted.' } }), content];
}

const PLAIN = { ee: 19, cert: 1210, cv: 80, fin: 36, ticket: 217, appC: 113, appS: 264 };

interface Turn {
  from: Side;
  id: string;
  label: string;
  layers: LayerInstance[];
  time: number;
  category: string;
  info: string;
  details: Step['details'];
  sources: Source[];
}

const R = (section: string): Source => ({ rfc: 8446, section });
const enc = [
  { layer: 'tls-record', field: 'type' },
  { layer: 'tls-record', field: 'length' },
  { layer: 'tls-encrypted', field: 'ciphertext' },
];

const turns: Turn[] = [
  {
    from: 'client',
    id: 'client-hello',
    label: 'ClientHello',
    layers: [record(22, 0x0301, ch.bytes.length), ch],
    time: 0,
    category: 'clear',
    info: 'Client Hello (SNI=www.example.com)',
    details: {
      what:
        'The browser opens the handshake. The ClientHello offers three cipher suites and the TLS versions it supports, names the site (server_name), lists the application protocols it can speak (ALPN: h2, http/1.1), and already includes an x25519 public key in key_share.',
      why: 'By sending its key share right away, guessing that the server will accept x25519, the client saves a round trip compared with TLS 1.2: the server can derive keys from its first answer on.',
      keyFields: [
        { layer: 'tls-client-hello', field: 'extensions' },
        { layer: 'tls-client-hello', field: 'suites' },
        { layer: 'tls-client-hello', field: 'random' },
        { layer: 'tls-client-hello', field: 'legacyVersion' },
        { layer: 'tls-record', field: 'version' },
      ],
      typical:
        'Version numbers look like TLS 1.0 and 1.2 in the headers; TLS 1.3 is only visible in supported_versions. Since 2024 browsers usually also send a hybrid post-quantum key share (X25519MLKEM768, over 1 KB), which makes the ClientHello span two TCP segments.',
      wrong: 'If the server supports none of the offered groups, it answers with a HelloRetryRequest naming one it accepts, and the client sends a second ClientHello, costing one extra round trip.',
      insight: 'The ClientHello is not encrypted. Anyone on the path can read the server name in it. Encrypted Client Hello (ECH) is a newer extension that hides it.',
    },
    sources: [R('4.1.2'), R('4.2'), R('5.1'), { rfc: 6066, section: '3' }, { rfc: 7301 }],
  },
  {
    from: 'server',
    id: 'server-hello',
    label: 'ServerHello',
    layers: [record(22, 0x0303, sh.bytes.length), sh],
    time: 15,
    category: 'clear',
    info: 'Server Hello',
    details: {
      what: 'The server picks TLS_AES_128_GCM_SHA256 and x25519, and sends its own x25519 public key. It confirms TLS 1.3 in supported_versions.',
      why:
        'With its own private key and the public key of the other side, each side computes the same shared secret (Elliptic Curve Diffie-Hellman). Nobody on the path can compute it from the two public keys. From the shared secret and a hash of the messages so far, both derive the handshake traffic keys.',
      keyFields: [
        { layer: 'tls-server-hello', field: 'suite' },
        { layer: 'tls-server-hello', field: 'extensions' },
        { layer: 'tls-server-hello', field: 'sessionId' },
      ],
      typical: 'The key pairs are fresh for every connection (ephemeral). Even if the server certificate key is stolen later, recorded traffic cannot be decrypted: forward secrecy.',
    },
    sources: [R('4.1.3'), R('7.1'), R('4.2.8')],
  },
  {
    from: 'server',
    id: 'server-ccs',
    label: 'ChangeCipherSpec',
    layers: [record(20, 0x0303, 1), changeCipherSpec()],
    time: 15,
    category: 'compat',
    info: 'Change Cipher Spec',
    details: {
      what: 'A one-octet ChangeCipherSpec record that means nothing in TLS 1.3.',
      why:
        'The client sent a non-empty legacy_session_id, which asks for middlebox compatibility mode. Some firewalls and proxies only knew TLS 1.2 and broke connections whose handshake looked different; with these dummy records TLS 1.3 looks like a resumed TLS 1.2 session.',
      keyFields: [
        { layer: 'tls-record', field: 'type' },
        { layer: 'tls-ccs', field: 'value' },
      ],
      insight: 'TLS 1.3 carries several such disguises (legacy version fields, session ID, this record). They were added after early deployments failed on real networks.',
    },
    sources: [R('D.4'), R('5')],
  },
  {
    from: 'server',
    id: 'encrypted-extensions',
    label: 'EncryptedExtensions',
    layers: sealed(PLAIN.ee, 21, 'EncryptedExtensions (encrypted)'),
    time: 15.1,
    category: 'encrypted',
    info: 'Application Data',
    details: {
      what: 'The first encrypted message: EncryptedExtensions. It carries the server answers that do not need to be in the clear, here the chosen application protocol (ALPN: h2) and an empty server_name confirming SNI was used.',
      why: 'TLS 1.3 encrypts everything it can as early as it can. Only what is needed to agree on keys (ServerHello) stays visible.',
      keyFields: enc,
      typical: `Inside: ${PLAIN.ee} octets of handshake message. Outside: ${PLAIN.ee + 17} octets, the content plus 1 octet of real content type and a 16-octet tag.`,
    },
    sources: [R('4.3.1'), R('5.2'), { rfc: 7301, section: '3.2' }],
  },
  {
    from: 'server',
    id: 'certificate',
    label: 'Certificate',
    layers: sealed(PLAIN.cert, 22, 'Certificate (encrypted)', 'The size depends on the certificate chain; about 1.2 KB is assumed for two ECDSA certificates.'),
    time: 15.1,
    category: 'encrypted',
    info: 'Application Data',
    details: {
      what: 'The server sends its certificate chain: its own certificate for www.example.com and the intermediate certificate of the authority that signed it. Encrypted, so an observer does not learn which certificate is used.',
      why: 'The certificate binds the name www.example.com to a public key. The browser checks the chain up to a root it trusts, the validity dates, and that the name matches the one it asked for.',
      keyFields: enc,
      wrong: 'Expired certificates, names that do not match, or chains that do not end at a trusted root make the browser abort with an error page; the connection ends with an alert.',
    },
    sources: [R('4.4.2'), { rfc: 5280 }],
  },
  {
    from: 'server',
    id: 'certificate-verify',
    label: 'CertificateVerify',
    layers: sealed(PLAIN.cv, 23, 'CertificateVerify (encrypted)'),
    time: 15.2,
    category: 'encrypted',
    info: 'Application Data',
    details: {
      what: 'The server signs a hash of the whole handshake so far with the private key of its certificate (here ECDSA with P-256 and SHA-256).',
      why: 'A certificate alone proves nothing: it is public. Only the signature shows that the server owns the matching private key, and because it covers this handshake, it cannot be replayed from another connection.',
      keyFields: enc,
      insight: 'Authentication (CertificateVerify) and key exchange (key_share) are separate in TLS 1.3. The certificate key only signs; it never encrypts the session keys, which is what gives forward secrecy.',
    },
    sources: [R('4.4.3')],
  },
  {
    from: 'server',
    id: 'server-finished',
    label: 'Finished',
    layers: sealed(PLAIN.fin, 24, 'Finished (encrypted)'),
    time: 15.2,
    category: 'encrypted',
    info: 'Application Data',
    details: {
      what: 'The server Finished: a MAC over the whole handshake, keyed with a secret derived from the handshake keys (32 octets with SHA-256).',
      why: 'It proves that both sides saw exactly the same handshake messages. A man in the middle who changed anything, for example removed a strong cipher suite from the ClientHello, would be detected here.',
      keyFields: enc,
      typical: 'After its Finished the server could already send application data (0.5-RTT data), before the client has authenticated the handshake.',
    },
    sources: [R('4.4.4')],
  },
  {
    from: 'client',
    id: 'client-ccs',
    label: 'ChangeCipherSpec',
    layers: [record(20, 0x0303, 1), changeCipherSpec()],
    time: 30.5,
    category: 'compat',
    info: 'Change Cipher Spec',
    details: {
      what: 'The client sends its own dummy ChangeCipherSpec before its encrypted messages, again only for middlebox compatibility.',
      why: 'Old middleboxes expect one from each side.',
      keyFields: [{ layer: 'tls-ccs', field: 'value' }],
    },
    sources: [R('D.4')],
  },
  {
    from: 'client',
    id: 'client-finished',
    label: 'Finished',
    layers: sealed(PLAIN.fin, 25, 'Finished (encrypted)'),
    time: 30.5,
    category: 'encrypted',
    info: 'Application Data',
    details: {
      what: 'The client has checked the certificate, the signature and the server Finished. It sends its own Finished. The handshake is complete after one round trip.',
      why: 'The client Finished confirms the handshake from its side. Both now switch to the application traffic keys.',
      keyFields: enc,
      insight: 'Compare with TLS 1.2: two round trips before the first request. With TCP that is three round trips in total for TLS 1.2 and two for TLS 1.3 before any HTTP data flows.',
    },
    sources: [R('4.4.4'), R('2')],
  },
  {
    from: 'client',
    id: 'client-data',
    label: 'Application data',
    layers: sealed(PLAIN.appC, 26, 'HTTP/2 request (encrypted)', 'The size of the HTTP/2 data is an example.'),
    time: 30.6,
    category: 'data',
    info: 'Application Data',
    details: {
      what: 'Right behind its Finished the client sends the first application data: as agreed with ALPN, HTTP/2 (connection preface, settings and the first request).',
      why: 'The client does not have to wait for anything more from the server; it can send data in the same flight as its Finished.',
      keyFields: enc,
      typical: 'Outside it looks exactly like the encrypted handshake messages before: type 23, version 0x0303. Only the length leaks.',
    },
    sources: [R('2'), R('5.2'), { rfc: 9113, section: '3.4' }],
  },
  {
    from: 'server',
    id: 'session-ticket',
    label: 'NewSessionTicket',
    layers: sealed(PLAIN.ticket, 27, 'NewSessionTicket (encrypted)', 'The ticket size depends on the server; 192 octets of ticket are assumed.'),
    time: 45.6,
    category: 'ticket',
    info: 'Application Data',
    details: {
      what: 'After the client Finished, the server sends a NewSessionTicket. The client can use it for a later connection to skip the certificate check (resumption with a pre-shared key).',
      why: 'Resumption saves the expensive signature check and, with 0-RTT, even allows sending data in the very first flight of the next connection.',
      keyFields: enc,
      wrong: '0-RTT data can be replayed by an attacker, so servers must only accept it for requests that are safe to repeat.',
    },
    sources: [R('4.6.1'), R('2.2'), R('8')],
  },
  {
    from: 'server',
    id: 'server-data',
    label: 'Application data',
    layers: sealed(PLAIN.appS, 28, 'HTTP/2 response (encrypted)', 'The size of the HTTP/2 data is an example.'),
    time: 46,
    category: 'data',
    info: 'Application Data',
    details: {
      what: 'The server answers the request with HTTP/2 data, encrypted with the server application traffic key.',
      why: 'Each direction has its own keys, derived from the handshake. Sequence numbers, implicit in TLS 1.3, go into the nonce, so a reordered, dropped or replayed record fails the tag check.',
      keyFields: enc,
      insight: 'From here on, every record looks the same from the outside. Without the keys, an observer learns the server address, the name in the ClientHello, the timing and the sizes, but nothing of the content.',
    },
    sources: [R('5.2'), R('5.3'), R('7.1')],
  },
];

const steps: Step[] = turns.map((t) => ({
  id: t.id,
  ...dir(t.from),
  label: t.label,
  time: t.time,
  category: t.category,
  protocol: 'TLSv1.3',
  info: t.info,
  details: t.details,
  captures: [conn.segment(t.from, t.layers)],
  sources: t.sources,
}));

export const tlsExchange: Exchange = {
  id: 'tls',
  title: 'TLS 1.3',
  summary: 'The full handshake in one round trip: hellos with key shares, the encrypted server flight, Finished, and the first encrypted data.',
  group: 'Security',
  scenario:
    'A browser connects to https://www.example.com. The TCP connection to port 443 is open (see the TCP exchange). Browser and server negotiate TLS 1.3 and then speak HTTP/2 inside the encrypted channel.',
  intro:
    'TLS gives an application a channel that is encrypted, protected against changes, and authenticated: the client knows it talks to the owner of the certificate for www.example.com. TLS 1.3 needs one round trip. The client sends its key share with the first message, the server answers with its own, and from then on both compute the same keys. Everything after the ServerHello is encrypted, including the certificate. Each record is shown in its own TCP segment here; real servers usually pack several records into one. Random values, keys and ciphertext are stand-ins with the correct sizes. Times are illustrative, with a round trip of 30 ms.',
  sources: [
    { rfc: 8446, note: 'TLS 1.3' },
    { rfc: 6066, note: 'Server Name Indication' },
    { rfc: 7301, note: 'ALPN' },
    { rfc: 5116, note: 'AEAD ciphers' },
    { rfc: 5280, note: 'X.509 certificates' },
    { rfc: 9113, note: 'HTTP/2' },
    { rfc: 5737, note: 'Documentation IPv4 addresses used here' },
  ],
  ...clientServer({ client: { label: 'Browser', ip: CLIENT_IP }, server: { label: 'Web server', ip: SERVER_IP, note: 'www.example.com, port 443' } }),
  categories: [
    { id: 'clear', label: 'Handshake in clear', color: 'blue' },
    { id: 'compat', label: 'Compatibility record', color: 'gray' },
    { id: 'encrypted', label: 'Encrypted handshake', color: 'purple' },
    { id: 'data', label: 'Application data', color: 'green' },
    { id: 'ticket', label: 'Session ticket', color: 'yellow' },
  ],
  steps,
};
