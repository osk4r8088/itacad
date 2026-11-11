import type { Capture, Exchange, LayerInstance, Source, Step } from '../../shared/schema';
import { longPacket, shortPacket } from '../../shared/headers/quic';
import { ethIpv4Udp } from '../../shared/headers/stacks';
import { randomBytes } from './common';
import { CLIENT_LAN, clientServer, dir, type Side } from './conversation';

// Addresses: IPv4 RFC 5737, MAC RFC 9542, names RFC 2606. Connection IDs, protected header
// bits and ciphertext are deterministic stand-ins with the correct sizes.
const CLIENT_IP = '192.0.2.50';
const SERVER_IP = '203.0.113.80';
const CLIENT_PORT = 61744;

const ORIGINAL_DCID = randomBytes(8, 71); // chosen by the client for its first Initial
const CLIENT_CID = randomBytes(8, 72);
const SERVER_CID = randomBytes(8, 73);

const MIN_INITIAL = 1200;
const LONG_FIXED = 7; // first octet, version, both connection ID length octets
const SIZE_GUESS = 'The sizes of the encrypted contents are examples; they depend on certificates, settings and requests.';

const ipId = { client: 0x1b40, server: 0x5c90 };

function datagram(from: Side, packet: LayerInstance, note: string): Capture {
  const c = from === 'client';
  return ethIpv4Udp({
    link: 'lan',
    note,
    eth: c ? { src: CLIENT_LAN.mac, dst: CLIENT_LAN.gatewayMac } : { src: CLIENT_LAN.gatewayMac, dst: CLIENT_LAN.mac },
    ip: { src: c ? CLIENT_IP : SERVER_IP, dst: c ? SERVER_IP : CLIENT_IP, ttl: c ? 64 : 55, id: ipId[from]++, df: true },
    udp: c ? { srcPort: CLIENT_PORT, dstPort: 443 } : { srcPort: 443, dstPort: CLIENT_PORT },
    app: packet,
  });
}

/** Payload size that pads an Initial datagram to the 1200-octet minimum. */
function paddedInitialPayload(dcid: Uint8Array, scid: Uint8Array, pnLen: number): number {
  return MIN_INITIAL - (LONG_FIXED + dcid.length + scid.length + 1 /* token length */ + 2 /* length varint */ + pnLen);
}

const packets = {
  clientInitial: longPacket({
    type: 0,
    dcid: ORIGINAL_DCID,
    scid: CLIENT_CID,
    pnLen: 1,
    payload: randomBytes(paddedInitialPayload(ORIGINAL_DCID, CLIENT_CID, 1), 81),
    contents: 'a CRYPTO frame with the TLS ClientHello, then PADDING frames up to 1200 octets',
    mask: randomBytes(5, 91),
    notes: { dcid: 'Random, chosen by the client. The Initial keys are derived from it.', scid: 'The ID the client wants to be addressed with.' },
  }),
  serverInitial: longPacket({
    type: 0,
    dcid: CLIENT_CID,
    scid: SERVER_CID,
    pnLen: 1,
    payload: randomBytes(paddedInitialPayload(CLIENT_CID, SERVER_CID, 1), 82),
    contents: 'an ACK frame, a CRYPTO frame with the TLS ServerHello, and PADDING',
    mask: randomBytes(5, 92),
    notes: { dcid: 'The Source Connection ID of the client.', scid: 'The server picks its own ID; the client uses it from now on.' },
  }),
  serverHandshake: longPacket({
    type: 2,
    dcid: CLIENT_CID,
    scid: SERVER_CID,
    pnLen: 1,
    payload: randomBytes(1360 + 16, 83),
    contents: 'CRYPTO frames with EncryptedExtensions (including QUIC transport parameters), Certificate, CertificateVerify and Finished',
    mask: randomBytes(5, 93),
    unverified: { payload: SIZE_GUESS },
  }),
  serverHalfRtt: shortPacket({
    dcid: CLIENT_CID,
    pnLen: 1,
    payload: randomBytes(20 + 16, 84),
    contents: 'a STREAM frame opening the server HTTP/3 control stream with a SETTINGS frame',
    mask: randomBytes(5, 94),
    unverified: { payload: SIZE_GUESS },
  }),
  clientHandshake: longPacket({
    type: 2,
    dcid: SERVER_CID,
    scid: CLIENT_CID,
    pnLen: 1,
    payload: randomBytes(45 + 16, 85),
    contents: 'an ACK frame and a CRYPTO frame with the TLS Finished of the client',
    mask: randomBytes(5, 95),
    notes: { dcid: 'Now the connection ID the server chose.' },
  }),
  clientRequest: shortPacket({
    dcid: SERVER_CID,
    pnLen: 1,
    payload: randomBytes(70 + 16, 86),
    contents: 'STREAM frames: the client control stream with SETTINGS, and stream 0 with the HTTP/3 HEADERS frame of GET /',
    mask: randomBytes(5, 96),
    unverified: { payload: SIZE_GUESS },
  }),
  serverResponse: shortPacket({
    dcid: CLIENT_CID,
    pnLen: 1,
    payload: randomBytes(190 + 16, 87),
    contents: 'HANDSHAKE_DONE, an ACK frame, and a STREAM frame on stream 0 with HEADERS (status 200) and DATA, with the FIN bit',
    mask: randomBytes(5, 97),
    unverified: { payload: SIZE_GUESS },
  }),
};

