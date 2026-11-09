import type { Capture, Exchange, Source } from '../../shared/schema';
import { ethIpv4Tcp } from '../../shared/headers/stacks';
import type { TcpParams } from '../../shared/headers/tcp';
import { buildStep, type Spec } from '../spec';

// SYN flood: SYNs with forged source addresses fill the server's queue of half-open connections,
// until real clients are turned away. SYN cookies let the server answer without keeping state.
// All frames are captured on the server LAN, the only place where the whole story is visible.

const LAPTOP_IP = '192.0.2.50';
const SERVER = { mac: '00:00:5e:00:53:50', ip: '203.0.113.80', port: 80 };
const ROUTER_MAC = '00:00:5e:00:53:21';
/** Routers between the laptop and the server, as in the TCP exchange. */
const HOPS = 8;
/** Illustrative: the attacker's packets arrive with any TTL its tool sets. */
const ATTACK_TTL = 53;

const C = 'client';
const A = 'attacker';
const F = 'forged';
const S = 'server';

const toServer = (from: string) => [from, 'internet', 'router', S];
const fromServer = (to: string) => [S, 'router', 'internet', to];

const CLIENT_OPTS: TcpParams['options'] = [{ kind: 'mss', mss: 1460 }, { kind: 'nop' }, { kind: 'ws', shift: 7 }, { kind: 'nop' }, { kind: 'nop' }, { kind: 'sackPerm' }];

/** Bernstein's layout: 5 bits t mod 32, 3 bits MSS index, 24 bits keyed hash. */
const cookie = (t: number, mssIndex: number, hash24: number) => ((t % 32) * 2 ** 27 + mssIndex * 2 ** 24 + hash24) >>> 0;
const T = 19;
const MSS_INDEX = 3;
const COOKIE = cookie(T, MSS_INDEX, 0x5a3c91);
const COOKIE_FORGED = cookie(T, 0, 0x2be07d);
const hex32 = (n: number) => `0x${n.toString(16).padStart(8, '0')}`;
const COOKIE_LAYOUT =
  'The split into 5 + 3 + 24 bits follows Bernstein\'s original description. The hash value and the MSS table index are illustrative; implementations such as Linux use a different layout.';

interface Seg {
  src: { ip: string; port: number };
  dst: { ip: string; port: number };
  id: number;
  tcp: Omit<TcpParams, 'srcPort' | 'dstPort'>;
  note: string;
  inbound: boolean;
  ttl?: number;
}

function seg(s: Seg): Capture {
  return ethIpv4Tcp({
    link: 'lan',
    note: s.note,
    eth: s.inbound ? { src: ROUTER_MAC, dst: SERVER.mac } : { src: SERVER.mac, dst: ROUTER_MAC },
    ip: { src: s.src.ip, dst: s.dst.ip, ttl: s.ttl ?? (s.inbound ? 64 - HOPS : 64), id: s.id, df: !s.inbound || s.ttl === undefined },
    tcp: { ...s.tcp, srcPort: s.src.port, dstPort: s.dst.port },
  });
}

const srv = { ip: SERVER.ip, port: SERVER.port };
const IN = 'As delivered to the server.';
const OUT = 'As sent by the server.';

const RFC4987: Source = { rfc: 4987 };
const RFC9293: Source = { rfc: 9293, section: '3.5' };
const COOKIES: Source = { spec: 'D. J. Bernstein, SYN cookies, cr.yp.to/syncookies.html', note: 'the original cookie layout' };

// ---- connections
const normal = { ip: LAPTOP_IP, port: 49812, isn: 410933602, sisn: 2903114437 };
const flood1 = { ip: '198.51.100.17', port: 40112, isn: 87212931, sisn: 1720041983 };
const flood2 = { ip: '198.51.100.142', port: 58731, isn: 3010442718 };
const victim = { ip: LAPTOP_IP, port: 49813, isn: 2287416705 };
const flood3 = { ip: '198.51.100.203', port: 33017, isn: 1495020177 };
const saved = { ip: LAPTOP_IP, port: 49814, isn: 3966201450 };

