import type { Capture, Exchange, Source, Step } from '../schema';
import { dns, dnsInfo, type DnsParams } from '../headers/dns';
import { ethIpv4Udp } from '../headers/stacks';

// Addresses: the client, resolver, router and the example.com name server use documentation
// addresses (RFC 5737, MAC RFC 7042). The root server a.root-servers.net and the .com server
// a.gtld-servers.net are shown with their real IPv4 addresses.
const CLIENT = { mac: '00:00:5e:00:53:0a', ip: '192.0.2.50' };
const RESOLVER = { mac: '00:00:5e:00:53:35', ip: '192.0.2.53' };
const ROUTER_MAC = '00:00:5e:00:53:01';
const ROOT = { name: 'a.root-servers.net', ip: '198.41.0.4' };
const TLD = { name: 'a.gtld-servers.net', ip: '192.5.6.30' };
const AUTH = { name: 'ns1.example.com', ip: '203.0.113.53' };
const QNAME = 'www.example.com';
const ANSWER = '203.0.113.80';

const CLIENT_PORT = 50312;

interface Leg {
  /** Query from the resolver and the matching response. */
  query: DnsParams;
  response: DnsParams;
  server: typeof ROOT;
  port: number;
  /** TTL the response has when it reaches the resolver; the number of hops is illustrative. */
  ttlIn: number;
}

const q = { name: QNAME, type: 'A' as const };

const legs: Leg[] = [
  {
    server: ROOT,
    port: 33187,
    ttlIn: 58,
    query: { id: 0x1a2b, response: false, rd: false, question: q },
    response: {
      id: 0x1a2b,
      response: true,
      aa: false,
      rd: false,
      ra: false,
      question: q,
      authority: [{ name: 'com', type: 'NS', ttl: 172800, data: TLD.name }],
      additional: [{ name: TLD.name, type: 'A', ttl: 172800, data: TLD.ip }],
    },
  },
  {
    server: TLD,
    port: 60419,
    ttlIn: 55,
    query: { id: 0xc7e0, response: false, rd: false, question: q },
    response: {
      id: 0xc7e0,
      response: true,
      aa: false,
      rd: false,
      ra: false,
      question: q,
      authority: [{ name: 'example.com', type: 'NS', ttl: 172800, data: AUTH.name }],
      additional: [{ name: AUTH.name, type: 'A', ttl: 172800, data: AUTH.ip }],
    },
  },
  {
    server: AUTH,
    port: 41022,
    ttlIn: 60,
    query: { id: 0x5d94, response: false, rd: false, question: q },
    response: { id: 0x5d94, response: true, aa: true, rd: false, ra: false, question: q, answer: [{ name: QNAME, type: 'A', ttl: 3600, data: ANSWER }] },
  },
];

const clientQuery: DnsParams = { id: 0x6c1f, response: false, rd: true, question: q };
const clientAnswer: DnsParams = {
  id: 0x6c1f,
  response: true,
  aa: false,
  rd: true,
  ra: true,
  question: q,
  answer: [{ name: QNAME, type: 'A', ttl: 3600, data: ANSWER }],
};

const SIMPLIFIED = 'Simplified: the real response lists all 13 servers in Authority and their IPv4 and IPv6 addresses in Additional. Only the first is shown.';

function lan(from: 'client' | 'resolver', msg: DnsParams, note: string): Capture {
  const c = from === 'client';
  return ethIpv4Udp({
    link: 'lan',
    note,
    eth: { src: c ? CLIENT.mac : RESOLVER.mac, dst: c ? RESOLVER.mac : CLIENT.mac },
    ip: { src: c ? CLIENT.ip : RESOLVER.ip, dst: c ? RESOLVER.ip : CLIENT.ip, ttl: 64, id: c ? 0x8d01 : 0x1f42, df: true },
    udp: c ? { srcPort: CLIENT_PORT, dstPort: 53 } : { srcPort: 53, dstPort: CLIENT_PORT },
    app: dns(msg),
  });
}

function upstream(leg: Leg, dir: 'out' | 'in', id: number): Capture {
  const out = dir === 'out';
  const msg = out ? leg.query : leg.response;
  const isReferral = !out && leg.server !== AUTH;
  return ethIpv4Udp({
    link: 'gw',
    note: out ? 'As sent by the resolver, to the router on its way out.' : 'As delivered to the resolver by the router. The TTL shows how many routers it passed; the hop count is illustrative.',
    eth: { src: out ? RESOLVER.mac : ROUTER_MAC, dst: out ? ROUTER_MAC : RESOLVER.mac },
    ip: { src: out ? RESOLVER.ip : leg.server.ip, dst: out ? leg.server.ip : RESOLVER.ip, ttl: out ? 64 : leg.ttlIn, id, df: !out ? false : true },
    udp: out ? { srcPort: leg.port, dstPort: 53 } : { srcPort: 53, dstPort: leg.port },
    app: dns({ ...msg, ...(isReferral && leg.server === ROOT ? { unverified: { authority: SIMPLIFIED, additional: SIMPLIFIED } } : {}) }),
  });
}

