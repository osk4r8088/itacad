import type { Capture, Exchange, LayerInstance, Step } from '../../shared/schema';
import { ethIpv4Tcp } from '../../shared/headers/stacks';
import type { TcpParams } from '../../shared/headers/tcp';
import { textPayload } from '../../shared/headers/payload';

// ---- scenario constants
// Addresses come from documentation ranges: IPv4 RFC 5737, MAC RFC 7042, domain RFC 2606.

const CLIENT = { mac: '00:00:5e:00:53:0a', ip: '192.0.2.10', port: 49812 };
const ROUTER_A = { mac: '00:00:5e:00:53:01' };
const ROUTER_B = { mac: '00:00:5e:00:53:21' };
const SERVER = { mac: '00:00:5e:00:53:50', ip: '203.0.113.80', port: 80 };

/** Routers between client and server: Router A, six inside the Internet cloud, Router B. */
const HOPS = 8;
const TTL = 64;

const C_ISN = 1200000000;
const S_ISN = 3500000000;

const REQUEST = 'GET / HTTP/1.1\r\nHost: example.com\r\n\r\n';
const RESPONSE = 'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 6\r\n\r\nHello\n';
const REQ_LEN = REQUEST.length;
const RES_LEN = RESPONSE.length;


function http(kind: 'request' | 'response'): LayerInstance {
  const isReq = kind === 'request';
  return textPayload({
    id: 'http-data',
    name: isReq ? 'HTTP/1.1 request' : 'HTTP/1.1 response',
    short: 'HTTP',
    about:
      'The application data that TCP carries. TCP does not look inside it: for TCP these are just octets in a byte stream. HTTP itself is covered in its own exchange.',
    text: isReq ? REQUEST : RESPONSE,
    osi: [7],
    tcpip: 'application',
    sources: [{ rfc: 9112 }],
    summary: `${isReq ? REQ_LEN : RES_LEN} octets of HTTP`,
  });
}

type Dir = 'c2s' | 's2c';

/**
 * Builds the frame of one segment on both LANs. The TCP segment and the IP
 * addresses are the same on both; MAC addresses, TTL and the IP header
 * checksum differ, because every router builds a new frame and decrements TTL.
 */
function segment(dir: Dir, ipId: number, t: Omit<TcpParams, 'srcPort' | 'dstPort'>, payload?: LayerInstance): Capture[] {
  const c2s = dir === 'c2s';
  const tcpParams: TcpParams = {
    ...t,
    srcPort: c2s ? CLIENT.port : SERVER.port,
    dstPort: c2s ? SERVER.port : CLIENT.port,
  };
  const ip = { src: c2s ? CLIENT.ip : SERVER.ip, dst: c2s ? SERVER.ip : CLIENT.ip, id: ipId };
  const clientLan = ethIpv4Tcp({
    link: 'lan-a',
    note: c2s ? 'As sent by the client, before the first router.' : `As delivered to the client, after ${HOPS} routers.`,
    eth: c2s ? { src: CLIENT.mac, dst: ROUTER_A.mac } : { src: ROUTER_A.mac, dst: CLIENT.mac },
    ip: {
      ...ip,
      ttl: c2s ? TTL : TTL - HOPS,
      notes: { ttl: c2s ? 'Initial value of the sender.' : `${TTL} minus ${HOPS} routers.` },
    },
    tcp: tcpParams,
    ...(payload ? { payload } : {}),
  });
  const serverLan = ethIpv4Tcp({
    link: 'lan-b',
    note: c2s ? `As delivered to the server, after ${HOPS} routers.` : 'As sent by the server, before the first router.',
    eth: c2s ? { src: ROUTER_B.mac, dst: SERVER.mac } : { src: SERVER.mac, dst: ROUTER_B.mac },
    ip: {
      ...ip,
      ttl: c2s ? TTL - HOPS : TTL,
      notes: { ttl: c2s ? `${TTL} minus ${HOPS} routers.` : 'Initial value of the sender.' },
    },
    tcp: tcpParams,
    ...(payload ? { payload } : {}),
  });
  return c2s ? [clientLan, serverLan] : [serverLan, clientLan];
}

const C2S = ['client', 'routerA', 'internet', 'routerB', 'server'];
const S2C = [...C2S].reverse();

