import type { Capture, Exchange, Source } from '../../shared/schema';
import { dns, dnsInfo, type DnsParams } from '../../shared/headers/dns';
import { ethIpv4Udp } from '../../shared/headers/stacks';
import { buildStep, type Spec } from '../spec';

// DNS cache poisoning in the style of Kaminsky (2008): an off-path attacker races the real name
// server with forged responses and plants a false delegation in the resolver's cache.
// Same addresses as the DNS exchange; the attacker is new.

const CLIENT = { mac: '00:00:5e:00:53:0a', ip: '192.0.2.50', port: 50312 };
const RESOLVER = { mac: '00:00:5e:00:53:35', ip: '192.0.2.53' };
const ROUTER_MAC = '00:00:5e:00:53:01';
const AUTH = { name: 'ns1.example.com', ip: '203.0.113.53' };
const ATTACKER_IP = '198.51.100.66';
const WEB = '203.0.113.80';
const FAKE_WEB = '198.51.100.80';
const QNAME = 'www.example.com';

/** The old resolver sends every query from this port, chosen once at startup. */
const FIXED_PORT = 33000;
const RANDOM_PORT = 61427;
/** Illustrative hop counts: TTL on arrival at the resolver. */
const TTL_AUTH = 60;
const TTL_ATTACKER = 52;

const C = 'client';
const R = 'resolver';
const N = 'auth';
const A = 'attacker';

const fromNet = (from: string) => [from, 'internet', 'router', R];
const toNet = (to: string) => [R, 'router', 'internet', to];

function lan(from: 'client' | 'resolver', msg: DnsParams, id: number): Capture {
  const c = from === 'client';
  return ethIpv4Udp({
    link: 'lan',
    note: c ? 'As sent by the laptop.' : 'As delivered to the laptop.',
    eth: { src: c ? CLIENT.mac : RESOLVER.mac, dst: c ? RESOLVER.mac : CLIENT.mac },
    ip: { src: c ? CLIENT.ip : RESOLVER.ip, dst: c ? RESOLVER.ip : CLIENT.ip, ttl: 64, id, df: true },
    udp: c ? { srcPort: CLIENT.port, dstPort: 53 } : { srcPort: 53, dstPort: CLIENT.port },
    app: dns(msg),
  });
}

/** A query from the resolver, captured on its link to the router. */
function out(dst: string, port: number, msg: DnsParams, id: number): Capture {
  return ethIpv4Udp({
    link: 'gw',
    note: 'As sent by the resolver.',
    eth: { src: RESOLVER.mac, dst: ROUTER_MAC },
    ip: { src: RESOLVER.ip, dst, ttl: 64, id, df: true },
    udp: { srcPort: port, dstPort: 53 },
    app: dns(msg),
  });
}

/** A datagram arriving at the resolver from the Internet. */
function inbound(src: { ip: string; port: number }, dstPort: number, ttl: number, msg: DnsParams, id: number, notes?: Record<string, string>): Capture {
  return ethIpv4Udp({
    link: 'gw',
    note: 'As delivered to the resolver.',
    eth: { src: ROUTER_MAC, dst: RESOLVER.mac },
    ip: { src: src.ip, dst: RESOLVER.ip, ttl, id, df: false, ...(notes ? { notes } : {}) },
    udp: { srcPort: src.port, dstPort },
    app: dns(msg),
  });
}

const www = { name: QNAME, type: 'A' as const };
const SOA_LEFT_OUT = 'A real NXDOMAIN response also carries the zone\'s SOA record in Authority (RFC 2308), used for negative caching. It is left out here.';

const nx = (id: number, name: string): DnsParams => ({ id, response: true, aa: true, rd: false, ra: false, rcode: 3, question: { name, type: 'A' }, unverified: { authority: SOA_LEFT_OUT } });