const PATH_OUT = (to: string) => ['resolver', 'router', 'internet', to];
const PATH_IN = (from: string) => [from, 'internet', 'router', 'resolver'];

const legIds = ['root', 'tld', 'auth'] as const;
const legNames = ['Root server', '.com server', 'example.com server'];
const legTimes: [number, number][] = [
  [0.4, 18.6],
  [18.9, 41.2],
  [41.5, 69.8],
];

const legTexts: { q: Step['details']; r: Step['details']; qs: Source[]; rs: Source[] }[] = [
  {
    q: {
      what:
        'The resolver has an empty cache. It knows only the addresses of the root servers, which are built into it (root hints). It picks one, a.root-servers.net, and asks it the same question: "A record of www.example.com?" This time RD is 0: the resolver does the work itself and does not ask the root to recurse.',
      why: 'Every resolution without cached data starts at the root, because the root is the only part of the tree a resolver can find without asking anybody.',
      keyFields: [
        { layer: 'dns', field: 'rd' },
        { layer: 'dns', field: 'id' },
        { layer: 'udp', field: 'srcPort' },
        { layer: 'ipv4', field: 'dst' },
      ],
      typical:
        'The ID and the source port are new random values for each upstream query. Resolvers that implement QNAME minimisation (RFC 9156) would only ask the root for "com" here and reveal the full name only to the server responsible for it. Before its very first query a freshly started resolver usually also asks a root server for the current list of root servers (priming, RFC 8109); that is left out here.',
      insight:
        'Real resolvers add an EDNS(0) OPT record (RFC 6891) to every upstream query to allow responses larger than 512 octets and to signal DNSSEC support. It is left out here to keep the messages small.',
    },
    r: {
      what:
        'The root server does not know www.example.com, but it knows who is responsible for com. It answers with a referral: no Answer, an NS record for com in Authority, and the address of that name server in Additional.',
      why: 'The root zone contains only the delegations to the top-level domains. Handing out referrals instead of resolving keeps root servers simple and lets them answer enormous query rates.',
      keyFields: [
        { layer: 'dns', field: 'ancount' },
        { layer: 'dns', field: 'authority' },
        { layer: 'dns', field: 'additional' },
        { layer: 'dns', field: 'aa' },
        { layer: 'dns', field: 'ra' },
      ],
      typical: 'Delegation records in the root zone have a TTL of 172800 s (2 days), so a resolver rarely needs the root for com again.',
      wrong: 'If the response is lost, the resolver waits a few hundred milliseconds and asks another root server. There are 13 root server names, each served by many anycast instances.',
      insight:
        'The A record for a.gtld-servers.net in Additional is "glue". Without it the resolver would have to resolve the name server name first, and for names inside the delegated zone that would be a chicken-and-egg problem.',
    },
    qs: [{ rfc: 1034, section: '5.3.3' }, { rfc: 1035, section: '4.1.1' }, { rfc: 5452 }, { rfc: 9156 }],
    rs: [{ rfc: 1034, section: '4.3.2' }, { rfc: 1034, section: '5.3.3' }],
  },
  {
    q: {
      what: 'The resolver sends the same question to a.gtld-servers.net, one of the name servers for com it just learned.',
      why: 'The referral said: for anything under com, ask these servers. The resolver follows it one level down the tree.',
      keyFields: [
        { layer: 'dns', field: 'question' },
        { layer: 'ipv4', field: 'dst' },
        { layer: 'udp', field: 'srcPort' },
      ],
      typical: 'The question is unchanged on every level. What changes is only whom the resolver asks.',
    },
    r: {
      what: 'The com server answers with the next referral: example.com is served by ns1.example.com, at 203.0.113.53.',
      why: 'The com zone holds the delegations of all second-level domains under com, but none of their records.',
      keyFields: [
        { layer: 'dns', field: 'authority' },
        { layer: 'dns', field: 'additional' },
      ],
      typical: 'Look at the compressed names in the Authority and Additional records: each repeats an earlier name and is replaced by a pointer to it, which keeps the message small.',
      insight:
        'ns1.example.com lies inside the zone it serves. Without the glue record from the com server, the resolver could never find its address: to resolve ns1.example.com it would have to ask ns1.example.com.',
    },
    qs: [{ rfc: 1034, section: '5.3.3' }],
    rs: [{ rfc: 1034, section: '4.2.1' }, { rfc: 1035, section: '4.1.4' }],
  },
  {
    q: {
      what: 'The resolver asks ns1.example.com, the authoritative server for example.com.',
      why: 'Only the server responsible for the zone has the actual records.',
      keyFields: [
        { layer: 'dns', field: 'question' },
        { layer: 'ipv4', field: 'dst' },
      ],
    },
    r: {
      what: 'The authoritative server answers: www.example.com has the address 203.0.113.80, cacheable for one hour. AA is set: this answer comes from the source, not from a cache.',
      why: 'The answer ends the walk down the tree. The resolver stores the answer and both referrals in its cache.',
      keyFields: [
        { layer: 'dns', field: 'aa' },
        { layer: 'dns', field: 'answer' },
        { layer: 'dns', field: 'rcode' },
      ],
      typical:
        'TTLs for host records range from a few minutes (when the operator wants to switch addresses quickly) to a day. Here 3600 s. If the name did not exist, the response would have RCODE 3 (NXDOMAIN) and a SOA record in Authority.',
      wrong:
        'If the zone is signed with DNSSEC, a validating resolver also fetches and checks signatures and keys, which adds queries. A bad signature leads to SERVFAIL for the client.',
    },
    qs: [{ rfc: 1034, section: '5.3.3' }],
    rs: [{ rfc: 1034, section: '4.3.1' }, { rfc: 1035, section: '4.1.1' }],
  },
];

