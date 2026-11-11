import type { Capture, Exchange, LayerInstance, Step } from '../../shared/schema';
import { icmpEcho, icmpError } from '../../shared/headers/icmp';
import { ethIpv4, ipDatagram } from '../../shared/headers/stacks';
import { LINUX_PING_DISPLAY, linuxPingData } from './common';

// Addresses: IPv4 RFC 5737, MAC RFC 9542.
// Client LAN 192.0.2.0/24, server LAN 203.0.113.64/26. Router uplinks use addresses of their own
// documentation ranges: Router A 198.51.100.2, Router B 203.0.113.2.
const CLIENT = { mac: '00:00:5e:00:53:0a', ip: '192.0.2.50' };
const R_A = { mac: '00:00:5e:00:53:01', ip: '192.0.2.1', uplink: '198.51.100.2' };
const R_B = { mac: '00:00:5e:00:53:21', ip: '203.0.113.65', uplink: '203.0.113.2' };
const SERVER = { mac: '00:00:5e:00:53:50', ip: '203.0.113.80' };

/** Router A, six routers inside the Internet cloud, Router B. */
const HOPS = 8;

const PING_ID = 0x2c4f;
const TRACE_ID = 0x5b10;

type Dir = 'c2s' | 's2c';

/** An ICMP message between client and server, on the client LAN and the server LAN. */
function endToEnd(dir: Dir, ttl: number, id: number, inner: LayerInstance[]): Capture[] {
  const c2s = dir === 'c2s';
  const ip = { src: c2s ? CLIENT.ip : SERVER.ip, dst: c2s ? SERVER.ip : CLIENT.ip, id, protocol: 1 };
  const clientLan = ethIpv4({
    link: 'lan-a',
    note: c2s ? 'As sent by the client.' : `As delivered to the client, after ${HOPS} routers.`,
    eth: c2s ? { src: CLIENT.mac, dst: R_A.mac } : { src: R_A.mac, dst: CLIENT.mac },
    ip: { ...ip, ttl: c2s ? ttl : ttl - HOPS },
    inner,
  });
  const serverLan = ethIpv4({
    link: 'lan-b',
    note: c2s ? `As delivered to the server, after ${HOPS} routers.` : 'As sent by the server.',
    eth: c2s ? { src: R_B.mac, dst: SERVER.mac } : { src: SERVER.mac, dst: R_B.mac },
    ip: { ...ip, ttl: c2s ? ttl - HOPS : ttl },
    inner,
  });
  return c2s ? [clientLan, serverLan] : [serverLan, clientLan];
}

// ---- ping
const pingData = linuxPingData(1793955600, 250000);
const pingReq = icmpEcho({ kind: 'request', identifier: PING_ID, sequence: 1, data: pingData, dataDisplay: LINUX_PING_DISPLAY });
const pingRep = icmpEcho({
  kind: 'reply',
  identifier: PING_ID,
  sequence: 1,
  data: pingData,
  dataDisplay: LINUX_PING_DISPLAY,
  notes: { identifier: 'Copied from the request.', sequence: 'Copied from the request.', data: 'Copied from the request.' },
});

// ---- traceroute -I (ICMP Echo probes, 60-octet packets: 20 IP + 8 ICMP + 32 data)
const probeData = new Uint8Array(32);
const probeAnn = {
  unverified: {
    data: 'The content of probe data differs between traceroute implementations; zeros are an assumption.',
    sequence: 'Sequence numbering of probes differs between implementations. Shown: three probes per TTL, counted from 1.',
  },
};
const probe = (seq: number) => icmpEcho({ kind: 'request', identifier: TRACE_ID, sequence: seq, data: probeData, dataDisplay: '32 octets', ...probeAnn });

const probe1 = probe(1);
const probe1Cap = ethIpv4({
  link: 'lan-a',
  note: 'As sent by the client: TTL 1.',
  eth: { src: CLIENT.mac, dst: R_A.mac },
  ip: { src: CLIENT.ip, dst: SERVER.ip, ttl: 1, id: 0x6a01, protocol: 1, notes: { ttl: 'Probe for hop 1.' } },
  inner: [probe1],
});