/** The poison: an answer for the random name, plus a new delegation for the whole zone with glue that points to the attacker. */
const forged = (id: number, name: string): DnsParams => ({
  id,
  response: true,
  aa: true,
  rd: false,
  ra: false,
  question: { name, type: 'A' },
  answer: [{ name, type: 'A', ttl: 300, data: FAKE_WEB }],
  authority: [{ name: 'example.com', type: 'NS', ttl: 172800, data: AUTH.name, note: 'Looks like the real delegation.' }],
  additional: [{ name: AUTH.name, type: 'A', ttl: 172800, data: ATTACKER_IP, note: 'The poison: the name server\'s address, replaced by the attacker\'s.' }],
});

const cacheNs = (value: string) => ({ label: 'Resolver cache: ns1.example.com', value });
const laptopWww = (value: string) => ({ label: 'Laptop: www.example.com is', value });
const queryPort = (value: string) => ({ label: 'Resolver: query source port', value });

const RFC1035: Source = { rfc: 1035, section: '7.3' };
const RFC2181: Source = { rfc: 2181, section: '5.4.1', note: 'ranking data' };

const q = {
  normalClient: { id: 0x6c1f, response: false, rd: true, question: www } as DnsParams,
  normalUp: { id: 0x3f10, response: false, rd: false, question: www } as DnsParams,
  trigger: { id: 0x0a51, response: false, rd: true, question: { name: 'x7f3q.example.com', type: 'A' } } as DnsParams,
  triggerUp: { id: 0x7c41, response: false, rd: false, question: { name: 'x7f3q.example.com', type: 'A' } } as DnsParams,
  effectClient: { id: 0x6c20, response: false, rd: true, question: www } as DnsParams,
  effectUp: { id: 0x2d93, response: false, rd: false, question: www } as DnsParams,
  defenseUp: { id: 0xb3e5, response: false, rd: false, question: { name: 'zq81v.example.com', type: 'A' } } as DnsParams,
};

const realAnswer: DnsParams = { id: 0x3f10, response: true, aa: true, rd: false, ra: false, question: www, answer: [{ name: QNAME, type: 'A', ttl: 300, data: WEB }] };
const clientAnswer = (id: number, data: string, ttl: number): DnsParams => ({ id, response: true, aa: false, rd: true, ra: true, question: www, answer: [{ name: QNAME, type: 'A', ttl, data }] });
const fakeAnswer: DnsParams = { id: 0x2d93, response: true, aa: true, rd: false, ra: false, question: www, answer: [{ name: QNAME, type: 'A', ttl: 86400, data: FAKE_WEB }] };