const rel = (abs: number, isn: number) => `Relative ${abs - isn} (ISN + ${abs - isn}).`;

// Info column in the style of Wireshark: relative sequence numbers, flags in Wireshark order.
const INFO_FLAGS: [string, string][] = [
  ['flagFIN', 'FIN'],
  ['flagSYN', 'SYN'],
  ['flagRST', 'RST'],
  ['flagPSH', 'PSH'],
  ['flagACK', 'ACK'],
  ['flagURG', 'URG'],
  ['flagECE', 'ECE'],
  ['flagCWR', 'CWR'],
];

function withInfo(steps: Omit<Step, 'info' | 'protocol'>[]): Step[] {
  return steps.map((s) => {
    const layers = s.captures[0].layers;
    const t = layers.find((l) => l.def.id === 'tcp')!;
    const v = (id: string) => Number(t.values[id].display.split(' ')[0]);
    const len = layers.slice(layers.indexOf(t) + 1).reduce((n, l) => n + l.bytes.length, 0);
    const [ownIsn, peerIsn] = s.from === 'client' ? [C_ISN, S_ISN] : [S_ISN, C_ISN];
    const flags = INFO_FLAGS.filter(([id]) => v(id) === 1).map(([, n]) => n);
    const parts = [`${v('srcPort')} → ${v('dstPort')} [${flags.join(', ')}]`, `Seq=${v('seq') - ownIsn}`];
    if (flags.includes('ACK')) parts.push(`Ack=${v('ack') - peerIsn}`);
    parts.push(`Win=${v('window')}`, `Len=${len}`);
    return { ...s, protocol: 'TCP', info: parts.join(' ') };
  });
}

// Timestamps: client clock starts at 1500000, server clock at 900000, both in milliseconds.
// One-way delay 10 ms. Client time t corresponds to server clock 900000 + (t - 10).