const probe8 = probe(22);
const probe8Cap = ethIpv4({
  link: 'lan-a',
  note: 'As sent by the client: TTL 8.',
  eth: { src: CLIENT.mac, dst: R_A.mac },
  ip: { src: CLIENT.ip, dst: SERVER.ip, ttl: 8, id: 0x6a16, protocol: 1, notes: { ttl: 'Probe for hop 8.' } },
  inner: [probe8],
});
// The same probe as it arrives at Router B, after seven routers: TTL 1 (and a different header checksum).
const probe8AtB = ethIpv4({
  link: 'wan-b',
  eth: { src: R_A.mac, dst: R_B.mac },
  ip: { src: CLIENT.ip, dst: SERVER.ip, ttl: 1, id: 0x6a16, protocol: 1 },
  inner: [probe8],
});

const probe9 = probe(25);

function timeExceeded(from: { ip: string; mac: string }, ttlAtClient: number, original: Capture, note: string): Capture {
  const msg = icmpError({
    kind: 'time-exceeded',
    original: ipDatagram(original),
    originalItems: original.layers.filter((l) => l.def.id === 'ipv4' || l.def.id === 'icmp-echo'),
  });
  return ethIpv4({
    link: 'lan-a',
    note,
    eth: { src: R_A.mac, dst: CLIENT.mac },
    ip: { src: from.ip, dst: CLIENT.ip, ttl: ttlAtClient, id: 0x0f3e, protocol: 1, df: false },
    inner: [msg],
  });
}

const te1 = timeExceeded(R_A, 64, probe1Cap, 'As sent by Router A to the client.');
const te8 = timeExceeded({ ip: R_B.uplink, mac: R_B.mac }, 64 - (HOPS - 1), probe8AtB, 'As delivered to the client, after seven routers (Router A and the six in the Internet).');

/** Info column like a packet analyzer, from the default capture. */
function withInfo(steps: Omit<Step, 'info' | 'protocol'>[]): Step[] {
  return steps.map((s) => {
    const layers = s.captures[0].layers;
    const ip = layers.find((l) => l.def.id === 'ipv4')!;
    const ttl = ip.values.ttl.display;
    const echo = layers.find((l) => l.def.id === 'icmp-echo');
    let info: string;
    if (echo) {
      const kind = echo.values.type.display.startsWith('8') ? 'request' : 'reply';
      info = `Echo (ping) ${kind} id=${echo.values.identifier.display.split(' ')[0]}, seq=${echo.values.sequence.display}, ttl=${ttl}`;
    } else {
      info = 'Time-to-live exceeded (Time to live exceeded in transit)';
    }
    return { ...s, protocol: 'ICMP', info };
  });
}