const SPECS: Spec[] = [
  // ---- 1 normal
  {
    id: 'normal-query',
    phase: 'normal',
    from: C,
    to: R,
    path: [C, R],
    label: 'Query www.example.com',
    time: 0,
    category: 'normal',
    captures: [lan('client', q.normalClient, 0x8d01)],
    protocol: 'DNS',
    info: dnsInfo(q.normalClient),
    sources: [{ rfc: 1034, section: '5.3.1' }],
    learned: [cacheNs(`${AUTH.ip} (real)`)],
    details: {
      what: 'The laptop asks its resolver for www.example.com. The resolver knows from earlier lookups that ns1.example.com, at 203.0.113.53, is the name server for example.com.',
      why: 'Everything a resolver learns goes into its cache and is used for every client. One false entry there misleads all of them, which makes the resolver the attractive target.',
      keyFields: [{ layer: 'dns', field: 'question' }],
    },
  },
  {
    id: 'normal-up',
    phase: 'normal',
    from: R,
    to: N,
    path: toNet(N),
    label: 'Query',
    time: 0.4,
    category: 'normal',
    captures: [out(AUTH.ip, FIXED_PORT, q.normalUp, 0x51a0)],
    protocol: 'DNS',
    info: dnsInfo(q.normalUp),
    sources: [RFC1035, { rfc: 5452, section: '4' }],
    learned: [queryPort(`${FIXED_PORT}, the same for every query`)],
    details: {
      what: `The resolver asks ns1.example.com, from source port ${FIXED_PORT} and with a fresh query ID 0x3f10.`,
      why: 'The resolver accepts a response only if it comes from the address it asked, to the port it asked from, with the same ID and the same question. Of these, an attacker who cannot see the traffic has to guess only what is unpredictable: here the 16-bit ID, since this resolver uses the same port for every query.',
      keyFields: [{ layer: 'udp', field: 'srcPort' }, { layer: 'dns', field: 'id' }],
    },
  },
  {
    id: 'normal-answer',
    phase: 'normal',
    from: N,
    to: R,
    path: fromNet(N),
    label: 'Answer',
    time: 30.4,
    category: 'normal',
    captures: [inbound({ ip: AUTH.ip, port: 53 }, FIXED_PORT, TTL_AUTH, realAnswer, 0x0b11)],
    protocol: 'DNS',
    info: dnsInfo(realAnswer),
    sources: [RFC1035],
    details: {
      what: 'The real name server answers: www.example.com is 203.0.113.80, valid for 300 seconds. ID, port, address and question match, so the resolver caches it.',
      why: 'Until the TTL runs out the resolver answers from its cache and asks nobody. An attacker can only try to inject a false record when the resolver actually sends a query.',
      keyFields: [{ layer: 'dns', field: 'id' }, { layer: 'dns', field: 'answer' }],
    },
  },
  {
    id: 'normal-reply',
    phase: 'normal',
    from: R,
    to: C,
    path: [R, C],
    label: 'Answer',
    time: 30.6,
    category: 'normal',
    captures: [lan('resolver', clientAnswer(0x6c1f, WEB, 300), 0x1f42)],
    protocol: 'DNS',
    info: dnsInfo(clientAnswer(0x6c1f, WEB, 300)),
    sources: [{ rfc: 1034, section: '5.3.1' }],
    learned: [laptopWww(`${WEB} (real server)`)],
    details: {
      what: 'The laptop gets the real address.',
      why: 'This is the state the attacker wants to change, for this laptop and every other client of the resolver.',
      keyFields: [{ layer: 'dns', field: 'answer' }],
    },
  },
  // ---- 2 attack
  {
    id: 'trigger',
    phase: 'attack',
    from: A,
    to: R,
    path: fromNet(A),
    label: 'Query x7f3q.example.com',
    time: 60000,
    category: 'attack',
    captures: [inbound({ ip: ATTACKER_IP, port: 47120 }, 53, TTL_ATTACKER, q.trigger, 0x3c00)],
    protocol: 'DNS',
    info: dnsInfo(q.trigger),
    sources: [{ rfc: 5452, section: '4.1' }, { rfc: 5358, note: 'preventing open resolvers' }],
    details: {
      what: 'The attacker asks the resolver for a name that does not exist and is not in any cache: x7f3q.example.com. This is Kaminsky\'s idea: a fresh random name forces a fresh query every time.',
      why: 'Without it, the attacker would have one chance per TTL of www.example.com and then wait for the cache to expire. With random names the attacker can start a new race at any moment, as often as needed.',
      wrong: 'This resolver answers queries from the Internet, an open resolver. A resolver that only serves its own network is harder to trigger, but a client inside can be made to look up names, for example by a web page that loads images from random host names.',
      keyFields: [{ layer: 'dns', field: 'question' }, { layer: 'ipv4', field: 'src' }],
    },
  },
  {
    id: 'trigger-up',
    phase: 'attack',
    from: R,
    to: N,
    path: toNet(N),
    label: 'Query',
    time: 60000.4,
    category: 'normal',
    captures: [out(AUTH.ip, FIXED_PORT, q.triggerUp, 0x51b7)],
    protocol: 'DNS',
    info: dnsInfo(q.triggerUp),
    sources: [RFC1035],
    details: {
      what: `The resolver asks ns1.example.com, again from port ${FIXED_PORT}, with ID 0x7c41. The race begins: the real answer takes one round trip, about 30 ms.`,
      why: 'The attacker knows the question (it asked it), the server address and the port. Only the ID is unknown.',
      keyFields: [{ layer: 'dns', field: 'id' }, { layer: 'udp', field: 'srcPort' }],
    },
  },
  {
    id: 'forged-miss',
    phase: 'attack',
    from: A,
    to: R,
    path: fromNet(A),
    label: 'Forged answer, wrong ID',
    time: 60001,
    category: 'attack',
    captures: [inbound({ ip: AUTH.ip, port: 53 }, FIXED_PORT, TTL_ATTACKER, forged(0x7c40, 'x7f3q.example.com'), 0x3c01, { src: 'Forged: the attacker writes the name server\'s address as the source.' })],
    protocol: 'DNS',
    info: `${dnsInfo(forged(0x7c40, 'x7f3q.example.com'))}, ID does not match, discarded`,
    sources: [{ rfc: 5452, section: '4.3' }, { rfc: 5452, section: '9.1' }],
    details: {
      what: 'The attacker sends forged responses as fast as it can, each with a different guessed ID. The source address is forged to be ns1.example.com, and the port is right. This one has ID 0x7c40: wrong, so the resolver discards it.',
      why: 'Every forged response has a 1 in 65536 chance. Within the 30 ms of the race the attacker sends hundreds of them; if all fail, the real answer wins, and the attacker simply triggers the next random name and tries again.',
      keyFields: [{ layer: 'dns', field: 'id' }, { layer: 'ipv4', field: 'src' }],
    },
  },
  {
    id: 'forged-hit',
    phase: 'attack',
    from: A,
    to: R,
    path: fromNet(A),
    label: 'Forged answer, ID matches',
    time: 60001.1,
    category: 'attack',
    captures: [inbound({ ip: AUTH.ip, port: 53 }, FIXED_PORT, TTL_ATTACKER, forged(0x7c41, 'x7f3q.example.com'), 0x3c02, { src: 'Forged: the attacker writes the name server\'s address as the source.' })],
    protocol: 'DNS',
    info: dnsInfo(forged(0x7c41, 'x7f3q.example.com')),
    sources: [{ rfc: 5452, section: '4.3' }, { rfc: 5452, section: '6' }, RFC2181],
    learned: [cacheNs(`${ATTACKER_IP} (attacker)`)],
    details: {
      what: 'Sooner or later a guess matches: ID 0x7c41, right question, right address and port. The resolver accepts the response, and with it the records in Authority and Additional: example.com is served by ns1.example.com, and ns1.example.com is at 198.51.100.66.',
      why: 'The extra records lie within example.com, the zone this server is responsible for, so the resolver treated them as plausible. Many resolvers in 2008 replaced their cached delegation with such data. The answer for the random name is irrelevant; the delegation is the poison.',
      insight: 'The attacker poisoned not a single name but the whole zone: from now on the resolver sends every question about example.com to the attacker.',
      wrong: 'The TTL shows the trick: real answers arrive with TTL 60, forged ones with whatever the attacker\'s path gives, here 52. Resolvers do not check it, but monitoring can.',
      keyFields: [{ layer: 'dns', field: 'additional' }, { layer: 'dns', field: 'authority' }, { layer: 'ipv4', field: 'ttl' }],
    },
  },
  {
    id: 'real-late',
    phase: 'attack',
    from: N,
    to: R,
    path: fromNet(N),
    label: 'Real answer, too late',
    time: 60030.4,
    category: 'late',
    captures: [inbound({ ip: AUTH.ip, port: 53 }, FIXED_PORT, TTL_AUTH, nx(0x7c41, 'x7f3q.example.com'), 0x0b12)],
    protocol: 'DNS',
    info: `Standard query response 0x7c41 No such name A x7f3q.example.com, no query pending, discarded`,
    sources: [{ rfc: 5452, section: '9.1' }, { rfc: 2308 }],
    details: {
      what: 'The real name server answers: the name does not exist (RCODE 3, NXDOMAIN). The resolver has no open query with this ID any more and discards it.',
      why: 'The first matching response wins. The race was lost the moment the forged response arrived.',
      keyFields: [{ layer: 'dns', field: 'rcode' }],
    },
  },
  // ---- 3 effect
  {
    id: 'effect-query',
    phase: 'effect',
    from: C,
    to: R,
    path: [C, R],
    label: 'Query www.example.com',
    time: 400000,
    category: 'normal',
    captures: [lan('client', q.effectClient, 0x8d02)],
    protocol: 'DNS',
    info: dnsInfo(q.effectClient),
    sources: [{ rfc: 1034, section: '5.3.1' }],
    details: {
      what: 'Minutes later, after the cached www.example.com expired, the laptop asks again.',
      why: 'The laptop and its query are unchanged. The poison sits one step further, in the resolver\'s idea of where example.com\'s name server is.',
      keyFields: [{ layer: 'dns', field: 'question' }],
    },
  },
  {
    id: 'effect-up',
    phase: 'effect',
    from: R,
    to: A,
    path: toNet(A),
    label: 'Query to the attacker',
    time: 400000.4,
    category: 'poisoned',
    captures: [out(ATTACKER_IP, FIXED_PORT, q.effectUp, 0x51c3)],
    protocol: 'DNS',
    info: dnsInfo(q.effectUp),
    sources: [{ rfc: 1034, section: '5.3.3' }],
    details: {
      what: 'The resolver needs to ask ns1.example.com, looks up its address in the cache, and sends the query to 198.51.100.66.',
      why: 'The resolver follows its cache, as it must. The attacker no longer has to race anybody: the questions come to it.',
      keyFields: [{ layer: 'ipv4', field: 'dst' }],
    },
  },
  {
    id: 'effect-answer',
    phase: 'effect',
    from: A,
    to: R,
    path: fromNet(A),
    label: 'False answer',
    time: 400030.4,
    category: 'poisoned',
    captures: [inbound({ ip: ATTACKER_IP, port: 53 }, FIXED_PORT, TTL_ATTACKER, fakeAnswer, 0x3c10)],
    protocol: 'DNS',
    info: dnsInfo(fakeAnswer),
    sources: [RFC1035],
    details: {
      what: 'The attacker answers like an authoritative server: www.example.com is 198.51.100.80, with a long TTL of one day.',
      why: 'This response is genuine in every field: it comes from the address the resolver asked, with the right ID. No check in the DNS message itself can catch it.',
      keyFields: [{ layer: 'dns', field: 'answer' }, { layer: 'ipv4', field: 'src' }],
    },
  },
  {
    id: 'effect-reply',
    phase: 'effect',
    from: R,
    to: C,
    path: [R, C],
    label: 'False answer',
    time: 400030.6,
    category: 'poisoned',
    captures: [lan('resolver', clientAnswer(0x6c20, FAKE_WEB, 86400), 0x1f43)],
    protocol: 'DNS',
    info: dnsInfo(clientAnswer(0x6c20, FAKE_WEB, 86400)),
    sources: [{ rfc: 1034, section: '5.3.1' }],
    learned: [laptopWww(`${FAKE_WEB} (attacker)`)],
    details: {
      what: 'The laptop connects to 198.51.100.80, the attacker\'s server, believing it is www.example.com.',
      why: 'Every client of the resolver gets the same answer until the records expire.',
      insight: 'TLS limits the damage: the attacker has no valid certificate for www.example.com, so an HTTPS connection fails with a certificate error. Plain HTTP, mail without TLS and software updates without signatures are fully exposed.',
      keyFields: [{ layer: 'dns', field: 'answer' }],
    },
  },
  // ---- 4 defense
  {
    id: 'defense-up',
    phase: 'defense',
    from: R,
    to: N,
    path: toNet(N),
    label: 'Query from a random port',
    time: 900000,
    category: 'defense',
    captures: [out(AUTH.ip, RANDOM_PORT, q.defenseUp, 0x51d0)],
    protocol: 'DNS',
    info: dnsInfo(q.defenseUp),
    sources: [{ rfc: 5452, section: '9.2' }],
    learned: [cacheNs(`${AUTH.ip} (real)`), queryPort('random for every query')],
    details: {
      what: `A patched resolver, before any poisoning. The attacker triggers another random name, and the resolver asks from a random source port, here ${RANDOM_PORT}, with a random ID 0xb3e5.`,
      why: 'Random source ports were the immediate fix in 2008 and are required by RFC 5452. The attacker must now guess the port as well as the ID: with tens of thousands of possible ports the chance per forged packet falls by that factor, from 1 in 65536 to roughly 1 in a few billion.',
      keyFields: [{ layer: 'udp', field: 'srcPort' }, { layer: 'dns', field: 'id' }],
    },
  },
  {
    id: 'defense-miss',
    phase: 'defense',
    from: A,
    to: R,
    path: fromNet(A),
    label: 'Forged answer, wrong port',
    time: 900001,
    category: 'attack',
    captures: [inbound({ ip: AUTH.ip, port: 53 }, FIXED_PORT, TTL_ATTACKER, forged(0xb3e5, 'zq81v.example.com'), 0x3c20, { src: 'Forged: the attacker writes the name server\'s address as the source.' })],
    protocol: 'DNS',
    info: `${dnsInfo(forged(0xb3e5, 'zq81v.example.com'))}, no query on port ${FIXED_PORT}, discarded`,
    sources: [{ rfc: 5452, section: '4.5' }],
    details: {
      what: `Even a lucky guess of the ID fails: the forged response goes to port ${FIXED_PORT}, where no query is waiting. The resolver discards it.`,
      why: 'The port is checked before the DNS message is even looked at. Every wrong port costs the attacker the whole packet.',
      keyFields: [{ layer: 'udp', field: 'dstPort' }],
    },
  },
  {
    id: 'defense-answer',
    phase: 'defense',
    from: N,
    to: R,
    path: fromNet(N),
    label: 'Real answer accepted',
    time: 900030.4,
    category: 'defense',
    captures: [inbound({ ip: AUTH.ip, port: 53 }, RANDOM_PORT, TTL_AUTH, nx(0xb3e5, 'zq81v.example.com'), 0x0b20)],
    protocol: 'DNS',
    info: 'Standard query response 0xb3e5 No such name A zq81v.example.com',
    sources: [{ rfc: 5452 }, { rfc: 4033 }, { rfc: 4035, section: '5' }],
    details: {
      what: 'The real answer arrives on the right port and wins the race. The cache stays clean.',
      why: 'Random ports make the race nearly hopeless, but they only make guessing harder. The lasting fix is DNSSEC: the zone signs its records, and a validating resolver checks the signatures up to the root. A forged record has no valid signature and is rejected, however good the guess.',
      typical: 'Further measures: resolvers that do not answer the whole Internet (RFC 5358), random upper and lower case in the query name (0x20 encoding), and stricter rules about which extra records from a response are trusted (RFC 2181 ranking).',
      insight: 'Port randomization and DNSSEC work at different levels: one makes forgery improbable, the other makes it detectable. DNSSEC protects even against an attacker who can see the query, where no amount of randomness helps.',
      keyFields: [{ layer: 'udp', field: 'dstPort' }, { layer: 'dns', field: 'rcode' }],
    },
  },
];