let ipId = 0x2200;
const legSteps: Step[] = legs.flatMap((leg, i) => {
  const name = legNames[i];
  const t = legTexts[i];
  return [
    {
      id: `${legIds[i]}-query`,
      from: 'resolver',
      to: legIds[i],
      path: PATH_OUT(legIds[i]),
      label: `Ask ${name.replace(' server', '')}`,
      time: legTimes[i][0],
      category: 'iterative',
      protocol: 'DNS',
      info: dnsInfo(leg.query),
      details: t.q,
      captures: [upstream(leg, 'out', ipId++)],
      sources: t.qs,
    },
    {
      id: `${legIds[i]}-response`,
      from: legIds[i],
      to: 'resolver',
      path: PATH_IN(legIds[i]),
      label: i < 2 ? 'Referral' : 'Answer',
      time: legTimes[i][1],
      category: i < 2 ? 'referral' : 'answer',
      protocol: 'DNS',
      info: dnsInfo(leg.response),
      details: t.r,
      captures: [upstream(leg, 'in', 0x9000 + i)],
      sources: t.rs,
    },
  ];
});

export const dnsExchange: Exchange = {
  id: 'dns',
  title: 'DNS',
  summary: 'A recursive resolver with an empty cache walks from the root to the answer for www.example.com.',
  group: 'Application',
  scenario:
    'A laptop wants the address of www.example.com. It asks the recursive resolver of its network (192.0.2.53, for example Unbound in a home lab). The resolver has just started and its cache is empty, so it has to walk the DNS tree from the root.',
  intro:
    'DNS is a distributed, hierarchical database. No server knows all names; each zone knows only its own records and who is responsible for the zones below it. The client (a stub resolver in the operating system) sends one recursive query and expects a final answer. The recursive resolver does the actual work with iterative queries: it asks a root server, gets a referral to the com servers, asks them, gets a referral to the servers of example.com, and finally gets the answer, which it caches and passes on. The root and com servers are shown with their real names and IPv4 addresses; the example.com part uses documentation addresses, so it differs from the real example.com. Real responses from root and com list many more servers than shown. Times and hop counts are illustrative.',
  sources: [
    { rfc: 1034, note: 'DNS concepts and facilities' },
    { rfc: 1035, note: 'DNS implementation and specification' },
    { rfc: 4035, section: '3.2', note: 'AD and CD header bits' },
    { rfc: 5452, note: 'Resilience against forged answers' },
    { rfc: 6891, note: 'EDNS(0)' },
    { rfc: 8109, note: 'Priming queries' },
    { rfc: 9156, note: 'QNAME minimisation' },
    { rfc: 2606, note: 'Reserved example domain' },
    { rfc: 5737, note: 'Documentation IPv4 addresses used here' },
  ],
  participants: [
    { id: 'client', label: 'Client', kind: 'host', addr: { mac: CLIENT.mac, ipv4: CLIENT.ip }, pos: { x: 0, y: 0 }, lifeline: true, note: 'Stub resolver in the operating system' },
    { id: 'resolver', label: 'Resolver', kind: 'resolver', addr: { mac: RESOLVER.mac, ipv4: RESOLVER.ip }, pos: { x: 2, y: 0 }, lifeline: true, note: 'Recursive resolver with an empty cache' },
    { id: 'router', label: 'Router', kind: 'router', addr: { mac: ROUTER_MAC }, pos: { x: 4, y: 0 }, lifeline: false },
    { id: 'internet', label: 'Internet', kind: 'internet', pos: { x: 6, y: 0 }, lifeline: false },
    { id: 'root', label: 'Root', kind: 'server', addr: { ipv4: ROOT.ip }, pos: { x: 4, y: 1 }, lifeline: true, note: ROOT.name },
    { id: 'tld', label: '.com', kind: 'server', addr: { ipv4: TLD.ip }, pos: { x: 6, y: 1 }, lifeline: true, note: TLD.name },
    { id: 'auth', label: 'example.com', kind: 'server', addr: { ipv4: AUTH.ip }, pos: { x: 8, y: 1 }, lifeline: true, note: AUTH.name },
  ],
  links: [
    { id: 'lan', a: 'client', b: 'resolver', label: 'LAN' },
    { id: 'gw', a: 'resolver', b: 'router', label: 'LAN' },
    { id: 'up', a: 'router', b: 'internet', label: 'Uplink' },
    { id: 'i-root', a: 'internet', b: 'root', label: '' },
    { id: 'i-tld', a: 'internet', b: 'tld', label: '' },
    { id: 'i-auth', a: 'internet', b: 'auth', label: '' },
  ],
  categories: [
    { id: 'recursive', label: 'Client and resolver', color: 'blue' },
    { id: 'iterative', label: 'Iterative query', color: 'yellow' },
    { id: 'referral', label: 'Referral', color: 'purple' },
    { id: 'answer', label: 'Answer', color: 'green' },
  ],
  steps: [
    {
      id: 'client-query',
      from: 'client',
      to: 'resolver',
      path: ['client', 'resolver'],
      label: 'Recursive query',
      time: 0,
      category: 'recursive',
      protocol: 'DNS',
      info: dnsInfo(clientQuery),
      details: {
        what:
          'An application on the laptop wants to connect to www.example.com. The stub resolver of the operating system sends one query to the resolver it got by DHCP: "A record (IPv4 address) of www.example.com?" with RD (Recursion Desired) set.',
        why: 'The stub resolver is deliberately simple. It hands the whole job to the recursive resolver, which has a cache shared by all clients of the network.',
        keyFields: [
          { layer: 'dns', field: 'rd' },
          { layer: 'dns', field: 'question' },
          { layer: 'dns', field: 'id' },
          { layer: 'udp', field: 'dstPort' },
        ],
        typical:
          'DNS uses UDP port 53. A browser usually asks for A and AAAA (IPv6) at the same time; only A is shown here. The name is encoded as labels: 3 "www", 7 "example", 3 "com", 0.',
        wrong: 'If no response arrives, the stub resolver retries after a timeout (glibc: 5 s by default) and then tries the next configured resolver.',
      },
      captures: [lan('client', clientQuery, 'As sent by the client.')],
      sources: [{ rfc: 1034, section: '5.3.1' }, { rfc: 1035, section: '4.1.1' }, { rfc: 1035, section: '4.1.2' }],
    },
    ...legSteps,
    {
      id: 'client-answer',
      from: 'resolver',
      to: 'client',
      path: ['resolver', 'client'],
      label: 'Final answer',
      time: 70.1,
      category: 'answer',
      protocol: 'DNS',
      info: dnsInfo(clientAnswer),
      details: {
        what:
          'The resolver sends the answer to the client with the ID of the original query. RA is set (it offers recursion), AA is not (it is not authoritative, it only passes the answer on). The client can now connect to 203.0.113.80.',
        why: 'The client gets one final answer for its one query and never sees the referrals.',
        keyFields: [
          { layer: 'dns', field: 'id' },
          { layer: 'dns', field: 'ra' },
          { layer: 'dns', field: 'aa' },
          { layer: 'dns', field: 'answer' },
        ],
        typical:
          'The next client asking for www.example.com within the hour gets the answer straight from the cache, in well under a millisecond, with the TTL counted down. A query for another name under com skips the root, because the com referral is cached for two days.',
        insight:
          'Eight messages and 70 ms for the first lookup, one message pair and almost no time for every following one. Caching is what makes DNS fast and keeps the load on the root servers small.',
      },
      captures: [lan('resolver', clientAnswer, 'As delivered to the client.')],
      sources: [{ rfc: 1034, section: '4.3.1' }, { rfc: 1035, section: '4.1.1' }],
    },
  ],
};