export const icmpExchange: Exchange = {
  id: 'icmp',
  title: 'ICMP',
  summary: 'Ping and traceroute: Echo Request and Reply, and Time Exceeded from the routers on the way.',
  group: 'Internet',
  scenario: 'A client pings a server on the Internet, then runs traceroute (ICMP variant, as with traceroute -I on Linux or tracert on Windows) to find the routers in between.',
  intro:
    'ICMP is how IP reports problems and answers diagnostics. Ping sends an Echo Request and measures how long the Echo Reply takes. Traceroute uses an error message on purpose: it sends probes with TTL 1, 2, 3 and so on. Each router that drops a probe because its TTL ran out answers with Time Exceeded, and its source address reveals the router. When a probe finally reaches the destination, the destination answers with an Echo Reply and traceroute stops.\n\nOnly the first and the last router are shown; the probes for hops 2 to 7 work exactly like the one for hop 8. The router addresses come from documentation ranges: Router A answers from its LAN address 192.0.2.1, Router B from its uplink address 203.0.113.2.',
  sources: [
    { rfc: 792, note: 'Internet Control Message Protocol' },
    { rfc: 1122, section: '3.2.2', note: 'ICMP requirements for hosts' },
    { rfc: 1812, section: '4.3', note: 'ICMP requirements for routers' },
    { rfc: 791, note: 'IPv4, Time to Live' },
    { rfc: 5737, note: 'Documentation IPv4 addresses used here' },
    { rfc: 9542, section: '2.1.4', note: 'Documentation MAC addresses used here' },
  ],
  participants: [
    { id: 'client', label: 'Client', kind: 'host', addr: { mac: CLIENT.mac, ipv4: CLIENT.ip }, pos: { x: 0, y: 0 }, lifeline: true },
    { id: 'routerA', label: 'Router A', kind: 'router', addr: { mac: R_A.mac, ipv4: R_A.ip }, pos: { x: 2, y: 0 }, lifeline: true, note: `LAN ${R_A.ip}, uplink ${R_A.uplink}` },
    { id: 'internet', label: 'Internet', kind: 'internet', pos: { x: 4, y: 0 }, lifeline: false, note: 'Six more routers in this example' },
    { id: 'routerB', label: 'Router B', kind: 'router', addr: { mac: R_B.mac, ipv4: R_B.uplink }, pos: { x: 6, y: 0 }, lifeline: true, note: `uplink ${R_B.uplink}, LAN ${R_B.ip}` },
    { id: 'server', label: 'Server', kind: 'server', addr: { mac: SERVER.mac, ipv4: SERVER.ip }, pos: { x: 8, y: 0 }, lifeline: true },
  ],
  links: [
    { id: 'lan-a', a: 'client', b: 'routerA', label: 'Client LAN' },
    { id: 'wan-a', a: 'routerA', b: 'internet', label: 'Uplink A' },
    { id: 'wan-b', a: 'internet', b: 'routerB', label: 'Uplink B' },
    { id: 'lan-b', a: 'routerB', b: 'server', label: 'Server LAN' },
  ],
  categories: [
    { id: 'ping', label: 'Ping', color: 'blue' },
    { id: 'probe', label: 'Traceroute probe', color: 'yellow' },
    { id: 'error', label: 'Time Exceeded', color: 'red' },
    { id: 'reply', label: 'Echo Reply', color: 'green' },
  ],
  steps: withInfo([
    // ---------------------------------------------------------------- 1 echo request
    {
      id: 'ping-request',
      from: 'client',
      to: 'server',
      path: ['client', 'routerA', 'internet', 'routerB', 'server'],
      label: 'Ping request',
      time: 0,
      category: 'ping',
      details: {
        what:
          'ping sends an ICMP Echo Request (type 8) to the server. The identifier marks this ping process, the sequence number counts the requests. The data starts with the send time, so ping can compute the round-trip time from the reply alone.',
        why: 'Echo Request and Reply test whether a host is reachable at the IP level and how long a round trip takes, without needing any application or port on the target.',
        keyFields: [
          { layer: 'icmp-echo', field: 'type' },
          { layer: 'icmp-echo', field: 'identifier' },
          { layer: 'icmp-echo', field: 'sequence' },
          { layer: 'ipv4', field: 'protocol' },
        ],
        typical: 'Linux ping sends 56 data octets by default, which makes 64 octets of ICMP and 84 of IP: hence "PING ... 56(84) bytes of data". One request per second.',
        wrong: 'No reply does not prove the host is down: many firewalls drop Echo Requests. Conversely, a reply only proves IP reachability, not that a service works.',
        insight: 'ICMP has no ports. The identifier plays that role, so several ping processes on one host can tell their replies apart.',
      },
      captures: endToEnd('c2s', 64, 0x7d21, [pingReq]),
      sources: [{ rfc: 792 }, { rfc: 1122, section: '3.2.2.6' }],
    },
    // ---------------------------------------------------------------- 2 echo reply
    {
      id: 'ping-reply',
      from: 'server',
      to: 'client',
      path: ['server', 'routerB', 'internet', 'routerA', 'client'],
      label: 'Ping reply',
      time: 10,
      category: 'reply',
      details: {
        what:
          'The server answers with an Echo Reply (type 0): same identifier, same sequence number, same data, source and destination address swapped. The client matches it by identifier and sequence number and prints the round-trip time, here 20 ms, and the TTL of the reply.',
        why: 'Returning the data unchanged lets the sender verify the reply and read its own timestamp back.',
        keyFields: [
          { layer: 'icmp-echo', field: 'type' },
          { layer: 'icmp-echo', field: 'sequence' },
          { layer: 'icmp-echo', field: 'checksum' },
          { layer: 'ipv4', field: 'ttl' },
        ],
        typical: 'ping shows "ttl=56": the server started at 64 and 8 routers decremented it. Initial values of 64 (Linux, macOS) or 128 (Windows) let you guess the operating system and the hop count.',
        wrong: 'Duplicate replies (DUP!) point to a network problem such as a loop; replies with a different sequence than expected mean earlier requests were lost or delayed.',
        insight: 'Only Type changed in the ICMP header (8 to 0), and the checksum went up by exactly 0x0800 to compensate. The one’s complement checksum makes such small changes easy to update incrementally (RFC 1624).',
      },
      captures: endToEnd('s2c', 64, 0x1b07, [pingRep]),
      sources: [{ rfc: 792 }, { rfc: 1122, section: '3.2.2.6' }, { rfc: 1624 }],
    },
    // ---------------------------------------------------------------- 3 probe TTL 1
    {
      id: 'probe-1',
      from: 'client',
      to: 'routerA',
      path: ['client', 'routerA'],
      label: 'Probe, TTL 1',
      time: 1000,
      category: 'probe',
      details: {
        what:
          'traceroute starts with a probe whose TTL is 1. It is an ordinary Echo Request addressed to the server, but it will not get further than the first router.',
        why: 'A router decrements TTL before forwarding. With TTL 1 the result is 0, so the first router must drop the packet and, as required by RFC 1812, report it to the source.',
        keyFields: [
          { layer: 'ipv4', field: 'ttl' },
          { layer: 'ipv4', field: 'dst' },
        ],
        typical: 'traceroute sends three probes per TTL by default and prints three times per hop. Only the first probe per hop is shown here.',
        insight: 'traceroute does not ask routers anything. It provokes an error message whose sender address gives the router away.',
      },
      captures: [probe1Cap],
      sources: [{ rfc: 791, section: '3.1' }, { rfc: 1812, section: '5.3.1' }],
    },
    // ---------------------------------------------------------------- 4 TE from Router A
    {
      id: 'te-1',
      from: 'routerA',
      to: 'client',
      path: ['routerA', 'client'],
      label: 'Expired at hop 1',
      time: 1000.4,
      category: 'error',
      details: {
        what:
          'Router A drops the probe and sends ICMP Time Exceeded (type 11, code 0) to the client. It quotes the dropped packet, including its IP header with TTL 1 and the Echo header with traceroute’s identifier and sequence number, so traceroute can match the error to its probe. traceroute prints hop 1: 192.0.2.1.',
        why: 'The source address of the error is the router interface it was sent from (RFC 1812, 4.3.2.4). That is the address traceroute shows for the hop.',
        keyFields: [
          { layer: 'icmp-time-exceeded', field: 'type' },
          { layer: 'icmp-time-exceeded', field: 'code' },
          { layer: 'icmp-time-exceeded', field: 'original' },
          { layer: 'ipv4', field: 'src' },
        ],
        typical: 'The quote here contains the whole 60-octet probe, because it fits easily into the 576 octets RFC 1812 allows.',
        wrong:
          'Many routers rate-limit ICMP or do not send Time Exceeded at all; traceroute then prints "* * *" for that hop although packets pass through it. Load balancing can send probes for different TTLs along different paths, so a trace may mix routers from several paths.',
        insight: 'An error message about an Echo Request is allowed. ICMP only forbids errors about ICMP error messages, to avoid endless loops.',
      },
      captures: [te1],
      sources: [{ rfc: 792 }, { rfc: 1812, section: '4.3.2.4' }, { rfc: 1812, section: '4.3.2.3' }, { rfc: 1122, section: '3.2.2' }],
    },
    // ---------------------------------------------------------------- 5 probe TTL 8
    {
      id: 'probe-8',
      from: 'client',
      to: 'routerB',
      path: ['client', 'routerA', 'internet', 'routerB'],
      label: 'Probe, TTL 8',
      time: 1100,
      category: 'probe',
      details: {
        what:
          'After the probes for TTL 2 to 7 (not shown), the probe with TTL 8 passes Router A and the six routers in the Internet, each decrementing TTL by one. It reaches Router B with TTL 1.',
        why: 'Each TTL value finds exactly one router: the one at that distance from the client.',
        keyFields: [{ layer: 'ipv4', field: 'ttl' }],
        typical: 'Typical paths across the Internet have 10 to 20 hops; the default maximum of traceroute is 30.',
      },
      captures: [probe8Cap],
      sources: [{ rfc: 1812, section: '5.3.1' }],
    },
    // ---------------------------------------------------------------- 6 TE from Router B
    {
      id: 'te-8',
      from: 'routerB',
      to: 'client',
      path: ['routerB', 'internet', 'routerA', 'client'],
      label: 'Expired at hop 8',
      time: 1109,
      category: 'error',
      details: {
        what:
          'Router B drops the probe and answers with Time Exceeded. The error leaves Router B through its uplink, so its source address is the uplink address 203.0.113.2. traceroute prints hop 8: 203.0.113.2.',
        why: 'Router B uses the address of the interface the error leaves from, not the address on the server side. traceroute therefore shows the addresses facing the client.',
        keyFields: [
          { layer: 'ipv4', field: 'src' },
          { layer: 'ipv4', field: 'ttl' },
          { layer: 'icmp-time-exceeded', field: 'original' },
        ],
        typical: 'The error itself started with TTL 64 and arrives with 57 after seven routers. Look at the quote: the probe arrived at Router B with TTL 1, not 8.',
        wrong: 'Return paths can differ from forward paths, so the time shown for a hop includes a way back that traceroute cannot see.',
      },
      captures: [te8],
      sources: [{ rfc: 1812, section: '4.3.2.4' }],
    },
    // ---------------------------------------------------------------- 7 probe TTL 9
    {
      id: 'probe-9',
      from: 'client',
      to: 'server',
      path: ['client', 'routerA', 'internet', 'routerB', 'server'],
      label: 'Probe, TTL 9',
      time: 1200,
      category: 'probe',
      details: {
        what: 'The probe with TTL 9 passes all eight routers and reaches the server with TTL 1. A host accepts packets with any TTL above zero; only forwarding needs TTL to stay above zero.',
        why: 'The destination is one hop beyond the last router, so it is reached with the first TTL that is larger than the number of routers.',
        keyFields: [{ layer: 'ipv4', field: 'ttl' }],
        insight: 'Compare the two captures: TTL 9 on the client LAN, TTL 1 on the server LAN.',
      },
      captures: endToEnd('c2s', 9, 0x6a19, [probe9]),
      sources: [{ rfc: 1122, section: '3.2.1.7' }],
    },
    // ---------------------------------------------------------------- 8 echo reply
    {
      id: 'trace-reply',
      from: 'server',
      to: 'client',
      path: ['server', 'routerB', 'internet', 'routerA', 'client'],
      label: 'Reply from server',
      time: 1210,
      category: 'reply',
      details: {
        what: 'The server answers the probe with a normal Echo Reply. For traceroute this is the signal that the destination is reached: it prints hop 9 and stops.',
        why: 'An Echo Reply instead of Time Exceeded means the probe was delivered, not dropped.',
        keyFields: [
          { layer: 'icmp-echo', field: 'type' },
          { layer: 'icmp-echo', field: 'identifier' },
        ],
        typical:
          'Classic Unix traceroute uses UDP probes to high ports (from 33434) instead; there the end is signaled by ICMP Port Unreachable from the destination. The router side works the same way.',
        wrong: 'If the destination drops Echo Requests, ICMP traceroute never sees the end and runs until its hop limit. Trying UDP or TCP probes (traceroute -T) can get further.',
      },
      captures: endToEnd('s2c', 64, 0x1b2c, [
        icmpEcho({ kind: 'reply', identifier: TRACE_ID, sequence: 25, data: probeData, dataDisplay: '32 octets', ...probeAnn }),
      ]),
      sources: [{ rfc: 792 }],
    },
  ]),
};