const backlog = (value: string) => ({ label: 'Server: half-open connections', value });
const cookiesOn = (value: string) => ({ label: 'Server: SYN cookies', value });

const attackSyn = (f: { ip: string; port: number; isn: number }, id: number) =>
  seg({
    src: f,
    dst: srv,
    id,
    inbound: true,
    ttl: ATTACK_TTL,
    note: IN,
    tcp: { seq: f.isn, ack: 0, flags: ['SYN'], window: 1024, notes: { window: 'Flood tools send minimal SYNs: no options, any window.' } },
  });

const SPECS: Spec[] = [
  // ---- 1 normal
  {
    id: 'normal-syn',
    phase: 'normal',
    from: C,
    to: S,
    path: toServer(C),
    label: 'SYN',
    time: 0,
    category: 'normal',
    captures: [seg({ src: normal, dst: srv, id: 0x4e01, inbound: true, note: IN, tcp: { seq: normal.isn, ack: 0, flags: ['SYN'], window: 64240, options: CLIENT_OPTS } })],
    protocol: 'TCP',
    info: `${normal.port} → 80 [SYN] Seq=0 Win=64240 Len=0 MSS=1460 WS=128 SACK_PERM`,
    sources: [RFC9293],
    learned: [backlog('1 (the laptop)'), cookiesOn('off')],
    details: {
      what: 'A laptop opens a connection to a web server. The server answers the SYN and moves the connection to SYN-RECEIVED: it allocates an entry with addresses, ports, both sequence numbers and the negotiated options, and keeps it until the handshake completes.',
      why: 'The server needs to remember the SYN to recognize the final ACK. That memory is the target of the attack: it is allocated before the client has proven anything, not even that its source address is real.',
      keyFields: [{ layer: 'tcp', field: 'flagSYN' }, { layer: 'tcp', field: 'options' }],
    },
  },
  {
    id: 'normal-synack',
    phase: 'normal',
    from: S,
    to: C,
    path: fromServer(C),
    label: 'SYN, ACK',
    time: 0.2,
    category: 'normal',
    captures: [
      seg({ src: srv, dst: normal, id: 0, inbound: false, note: OUT, tcp: { seq: normal.sisn, ack: normal.isn + 1, flags: ['SYN', 'ACK'], window: 65160, options: CLIENT_OPTS } }),
    ],
    protocol: 'TCP',
    info: `80 → ${normal.port} [SYN, ACK] Seq=0 Ack=1 Win=65160 Len=0 MSS=1460 WS=128 SACK_PERM`,
    sources: [RFC9293],
    details: {
      what: 'The server answers with SYN-ACK and its own initial sequence number. The entry waits in the queue of half-open connections, often called the SYN queue or SYN backlog.',
      why: 'If no ACK arrives, the server retransmits the SYN-ACK a few times with growing intervals before it gives up. A half-open entry can therefore occupy its slot for tens of seconds.',
      keyFields: [{ layer: 'tcp', field: 'seq' }, { layer: 'tcp', field: 'ack' }],
    },
  },
  {
    id: 'normal-ack',
    phase: 'normal',
    from: C,
    to: S,
    path: toServer(C),
    label: 'ACK',
    time: 30.2,
    category: 'normal',
    captures: [seg({ src: normal, dst: srv, id: 0x4e02, inbound: true, note: IN, tcp: { seq: normal.isn + 1, ack: normal.sisn + 1, flags: ['ACK'], window: 502 } })],
    protocol: 'TCP',
    info: `${normal.port} → 80 [ACK] Seq=1 Ack=1 Win=64256 Len=0`,
    sources: [RFC9293],
    learned: [backlog('0')],
    details: {
      what: 'The laptop completes the handshake one round trip later. The server moves the connection from the SYN queue to the queue of established connections, where the application accepts it.',
      why: 'One round trip is all a slot in the SYN queue is normally needed for. The queue is sized for that: a few hundred to a few thousand entries.',
      keyFields: [{ layer: 'tcp', field: 'ack' }],
    },
  },
  // ---- 2 attack
  {
    id: 'flood-syn-1',
    phase: 'attack',
    from: A,
    to: S,
    path: toServer(A),
    label: 'SYN (forged source)',
    time: 1000,
    category: 'attack',
    captures: [attackSyn(flood1, 0x9a3e)],
    protocol: 'TCP',
    info: `${flood1.port} → 80 [SYN] Seq=0 Win=1024 Len=0, from ${flood1.ip}`,
    sources: [RFC4987, { rfc: 4987, section: '2' }],
    learned: [backlog('1 (forged)')],
    details: {
      what: `The attacker sends a SYN whose source address is not its own: ${flood1.ip} belongs to someone else, or to nobody. The server cannot tell, allocates an entry and answers.`,
      why: 'Forging the source address costs the attacker nothing and has two effects: the replies go elsewhere, so the attacker needs no bandwidth for them, and the attack cannot be traced or filtered by a single address.',
      wrong: 'Networks that filter packets with source addresses that cannot come from them (BCP 38, RFC 2827) make forged sources impossible from there. Not every network does.',
      keyFields: [{ layer: 'ipv4', field: 'src' }, { layer: 'tcp', field: 'flagSYN' }],
    },
  },
  {
    id: 'flood-synack-1',
    phase: 'attack',
    from: S,
    to: F,
    path: fromServer(F),
    label: 'SYN, ACK (nobody waits)',
    time: 1000.2,
    category: 'attack',
    lost: true,
    captures: [
      seg({
        src: srv,
        dst: flood1,
        id: 0,
        inbound: false,
        note: OUT,
        tcp: { seq: flood1.sisn, ack: flood1.isn + 1, flags: ['SYN', 'ACK'], window: 65160, options: [{ kind: 'mss', mss: 1460 }] },
      }),
    ],
    protocol: 'TCP',
    info: `80 → ${flood1.port} [SYN, ACK] Seq=0 Ack=1 Win=65160 Len=0 MSS=1460, no answer`,
    sources: [RFC4987, { rfc: 4987, section: '2.2' }],
    details: {
      what: `The SYN-ACK goes to ${flood1.ip}. No ACK ever comes back, and the entry stays in the queue while the server retransmits the SYN-ACK and waits.`,
      why: 'Attackers pick forged addresses that do not answer. A live host that receives a SYN-ACK it never asked for replies with RST, which would free the slot at once.',
      keyFields: [{ layer: 'ipv4', field: 'dst' }, { layer: 'tcp', field: 'ack' }],
    },
  },
  {
    id: 'flood-syn-2',
    phase: 'attack',
    from: A,
    to: S,
    path: toServer(A),
    label: 'SYN (forged source)',
    time: 1000.4,
    category: 'attack',
    captures: [attackSyn(flood2, 0x1c77)],
    protocol: 'TCP',
    info: `${flood2.port} → 80 [SYN] Seq=0 Win=1024 Len=0, from ${flood2.ip}`,
    sources: [RFC4987],
    learned: [backlog('full: every slot holds a forged SYN')],
    details: {
      what: 'Thousands more follow, each from a different forged address and port. Every one takes a slot in the queue for as long as the server keeps retransmitting.',
      why: 'The arithmetic favors the attacker: a SYN is 60 octets on the wire, and a slot is held for tens of seconds. A modest stream of SYNs keeps a queue of thousands of entries permanently full.',
      insight: 'A SYN flood does not exhaust bandwidth or CPU. It exhausts one small table, which is why a single attacker with little bandwidth can block a large server.',
      keyFields: [{ layer: 'ipv4', field: 'src' }, { layer: 'tcp', field: 'srcPort' }],
    },
  },
  // ---- 3 effect
  {
    id: 'victim-syn',
    phase: 'effect',
    from: C,
    to: S,
    path: toServer(C),
    label: 'SYN (dropped)',
    time: 2000,
    category: 'dropped',
    lost: true,
    captures: [seg({ src: victim, dst: srv, id: 0x4e10, inbound: true, note: IN, tcp: { seq: victim.isn, ack: 0, flags: ['SYN'], window: 64240, options: CLIENT_OPTS } })],
    protocol: 'TCP',
    info: `${victim.port} → 80 [SYN] Seq=0 Win=64240 Len=0, dropped by the server`,
    sources: [RFC4987, { rfc: 4987, section: '2' }],
    details: {
      what: 'The laptop wants a second connection. Its SYN reaches the server, but the queue is full, and the server drops the SYN without an answer.',
      why: 'The server cannot tell the real SYN from the forged ones, so it has no way to prefer it. From the laptop\'s view the server simply does not respond.',
      keyFields: [{ layer: 'tcp', field: 'flagSYN' }],
    },
  },
  {
    id: 'victim-retry',
    phase: 'effect',
    from: C,
    to: S,
    path: toServer(C),
    label: 'SYN retransmitted (dropped)',
    time: 3000,
    category: 'dropped',
    lost: true,
    captures: [seg({ src: victim, dst: srv, id: 0x4e11, inbound: true, note: IN, tcp: { seq: victim.isn, ack: 0, flags: ['SYN'], window: 64240, options: CLIENT_OPTS } })],
    protocol: 'TCP',
    info: `[TCP Retransmission] ${victim.port} → 80 [SYN] Seq=0 Win=64240 Len=0`,
    sources: [{ rfc: 6298, section: '2' }, RFC4987],
    details: {
      what: 'After one second without an answer the laptop sends the same SYN again, with the same sequence number, and waits twice as long before the next try.',
      why: 'An initial retransmission timeout of one second is what RFC 6298 specifies. The retry only has a chance if a slot happens to be free when it arrives; under a sustained flood that is rare, and after several tries the connection attempt fails.',
      keyFields: [{ layer: 'tcp', field: 'seq' }],
    },
  },
  // ---- 4 defense
  {
    id: 'cookie-flood-syn',
    phase: 'defense',
    from: A,
    to: S,
    path: toServer(A),
    label: 'SYN (forged source)',
    time: 10000,
    category: 'attack',
    captures: [attackSyn(flood3, 0x6b02)],
    protocol: 'TCP',
    info: `${flood3.port} → 80 [SYN] Seq=0 Win=1024 Len=0, from ${flood3.ip}`,
    sources: [{ rfc: 4987, section: '3.6' }, COOKIES],
    learned: [cookiesOn('on: the queue is full, so the server answers without an entry')],
    details: {
      what: 'The flood goes on, but now the server uses SYN cookies. When the queue is full it no longer drops SYNs: it answers each one and keeps nothing.',
      why: 'Linux, for example, switches to cookies only while the SYN queue overflows (net.ipv4.tcp_syncookies = 1). In normal operation the server keeps using the queue, which supports all TCP options.',
      keyFields: [{ layer: 'ipv4', field: 'src' }],
    },
  },
  {
    id: 'cookie-flood-synack',
    phase: 'defense',
    from: S,
    to: F,
    path: fromServer(F),
    label: 'SYN, ACK with cookie',
    time: 10000.2,
    category: 'defense',
    lost: true,
    captures: [
      seg({
        src: srv,
        dst: flood3,
        id: 0,
        inbound: false,
        note: OUT,
        tcp: { seq: COOKIE_FORGED, ack: flood3.isn + 1, flags: ['SYN', 'ACK'], window: 65160, options: [{ kind: 'mss', mss: 1460 }],
          notes: { seq: `Cookie ${hex32(COOKIE_FORGED)} with MSS index 0, standing for 536.` },
          unverified: { seq: COOKIE_LAYOUT },
        },
      }),
    ],
    protocol: 'TCP',
    info: `80 → ${flood3.port} [SYN, ACK] Seq=0 Ack=1 Win=65160 Len=0 MSS=1460, cookie ${hex32(COOKIE_FORGED)}`,
    sources: [{ rfc: 4987, section: '3.6' }, COOKIES],
    details: {
      what: 'The SYN-ACK still goes to the forged address and is never answered. But this time the server forgot the SYN the moment it sent the reply: no slot is used.',
      why: 'The cookie records the peer\'s MSS. The forged SYN carried no MSS option, so the server assumes 536, the IPv4 default when no MSS is announced, and encodes the matching table index. Its own MSS option still announces 1460: that is what the server can receive.',
      keyFields: [{ layer: 'tcp', field: 'seq' }],
    },
  },
  {
    id: 'cookie-syn',
    phase: 'defense',
    from: C,
    to: S,
    path: toServer(C),
    label: 'SYN',
    time: 10001,
    category: 'normal',
    captures: [seg({ src: saved, dst: srv, id: 0x4e20, inbound: true, note: IN, tcp: { seq: saved.isn, ack: 0, flags: ['SYN'], window: 64240, options: CLIENT_OPTS } })],
    protocol: 'TCP',
    info: `${saved.port} → 80 [SYN] Seq=0 Win=64240 Len=0 MSS=1460 WS=128 SACK_PERM`,
    sources: [RFC9293],
    details: {
      what: 'The laptop tries again, in the middle of the flood.',
      why: 'Its SYN looks like any other to the server. With cookies, that no longer matters: every SYN gets an answer.',
      keyFields: [{ layer: 'tcp', field: 'options' }],
    },
  },
  {
    id: 'cookie-synack',
    phase: 'defense',
    from: S,
    to: C,
    path: fromServer(C),
    label: 'SYN, ACK with cookie',
    time: 10001.2,
    category: 'defense',
    captures: [
      seg({
        src: srv,
        dst: saved,
        id: 0,
        inbound: false,
        note: OUT,
        tcp: {
          seq: COOKIE,
          ack: saved.isn + 1,
          flags: ['SYN', 'ACK'],
          window: 65160,
          options: [{ kind: 'mss', mss: 1460 }],
          notes: {
            seq: `The SYN cookie ${hex32(COOKIE)}: top 5 bits t mod 32 = ${T}, next 3 bits MSS index ${MSS_INDEX} (1460 in this example), low 24 bits a keyed hash of addresses, ports and t.`,
            options: 'Only MSS: without the timestamp option the server has no room to remember window scaling and SACK.',
          },
          unverified: { seq: COOKIE_LAYOUT },
        },
      }),
    ],
    protocol: 'TCP',
    info: `80 → ${saved.port} [SYN, ACK] Seq=0 Ack=1 Win=65160 Len=0 MSS=1460, cookie ${hex32(COOKIE)}`,
    sources: [{ rfc: 4987, section: '3.6' }, COOKIES],
    details: {
      what: 'The server answers with a sequence number that is not random: it is the SYN cookie, everything the server would have stored, packed into 32 bits. Then it forgets the connection.',
      why: 'In Bernstein\'s layout the top 5 bits hold a counter t that advances every 64 seconds, the next 3 bits an index into a table of 8 MSS values, and the low 24 bits a keyed hash over both addresses, both ports and t. Only the server knows the key, so nobody else can produce a valid cookie.',
      typical: 'The price: only 8 MSS values fit, and options the cookie cannot hold are lost. Linux hides window scaling and SACK in the timestamp option when the client sends one; this client did not, so the server announces only MSS.',
      keyFields: [{ layer: 'tcp', field: 'seq' }, { layer: 'tcp', field: 'options' }],
    },
  },
  {
    id: 'cookie-ack',
    phase: 'defense',
    from: C,
    to: S,
    path: toServer(C),
    label: 'ACK, cookie checked',
    time: 10031.2,
    category: 'normal',
    captures: [
      seg({
        src: saved,
        dst: srv,
        id: 0x4e21,
        inbound: true,
        note: IN,
        tcp: { seq: saved.isn + 1, ack: COOKIE + 1, flags: ['ACK'], window: 64240, notes: { ack: `Cookie + 1. The server subtracts 1 and gets ${hex32(COOKIE)} back.`, window: 'Not scaled: window scaling was not agreed.' } },
      }),
    ],
    protocol: 'TCP',
    info: `${saved.port} → 80 [ACK] Seq=1 Ack=1 Win=64240 Len=0`,
    sources: [{ rfc: 4987, section: '3.6' }, COOKIES, RFC9293],
    learned: [backlog('full, but bypassed by cookies')],
    details: {
      what: 'The laptop completes the handshake as usual; it does not know about cookies. The server takes the acknowledgment number minus 1, recomputes the hash for these addresses and ports, checks that t is recent, reads the MSS index, and only now creates the connection.',
      why: 'Only a client that really received the SYN-ACK knows the cookie, so the ACK proves the source address is real. Forged sources never send it, and their SYNs never cost the server any memory.',
      insight: 'SYN cookies move the state from the server into the network: the client carries it back in its ACK. A stateless server cannot be flooded with state.',
      wrong: 'An attacker could try to guess cookies with forged ACKs; the 24-bit hash makes that impractical, but firewalls that only filter SYNs should keep it in mind.',
      keyFields: [{ layer: 'tcp', field: 'ack' }],
    },
  },
];