interface Turn {
  from: Side;
  id: string;
  label: string;
  packet: LayerInstance;
  time: number;
  category: string;
  info: string;
  details: Step['details'];
  sources: Source[];
}

const L = (...ids: string[]) => ids.map((field) => ({ layer: 'quic-long', field }));
const S = (...ids: string[]) => ids.map((field) => ({ layer: 'quic-short', field }));

const turns: Turn[] = [
  {
    from: 'client',
    id: 'client-initial',
    label: 'Initial (ClientHello)',
    packet: packets.clientInitial,
    time: 0,
    category: 'initial',
    info: `Initial, DCID=${[...ORIGINAL_DCID].map((b) => b.toString(16).padStart(2, '0')).join('')}, CRYPTO, PADDING`,
    details: {
      what:
        'The browser starts QUIC with an Initial packet to UDP port 443. Inside is the TLS 1.3 ClientHello, the same message as in the TLS exchange, carried in a QUIC CRYPTO frame instead of a TLS record. ALPN offers "h3". The datagram is padded to 1200 octets.',
      why:
        'There is no TCP handshake before: QUIC sets up transport and encryption in the same round trip. The padding has two purposes: it proves that the path carries datagrams of at least 1200 octets, and it limits amplification, because the server may only send three times what it has received before it has validated the client address.',
      keyFields: [...L('form', 'type', 'version', 'dcid', 'scid', 'length'), { layer: 'udp', field: 'dstPort' }],
      typical: 'How does the browser know the server speaks HTTP/3? Usually from an earlier HTTP/2 response with an Alt-Svc header, or from an HTTPS record in DNS (RFC 9460).',
      insight:
        'Even the Initial packet is encrypted, with keys anyone can derive from the Destination Connection ID and a constant salt in RFC 9001. This is not about secrecy; it stops middleboxes from reading and ossifying the protocol, which happened to TCP.',
    },
    sources: [{ rfc: 9000, section: '17.2.2' }, { rfc: 9000, section: '14.1' }, { rfc: 9000, section: '8.1' }, { rfc: 9001, section: '5.2' }, { rfc: 9001, section: '4.1' }],
  },
  {
    from: 'server',
    id: 'server-initial',
    label: 'Initial (ServerHello)',
    packet: packets.serverInitial,
    time: 15,
    category: 'initial',
    info: `Initial, SCID=${[...SERVER_CID].map((b) => b.toString(16).padStart(2, '0')).join('')}, ACK, CRYPTO, PADDING`,
    details: {
      what: 'The server answers with its own Initial: an ACK for the client Initial and the ServerHello with its key share. It chooses its own connection ID in the Source Connection ID field.',
      why: 'From the ServerHello on, both sides can compute the handshake keys, exactly as in TLS over TCP.',
      keyFields: L('dcid', 'scid', 'type', 'payload'),
      typical:
        'A datagram with an ack-eliciting Initial packet must also be 1200 octets. Real servers fill the room by putting the Handshake packet of the next step into the same UDP datagram (coalescing); they are shown as separate datagrams here.',
    },
    sources: [{ rfc: 9000, section: '17.2.2' }, { rfc: 9000, section: '7.2' }, { rfc: 9000, section: '12.2' }, { rfc: 9000, section: '14.1' }],
  },
  {
    from: 'server',
    id: 'server-handshake',
    label: 'Handshake (Cert, Fin)',
    packet: packets.serverHandshake,
    time: 15.1,
    category: 'handshake',
    info: 'Handshake, CRYPTO',
    details: {
      what:
        'The rest of the server handshake, encrypted with the handshake keys: EncryptedExtensions (with ALPN "h3" and the QUIC transport parameters), the certificate, CertificateVerify and Finished.',
      why: 'QUIC uses the TLS 1.3 handshake unchanged, but takes over the record layer: TLS hands its messages to QUIC, and QUIC encrypts and transports them in its own packets.',
      keyFields: L('type', 'payload', 'length'),
      typical: 'Transport parameters are QUIC settings negotiated inside TLS, for example how many streams the peer may open and how much data it may send before waiting for credit.',
    },
    sources: [{ rfc: 9000, section: '17.2.4' }, { rfc: 9001, section: '4' }, { rfc: 9001, section: '8.2' }, { rfc: 9000, section: '18' }],
  },
  {
    from: 'server',
    id: 'server-control',
    label: '1-RTT (SETTINGS)',
    packet: packets.serverHalfRtt,
    time: 15.2,
    category: 'data',
    info: 'Protected Payload (KP0)',
    details: {
      what: 'Right after its Finished the server already sends a 1-RTT packet with a short header: it opens its HTTP/3 control stream and sends its SETTINGS.',
      why: 'The server has its application keys as soon as it has sent its Finished, so it can send data half a round trip before the handshake is confirmed (0.5-RTT data).',
      keyFields: S('form', 'dcid', 'pn', 'payload'),
      typical: 'HTTP/3 uses a unidirectional control stream per side for settings, and QPACK uses two more streams for its encoder and decoder instructions.',
    },
    sources: [{ rfc: 9000, section: '17.3.1' }, { rfc: 9114, section: '6.2.1' }, { rfc: 9114, section: '7.2.4' }],
  },
  {
    from: 'client',
    id: 'client-handshake',
    label: 'Handshake (Fin)',
    packet: packets.clientHandshake,
    time: 30.2,
    category: 'handshake',
    info: 'Handshake, ACK, CRYPTO',
    details: {
      what: 'The client has checked the certificate and the server Finished. It sends its own Finished in a Handshake packet, addressed to the connection ID the server chose.',
      why: 'From now on the client uses the server connection ID. Initial keys are discarded once Handshake keys are in use, so a late attacker cannot inject Initial packets.',
      keyFields: L('dcid', 'scid', 'payload'),
      typical: 'The client also sends an ACK for the server Initial in its own Initial packet, usually in the same datagram; it is left out here.',
    },
    sources: [{ rfc: 9000, section: '17.2.4' }, { rfc: 9001, section: '4.9.1' }, { rfc: 9000, section: '7.2' }],
  },
  {
    from: 'client',
    id: 'client-request',
    label: '1-RTT (GET /)',
    packet: packets.clientRequest,
    time: 30.3,
    category: 'data',
    info: 'Protected Payload (KP0)',
    details: {
      what: 'In the same flight the client sends its HTTP/3 request: control stream with SETTINGS, and on bidirectional stream 0 a HEADERS frame with GET / (header fields compressed with QPACK).',
      why: 'Like TLS 1.3 over TCP, the first request leaves after one round trip. But TCP needed its own round trip first; QUIC saves it, and with 0-RTT on a later connection even the request could go in the very first flight.',
      keyFields: S('dcid', 'payload'),
      insight:
        'Each HTTP/3 request has its own QUIC stream. A lost packet only holds up the streams whose data was in it; the others continue. This removes the head-of-line blocking that HTTP/2 still had in TCP.',
    },
    sources: [{ rfc: 9114, section: '4.1' }, { rfc: 9114, section: '6.1' }, { rfc: 9204 }, { rfc: 9000, section: '2' }],
  },
  {
    from: 'server',
    id: 'server-response',
    label: '1-RTT (200 OK)',
    packet: packets.serverResponse,
    time: 45.5,
    category: 'data',
    info: 'Protected Payload (KP0)',
    details: {
      what: 'The server confirms the handshake with HANDSHAKE_DONE, acknowledges the client packets, and answers on stream 0: HEADERS with status 200 and a DATA frame with the page. The FIN bit of the STREAM frame closes the stream.',
      why: 'HTTP/3 frames (HEADERS, DATA) are much like HTTP/2 frames, but stream management, flow control and ordering moved down into QUIC.',
      keyFields: S('dcid', 'payload'),
      typical: 'Watch the outside: only the short header with the connection ID is readable. Port 443, UDP, and a few hundred octets, nothing more.',
      insight:
        'QUIC runs in user space in the browser and the server, not in the operating system kernel like TCP. That is why it could be deployed and improved quickly, and why it is encrypted down to almost every header bit: what middleboxes cannot see, they cannot freeze.',
    },
    sources: [{ rfc: 9000, section: '19.20' }, { rfc: 9114, section: '7.2' }, { rfc: 9000, section: '19.8' }],
  },
];