export const tcpExchange: Exchange = {
  id: 'tcp',
  title: 'TCP',
  summary: 'Three-way handshake, one request and response, four-way close.',
  group: 'Transport',
  scenario: 'A client opens a TCP connection to a web server, sends a small HTTP request, receives the response and closes the connection.',
  intro:
    'TCP gives two applications a reliable, ordered byte stream over an unreliable network. Before data can flow, both sides agree on initial sequence numbers in the three-way handshake. Each byte sent is then acknowledged, and at the end each side closes its direction of the stream separately. Follow the sequence and acknowledgment numbers from step to step: they are the core of the protocol.',
  sources: [
    { rfc: 9293, note: 'Transmission Control Protocol (2022, replaces RFC 793)' },
    { rfc: 7323, note: 'Window Scale and Timestamps' },
    { rfc: 2018, note: 'Selective Acknowledgment' },
    { rfc: 6528, note: 'Initial sequence numbers' },
    { rfc: 1122, note: 'Delayed ACK, host requirements' },
    { rfc: 791, note: 'IPv4' },
    { rfc: 894, note: 'IPv4 over Ethernet' },
    { spec: 'IEEE 802.3-2022', note: 'Ethernet' },
    { rfc: 5737, note: 'Documentation IPv4 addresses used here' },
    { rfc: 7042, note: 'Documentation MAC addresses used here' },
  ],
  participants: [
    {
      id: 'client',
      label: 'Client',
      kind: 'host',
      addr: { mac: CLIENT.mac, ipv4: CLIENT.ip },
      pos: { x: 0, y: 0 },
      lifeline: true,
      note: `Ephemeral port ${CLIENT.port}`,
    },
    { id: 'routerA', label: 'Router A', kind: 'router', addr: { mac: ROUTER_A.mac }, pos: { x: 2, y: 0 }, lifeline: false, note: 'Default gateway of the client' },
    { id: 'internet', label: 'Internet', kind: 'internet', pos: { x: 4, y: 0 }, lifeline: false, note: 'Six more routers in this example' },
    { id: 'routerB', label: 'Router B', kind: 'router', addr: { mac: ROUTER_B.mac }, pos: { x: 6, y: 0 }, lifeline: false, note: 'Default gateway of the server' },
    {
      id: 'server',
      label: 'Server',
      kind: 'server',
      addr: { mac: SERVER.mac, ipv4: SERVER.ip },
      pos: { x: 8, y: 0 },
      lifeline: true,
      note: `Listening on port ${SERVER.port}`,
    },
  ],
  links: [
    { id: 'lan-a', a: 'client', b: 'routerA', label: 'Client LAN' },
    { id: 'wan-a', a: 'routerA', b: 'internet', label: 'Uplink A' },
    { id: 'wan-b', a: 'internet', b: 'routerB', label: 'Uplink B' },
    { id: 'lan-b', a: 'routerB', b: 'server', label: 'Server LAN' },
  ],
  initialStates: { client: 'CLOSED', server: 'LISTEN' },
  categories: [
    { id: 'handshake', label: 'Handshake and ACKs', color: 'green' },
    { id: 'client-data', label: 'Data from client', color: 'yellow' },
    { id: 'server-data', label: 'Data from server', color: 'purple' },
    { id: 'closing', label: 'Closing (FIN)', color: 'gray' },
  ],
  steps: withInfo([
    // ---------------------------------------------------------------- 1 SYN
    {
      id: 'syn',
      from: 'client',
      to: 'server',
      path: C2S,
      label: 'SYN',
      time: 0,
      category: 'handshake',
      states: { client: 'SYN-SENT' },
      details: {
        what:
          'The client asks to open a connection. It picks a random Initial Sequence Number (ISN) and sends a segment with only the SYN flag set. It also announces its capabilities as options: maximum segment size, Selective Acknowledgment, timestamps and window scaling. The client is now in SYN-SENT; the server has been in LISTEN, waiting on port 80.',
        why:
          'Both sides need a starting point for numbering the bytes they will send. The ISN is chosen unpredictably so that segments from an old connection with the same ports are unlikely to fit the new one, and so that an off-path attacker cannot guess valid sequence numbers.',
        keyFields: [
          { layer: 'tcp', field: 'flagSYN' },
          { layer: 'tcp', field: 'seq' },
          { layer: 'tcp', field: 'options' },
          { layer: 'tcp', field: 'window' },
        ],
        typical:
          'Options as sent by Linux: MSS 1460, SACK-Permitted, Timestamps, NOP, Window Scale 7. Window 64240 (44 times 1460), not scaled because this is a SYN. The SYN carries no data.',
        wrong:
          'No answer (server down, packet dropped by a firewall): the client retransmits the SYN after an initial timeout of 1 second and doubles the timeout each time (RFC 6298); Linux gives up after 6 retries, about two minutes. If nothing listens on the port, the server answers with RST and the connection is refused. A SYN flood fills the server with half-open connections; SYN cookies (RFC 4987) defend against it.',
        insight:
          'SYN carries no data but still consumes one sequence number. That is how a SYN can be acknowledged: the answer acknowledges ISN + 1.',
      },
      captures: segment('c2s', 0x3a1c, {
        seq: C_ISN,
        ack: 0,
        flags: ['SYN'],
        window: 64240,
        options: [
          { kind: 'mss', mss: 1460 },
          { kind: 'sackPerm' },
          { kind: 'ts', tsval: 1500000, tsecr: 0 },
          { kind: 'nop' },
          { kind: 'ws', shift: 7 },
        ],
        notes: {
          seq: 'Client ISN, chosen at random.',
          ack: 'Ignored, because the ACK flag is not set.',
          window: 'Not scaled: windows in SYN segments never are.',
        },
      }),
      sources: [
        { rfc: 9293, section: '3.5' },
        { rfc: 9293, section: '3.4.1' },
        { rfc: 6528 },
        { rfc: 6298, section: '2' },
      ],
    },
    // ---------------------------------------------------------------- 2 SYN-ACK
    {
      id: 'synack',
      from: 'server',
      to: 'client',
      path: S2C,
      label: 'SYN-ACK',
      time: 10,
      category: 'handshake',
      states: { server: 'SYN-RECEIVED', client: 'ESTABLISHED' },
      details: {
        what:
          'The server accepts. In one segment it does two things: it acknowledges the client SYN (ACK flag, Acknowledgment Number = client ISN + 1) and sends its own SYN with its own random ISN. It answers the options it supports. The server moves to SYN-RECEIVED. When this segment arrives, the client has both its SYN acknowledged and the server ISN, so it moves to ESTABLISHED.',
        why:
          'TCP is full duplex: each direction has its own sequence numbers and must be synchronized separately. Combining the server SYN with the ACK of the client SYN saves one segment.',
        keyFields: [
          { layer: 'tcp', field: 'ack' },
          { layer: 'tcp', field: 'seq' },
          { layer: 'tcp', field: 'flagSYN' },
          { layer: 'tcp', field: 'options' },
        ],
        typical:
          'Each option is only used if both sides sent it. Here both sent SACK-Permitted, Timestamps and Window Scale, so all three are active. TSecr echoes the client TSval from the SYN.',
        wrong:
          'If this segment is lost, the client retransmits its SYN and the server retransmits its SYN, ACK after its own timeout. If the client never sent this SYN (an old duplicate arrived at the server), the client answers with RST and the server returns to LISTEN.',
        insight: 'The Acknowledgment Number is ISN + 1, not ISN: it names the next sequence number the server expects, and the SYN used up one.',
      },
      captures: segment('s2c', 0x5d30, {
        seq: S_ISN,
        ack: C_ISN + 1,
        flags: ['SYN', 'ACK'],
        window: 65160,
        options: [
          { kind: 'mss', mss: 1460 },
          { kind: 'sackPerm' },
          { kind: 'ts', tsval: 900000, tsecr: 1500000 },
          { kind: 'nop' },
          { kind: 'ws', shift: 7 },
        ],
        notes: {
          seq: 'Server ISN, chosen at random, independent of the client ISN.',
          ack: 'Client ISN + 1.',
          window: 'Not scaled: windows in SYN segments never are. 65160 is 45 times 1448 (1460 minus 12 octets of timestamp option), a typical Linux value.',
        },
      }),
      sources: [{ rfc: 9293, section: '3.5' }, { rfc: 7323, section: '2.2' }, { rfc: 2018, section: '2' }],
    },
    // ---------------------------------------------------------------- 3 ACK
    {
      id: 'ack',
      from: 'client',
      to: 'server',
      path: C2S,
      label: 'ACK',
      time: 20,
      category: 'handshake',
      states: { server: 'ESTABLISHED' },
      details: {
        what:
          'The client acknowledges the server SYN: Acknowledgment Number = server ISN + 1. When it arrives, the server moves to ESTABLISHED. The handshake is complete and both sides know both ISNs.',
        why:
          'Without this third segment the server could not be sure that the client really received its ISN, or that the SYN it answered was not an old duplicate from a previous connection.',
        keyFields: [
          { layer: 'tcp', field: 'ack' },
          { layer: 'tcp', field: 'window' },
          { layer: 'tcp', field: 'options' },
        ],
        typical:
          'From now on the Window field is scaled: 502 times 2^7 = 64256 octets. Timestamps are now in every segment (NOP, NOP, Timestamps = 12 octets, padded to 32 bits). Clients often send their first data right after this ACK, or even in the same segment.',
        wrong: 'If this ACK is lost, the server retransmits its SYN, ACK. The connection still works if the client sends data, because every data segment carries the same acknowledgment.',
        insight:
          'Why three steps and not two? Each side must send its ISN and get it acknowledged: that is four messages, and the middle two can be combined into one. With only two steps the server would have no proof that its own ISN arrived, and an old duplicate SYN could open a connection the client does not know about (RFC 9293, section 3.5).',
      },
      captures: segment('c2s', 0x3a1d, {
        seq: C_ISN + 1,
        ack: S_ISN + 1,
        flags: ['ACK'],
        window: 502,
        options: [{ kind: 'nop' }, { kind: 'nop' }, { kind: 'ts', tsval: 1500020, tsecr: 900000 }],
        notes: {
          seq: rel(C_ISN + 1, C_ISN),
          ack: 'Server ISN + 1.',
          window: 'Scaled by 2^7: 502 x 128 = 64256 octets.',
        },
      }),
      sources: [{ rfc: 9293, section: '3.5' }, { rfc: 7323, section: '2.3' }],
    },
    // ---------------------------------------------------------------- 4 request
    {
      id: 'request',
      from: 'client',
      to: 'server',
      path: C2S,
      label: 'HTTP request',
      time: 20,
      category: 'client-data',
      details: {
        what: `The client sends its HTTP request: ${REQ_LEN} octets of data. The Sequence Number is the number of the first data octet (client ISN + 1). PSH asks the receiver to hand the data to the application right away.`,
        why:
          'TCP numbers bytes, not segments. The receiver uses the sequence number to put data in the right order, discard duplicates and find gaps.',
        keyFields: [
          { layer: 'tcp', field: 'seq' },
          { layer: 'tcp', field: 'flagPSH' },
          { layer: 'ipv4', field: 'totalLength' },
          { layer: 'http-data', field: 'data' },
        ],
        typical:
          'The Acknowledgment Number repeats server ISN + 1, because the server has sent nothing new. Every segment after the SYN carries ACK.',
        wrong:
          'If the segment is lost, no acknowledgment comes back and the client retransmits after the retransmission timeout (RTO), which is computed from measured round-trip times (RFC 6298). If later segments arrive, duplicate ACKs or SACK blocks trigger a faster retransmission.',
        insight: `The next byte the client sends will have sequence number ISN + 1 + ${REQ_LEN}. The receiver will acknowledge exactly that number.`,
      },
      captures: segment(
        'c2s',
        0x3a1e,
        {
          seq: C_ISN + 1,
          ack: S_ISN + 1,
          flags: ['PSH', 'ACK'],
          window: 502,
          options: [{ kind: 'nop' }, { kind: 'nop' }, { kind: 'ts', tsval: 1500020, tsecr: 900000 }],
          notes: { seq: rel(C_ISN + 1, C_ISN) + ' Number of the first data octet.' },
        },
        http('request'),
      ),
      sources: [{ rfc: 9293, section: '3.4' }, { rfc: 9293, section: '3.9.1.2' }],
    },
    // ---------------------------------------------------------------- 5 response
    {
      id: 'response',
      from: 'server',
      to: 'client',
      path: S2C,
      label: 'HTTP response',
      time: 31,
      category: 'server-data',
      details: {
        what: `The server sends the HTTP response, ${RES_LEN} octets. The same segment acknowledges the request: Acknowledgment Number = client ISN + 1 + ${REQ_LEN}.`,
        why:
          'Acknowledgments ride along with data whenever possible ("piggybacking"). The server did not send a separate ACK for the request because the response was ready quickly.',
        keyFields: [
          { layer: 'tcp', field: 'ack' },
          { layer: 'tcp', field: 'seq' },
          { layer: 'http-data', field: 'data' },
        ],
        typical:
          'Receivers delay pure ACKs a little (RFC 1122 allows up to 500 ms; Linux uses about 40 ms) in the hope of sending them together with data, exactly as here.',
        wrong:
          'If the response is larger than the MSS, TCP splits it into several segments; at the start of a connection the sender may only send a few (initial congestion window, typically 10 segments, RFC 6928) before waiting for ACKs.',
        insight: 'Acknowledgments are cumulative: one number confirms every byte before it, no matter how many segments carried them.',
      },
      captures: segment(
        's2c',
        0x5d31,
        {
          seq: S_ISN + 1,
          ack: C_ISN + 1 + REQ_LEN,
          flags: ['PSH', 'ACK'],
          window: 509,
          options: [{ kind: 'nop' }, { kind: 'nop' }, { kind: 'ts', tsval: 900021, tsecr: 1500020 }],
          notes: {
            seq: rel(S_ISN + 1, S_ISN) + ' First data octet of the server.',
            ack: `Client ISN + 1 + ${REQ_LEN}: the request has arrived completely.`,
            window: 'Scaled by 2^7: 509 x 128 = 65152 octets.',
          },
        },
        http('response'),
      ),
      sources: [{ rfc: 9293, section: '3.4' }, { rfc: 1122, section: '4.2.3.2' }],
    },
    // ---------------------------------------------------------------- 6 ACK of response
    {
      id: 'ack-response',
      from: 'client',
      to: 'server',
      path: C2S,
      label: 'ACK of response',
      time: 41,
      category: 'handshake',
      details: {
        what: `The client acknowledges the response: Acknowledgment Number = server ISN + 1 + ${RES_LEN}. The segment carries no data.`,
        why: 'Until this acknowledgment arrives, the server must keep the response in its send buffer in case it has to retransmit it.',
        keyFields: [{ layer: 'tcp', field: 'ack' }],
        typical: 'A pure ACK is 66 octets on Ethernet: 14 Ethernet + 20 IPv4 + 32 TCP (with timestamps). Shown here with preamble and FCS as well.',
        wrong: 'A lost pure ACK is usually harmless: the next ACK covers the same bytes. Only if no later ACK arrives does the server retransmit.',
      },
      captures: segment('c2s', 0x3a1f, {
        seq: C_ISN + 1 + REQ_LEN,
        ack: S_ISN + 1 + RES_LEN,
        flags: ['ACK'],
        window: 501,
        options: [{ kind: 'nop' }, { kind: 'nop' }, { kind: 'ts', tsval: 1500041, tsecr: 900021 }],
        notes: {
          seq: rel(C_ISN + 1 + REQ_LEN, C_ISN),
          ack: `Server ISN + 1 + ${RES_LEN}.`,
          window: 'The client has consumed buffer space for the response; the window shrank by one unit of 128 octets.',
        },
        unverified: {
          window: 'Plausible illustration of a shrinking window; real values depend on buffer management of the stack.',
        },
      }),
      sources: [{ rfc: 9293, section: '3.4' }],
    },
    // ---------------------------------------------------------------- 7 FIN client
    {
      id: 'fin-client',
      from: 'client',
      to: 'server',
      path: C2S,
      label: 'FIN from client',
      time: 50,
      category: 'closing',
      states: { client: 'FIN-WAIT-1', server: 'CLOSE-WAIT' },
      details: {
        what:
          'The client has nothing more to send and closes its direction of the connection with FIN. It moves to FIN-WAIT-1. The server receives the FIN, moves to CLOSE-WAIT and tells its application that the client will send no more data (a read returns end of file).',
        why:
          'Each direction is closed separately. The client stops sending but can still receive; the server may still have data to send. This is called a half-close.',
        keyFields: [
          { layer: 'tcp', field: 'flagFIN' },
          { layer: 'tcp', field: 'seq' },
        ],
        typical: 'Here the client closes first (active close). With HTTP/1.1 the connection is persistent by default, so often the server closes it after an idle timeout instead.',
        wrong: 'If the FIN is lost, it is retransmitted like data. If one side crashes instead of closing, the other side only notices when it sends something and gets an RST back, or through keepalive probes.',
        insight: 'FIN, like SYN, consumes one sequence number. That makes it possible to acknowledge it reliably.',
      },
      captures: segment('c2s', 0x3a20, {
        seq: C_ISN + 1 + REQ_LEN,
        ack: S_ISN + 1 + RES_LEN,
        flags: ['FIN', 'ACK'],
        window: 501,
        options: [{ kind: 'nop' }, { kind: 'nop' }, { kind: 'ts', tsval: 1500050, tsecr: 900021 }],
        notes: { seq: rel(C_ISN + 1 + REQ_LEN, C_ISN) + ' The FIN occupies this number.' },
      }),
      sources: [{ rfc: 9293, section: '3.6' }],
    },
    // ---------------------------------------------------------------- 8 ACK of FIN
    {
      id: 'ack-fin-client',
      from: 'server',
      to: 'client',
      path: S2C,
      label: 'ACK of FIN',
      time: 60,
      category: 'closing',
      states: { client: 'FIN-WAIT-2' },
      details: {
        what: 'The server acknowledges the FIN: Acknowledgment Number = previous value + 1. On receipt the client moves to FIN-WAIT-2 and waits for the FIN of the server.',
        why: 'The FIN must be acknowledged like any data, otherwise the client would retransmit it.',
        keyFields: [{ layer: 'tcp', field: 'ack' }],
        typical:
          'Often the server application closes immediately, and the server sends FIN and ACK in one segment. Then the close takes three segments instead of four, and the client goes straight from FIN-WAIT-1 to TIME-WAIT. This example shows them separately.',
        wrong: 'If the server application never closes its side, the server stays in CLOSE-WAIT. Many sockets in CLOSE-WAIT usually point to an application bug: it forgot to close.',
      },
      captures: segment('s2c', 0x5d32, {
        seq: S_ISN + 1 + RES_LEN,
        ack: C_ISN + 2 + REQ_LEN,
        flags: ['ACK'],
        window: 509,
        options: [{ kind: 'nop' }, { kind: 'nop' }, { kind: 'ts', tsval: 900050, tsecr: 1500050 }],
        notes: { ack: `Client ISN + 1 + ${REQ_LEN} + 1: the extra 1 acknowledges the FIN.` },
      }),
      sources: [{ rfc: 9293, section: '3.6' }],
    },
    // ---------------------------------------------------------------- 9 FIN server
    {
      id: 'fin-server',
      from: 'server',
      to: 'client',
      path: S2C,
      label: 'FIN from server',
      time: 61,
      category: 'closing',
      states: { server: 'LAST-ACK', client: 'TIME-WAIT' },
      details: {
        what:
          'The server application closes its side too. The server sends its FIN and moves to LAST-ACK. The client receives it, and since its own FIN is already acknowledged, it moves to TIME-WAIT.',
        why: 'The server direction of the byte stream is closed now. Both sides have said they will send no more.',
        keyFields: [
          { layer: 'tcp', field: 'flagFIN' },
          { layer: 'tcp', field: 'seq' },
        ],
        typical: 'Sequence and acknowledgment numbers are the same as in the previous segment; only FIN is new.',
        wrong: 'If this FIN is lost, the server retransmits it after a timeout while in LAST-ACK.',
      },
      captures: segment('s2c', 0x5d33, {
        seq: S_ISN + 1 + RES_LEN,
        ack: C_ISN + 2 + REQ_LEN,
        flags: ['FIN', 'ACK'],
        window: 509,
        options: [{ kind: 'nop' }, { kind: 'nop' }, { kind: 'ts', tsval: 900051, tsecr: 1500050 }],
        notes: { seq: rel(S_ISN + 1 + RES_LEN, S_ISN) + ' The FIN occupies this number.' },
      }),
      sources: [{ rfc: 9293, section: '3.6' }],
    },
    // ---------------------------------------------------------------- 10 final ACK
    {
      id: 'ack-fin-server',
      from: 'client',
      to: 'server',
      path: C2S,
      label: 'ACK of FIN',
      time: 71,
      category: 'closing',
      states: { server: 'CLOSED' },
      details: {
        what:
          'The client acknowledges the server FIN. When it arrives, the server deletes the connection and is CLOSED (the listening socket stays in LISTEN for new connections). The client stays in TIME-WAIT for 2 x MSL before it is CLOSED as well.',
        why:
          'TIME-WAIT has two purposes. If this last ACK is lost, the server retransmits its FIN, and the client must still be there to acknowledge it again. And delayed segments of this connection must die out in the network before the same address and port pair can be used again.',
        keyFields: [{ layer: 'tcp', field: 'ack' }],
        typical:
          'MSL (Maximum Segment Lifetime) is 2 minutes in RFC 9293, so TIME-WAIT would be 4 minutes. Linux uses a fixed 60 seconds. Only the side that closed first goes through TIME-WAIT.',
        wrong:
          'A busy client that opens and closes many connections to the same server can run out of ephemeral ports because of sockets in TIME-WAIT. Reusing connections (HTTP keep-alive) avoids it.',
        insight: 'The last ACK itself is never acknowledged. TIME-WAIT is the answer to that problem: the client waits long enough to repeat it if needed.',
      },
      captures: segment('c2s', 0x3a21, {
        seq: C_ISN + 2 + REQ_LEN,
        ack: S_ISN + 2 + RES_LEN,
        flags: ['ACK'],
        window: 501,
        options: [{ kind: 'nop' }, { kind: 'nop' }, { kind: 'ts', tsval: 1500071, tsecr: 900051 }],
        notes: {
          seq: rel(C_ISN + 2 + REQ_LEN, C_ISN) + ' One past the client FIN.',
          ack: `Server ISN + 1 + ${RES_LEN} + 1: the extra 1 acknowledges the server FIN.`,
        },
      }),
      sources: [{ rfc: 9293, section: '3.6' }, { rfc: 9293, section: '3.4.2' }],
    },
  ]),
};

export default tcpExchange;