export const synFloodExchange: Exchange = {
  id: 'syn-flood',
  title: 'Attack: SYN flood',
  summary: 'Forged SYNs fill a server\'s queue of half-open connections; SYN cookies let it answer without keeping state.',
  group: 'Learn',
  scenario: 'A laptop connects to a web server. An attacker floods the server with SYNs from forged addresses until the laptop is turned away, then the server switches to SYN cookies.',
  intro:
    'The TCP handshake makes the server remember every SYN until the final ACK arrives. A SYN flood sends SYNs that are never completed, from forged source addresses, until that memory is full. This scenario shows the attack from the server LAN, and how SYN cookies move the state into the sequence number.\n\nThe frames illustrate how the attack works; they are built with the same header builders as the protocol pages.',
  sources: [
    { rfc: 4987, note: 'TCP SYN Flooding Attacks and Common Mitigations' },
    { rfc: 9293, note: 'TCP' },
    { rfc: 6298, note: 'retransmission timer' },
    { rfc: 2827, note: 'BCP 38: ingress filtering against forged source addresses' },
    COOKIES,
  ],
  participants: [
    { id: C, label: 'Laptop', kind: 'host', addr: { ipv4: LAPTOP_IP }, pos: { x: 0, y: 0 }, lifeline: true },
    { id: A, label: 'Attacker', kind: 'attacker', pos: { x: 0, y: 1 }, lifeline: true, note: 'Sends SYNs with forged source addresses' },
    { id: F, label: 'Forged sources', kind: 'host', pos: { x: 0, y: 2 }, lifeline: true, note: '198.51.100.0/24: addresses that never sent a SYN' },
    { id: 'internet', label: 'Internet', kind: 'internet', pos: { x: 2, y: 1 }, lifeline: false },
    { id: 'router', label: 'Router', kind: 'router', addr: { mac: ROUTER_MAC }, pos: { x: 4, y: 1 }, lifeline: false },
    { id: S, label: 'Server', kind: 'server', addr: { mac: SERVER.mac, ipv4: SERVER.ip }, pos: { x: 6, y: 1 }, lifeline: true, note: 'Web server, port 80' },
  ],
  links: [
    { id: 'c-net', a: C, b: 'internet', label: 'Laptop' },
    { id: 'a-net', a: A, b: 'internet', label: 'Attacker' },
    { id: 'f-net', a: F, b: 'internet', label: 'Forged sources' },
    { id: 'up', a: 'internet', b: 'router', label: 'Uplink' },
    { id: 'lan', a: 'router', b: S, label: 'Server LAN' },
  ],
  categories: [
    { id: 'normal', label: 'Laptop', color: 'green' },
    { id: 'attack', label: 'Flood', color: 'red' },
    { id: 'dropped', label: 'Turned away', color: 'yellow' },
    { id: 'defense', label: 'SYN cookie', color: 'blue' },
  ],
  phases: [
    { id: 'normal', label: 'Normal', about: 'A handshake holds a slot in the SYN queue for one round trip.', deepDive: 'tcp' },
    { id: 'attack', label: 'Attack', about: 'Forged SYNs fill the queue and are never completed.', deepDive: 'tcp' },
    { id: 'effect', label: 'Denial of service', about: 'Real SYNs are dropped.', deepDive: 'tcp' },
    { id: 'defense', label: 'Defense', about: 'SYN cookies answer without keeping state.', deepDive: 'tcp' },
  ],
  steps: SPECS.map(buildStep),
};