const steps: Step[] = turns.map((t) => ({
  id: t.id,
  ...dir(t.from),
  label: t.label,
  time: t.time,
  category: t.category,
  protocol: 'QUIC',
  info: t.info,
  details: t.details,
  captures: [datagram(t.from, t.packet, t.from === 'client' ? 'As sent by the client.' : 'As delivered to the client.')],
  sources: t.sources,
}));

export const http3Exchange: Exchange = {
  id: 'http3',
  title: 'HTTP/3 and QUIC',
  summary: 'QUIC over UDP sets up transport and TLS 1.3 in one round trip; HTTP/3 then runs on QUIC streams.',
  group: 'Application',
  scenario: 'A browser loads https://www.example.com/ over HTTP/3. There is no TCP connection: everything runs in UDP datagrams to port 443.',
  intro:
    'QUIC is a transport protocol built on UDP. It does what TCP does (reliable, ordered streams, congestion control) and integrates TLS 1.3, so connection setup and encryption happen in the same round trip. It carries many independent streams in one connection, and identifies connections by connection IDs instead of addresses and ports. HTTP/3 is HTTP mapped onto QUIC streams. From the outside almost nothing is visible: long headers during the handshake show version and connection IDs, short headers afterwards only the connection ID. Encrypted contents are described in the steps; their octets are stand-ins. Real implementations coalesce several packets into one datagram; here each packet has its own. Times are illustrative, with a round trip of 30 ms.',
  sources: [
    { rfc: 9000, note: 'QUIC transport' },
    { rfc: 9001, note: 'Using TLS to secure QUIC' },
    { rfc: 9002, note: 'QUIC loss detection and congestion control' },
    { rfc: 9114, note: 'HTTP/3' },
    { rfc: 9204, note: 'QPACK header compression' },
    { rfc: 8446, note: 'TLS 1.3' },
    { rfc: 9460, note: 'HTTPS DNS records' },
    { rfc: 5737, note: 'Documentation IPv4 addresses used here' },
  ],
  ...clientServer({ client: { label: 'Browser', ip: CLIENT_IP }, server: { label: 'Web server', ip: SERVER_IP, note: 'www.example.com, UDP port 443' } }),
  categories: [
    { id: 'initial', label: 'Initial', color: 'blue' },
    { id: 'handshake', label: 'Handshake', color: 'purple' },
    { id: 'data', label: '1-RTT', color: 'green' },
  ],
  steps,
};