export const dnsPoisoningExchange: Exchange = {
  id: 'dns-poisoning',
  title: 'Attack: DNS cache poisoning',
  summary: 'An attacker races the real name server with forged answers and plants a false delegation; random ports and DNSSEC stop it.',
  group: 'Learn',
  scenario:
    'A laptop looks up www.example.com through its resolver. An attacker on the Internet triggers lookups of random names and floods the resolver with forged answers until one matches, then receives every question about example.com.',
  intro:
    'A resolver accepts the first response that matches its query. In 2008 Dan Kaminsky showed that with a fixed source port only the 16-bit query ID stands between an off-path attacker and the cache, and that random names allow unlimited tries. This scenario shows the race, its effect, and the defenses: random source ports, and DNSSEC.\n\nThe frames illustrate how the attack works; they are built with the same header builders as the protocol pages.',
  sources: [
    { rfc: 5452, note: 'Measures for Making DNS More Resilient against Forged Answers' },
    { rfc: 3833, note: 'threat analysis of DNS' },
    { rfc: 1034, note: 'DNS concepts' },
    { rfc: 1035, section: '7.3', note: 'processing responses' },
    { rfc: 2181, section: '5.4.1', note: 'ranking data' },
    { rfc: 4033, note: 'DNSSEC introduction' },
    { rfc: 5358, note: 'preventing open resolvers' },
  ],
  participants: [
    { id: C, label: 'Laptop', kind: 'host', addr: { mac: CLIENT.mac, ipv4: CLIENT.ip }, pos: { x: 0, y: 0 }, lifeline: true },
    { id: R, label: 'Resolver', kind: 'resolver', addr: { mac: RESOLVER.mac, ipv4: RESOLVER.ip }, pos: { x: 2, y: 0 }, lifeline: true, note: 'Recursive resolver with a cache' },
    { id: 'router', label: 'Router', kind: 'router', addr: { mac: ROUTER_MAC }, pos: { x: 4, y: 0 }, lifeline: false },
    { id: 'internet', label: 'Internet', kind: 'internet', pos: { x: 6, y: 0 }, lifeline: false },
    { id: N, label: 'example.com', kind: 'server', addr: { ipv4: AUTH.ip }, pos: { x: 8, y: 0 }, lifeline: true, note: AUTH.name },
    { id: A, label: 'Attacker', kind: 'attacker', addr: { ipv4: ATTACKER_IP }, pos: { x: 6, y: 1 }, lifeline: true, note: 'Off-path: cannot see the resolver\'s traffic' },
  ],
  links: [
    { id: 'lan', a: C, b: R, label: 'LAN' },
    { id: 'gw', a: R, b: 'router', label: 'LAN' },
    { id: 'up', a: 'router', b: 'internet', label: 'Uplink' },
    { id: 'i-auth', a: 'internet', b: N, label: '' },
    { id: 'i-att', a: 'internet', b: A, label: '' },
  ],
  categories: [
    { id: 'normal', label: 'Normal resolution', color: 'green' },
    { id: 'attack', label: 'From the attacker', color: 'red' },
    { id: 'late', label: 'Lost the race', color: 'gray' },
    { id: 'poisoned', label: 'Following the poisoned cache', color: 'yellow' },
    { id: 'defense', label: 'Defended', color: 'blue' },
  ],
  phases: [
    { id: 'normal', label: 'Normal', about: 'The resolver asks the real name server and caches the answer.', deepDive: 'dns' },
    { id: 'attack', label: 'Attack', about: 'A random name starts a race; forged answers guess the query ID.', deepDive: 'dns' },
    { id: 'effect', label: 'Poisoned cache', about: 'Questions about example.com now go to the attacker.', deepDive: 'dns' },
    { id: 'defense', label: 'Defense', about: 'Random source ports make guessing hopeless; DNSSEC makes forgery detectable.', deepDive: 'dns' },
  ],
  steps: SPECS.map(buildStep),
};
