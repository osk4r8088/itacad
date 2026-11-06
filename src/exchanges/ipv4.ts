import type { Capture, Exchange, LayerInstance } from '../schema';
import { udp } from '../headers/udp';
import { icmpError } from '../headers/icmp';
import { binaryPayload } from '../headers/payload';
import { ethIpv4, ipDatagram } from '../headers/stacks';
import { filler } from './common';

// Addresses: IPv4 RFC 5737, MAC RFC 7042.
const HOST_A = { mac: '00:00:5e:00:53:0a', ip: '192.0.2.10' };
const R_A = { mac: '00:00:5e:00:53:01', ip: '192.0.2.1' };
const R_B = { mac: '00:00:5e:00:53:02', ip: '198.51.100.1' };
const HOST_B = { mac: '00:00:5e:00:53:64', ip: '198.51.100.20' };

const MTU_B = 1000;
const DATA_LEN = 1372; // UDP data; IP total length 20 + 8 + 1372 = 1400
const ID_1 = 0x4a2f;
const ID_2 = 0x4a30;

const appData = filler(DATA_LEN, 7);

function appLayer(bytes: Uint8Array, display: string): LayerInstance {
  return binaryPayload({
    id: 'app-data',
    name: 'Application data',
    short: 'Data',
    about: 'The data of some UDP application. Its content does not matter here; only its size does.',
    bytes,
    display,
    osi: [7],
    tcpip: 'application',
    sources: [],
  });
}

// ---- datagram 1: DF not set, fragmented by the router
const udp1 = udp({ srcPort: 40001, dstPort: 9000 }, { srcIp: HOST_A.ip, dstIp: HOST_B.ip }, appData);
const dgram1 = ethIpv4({
  link: 'lan-a',
  note: 'As sent by Host A on LAN A (MTU 1500): it fits.',
  eth: { src: HOST_A.mac, dst: R_A.mac },
  ip: { src: HOST_A.ip, dst: HOST_B.ip, ttl: 64, id: ID_1, protocol: 17, df: false, notes: { df: 'Not set: this application disabled Path MTU Discovery, so routers may fragment.' } },
  inner: [udp1, appLayer(appData, `${DATA_LEN} octets of application data`)],
});

// The router splits the 1380 octets of IP payload (UDP header + data) into fragments.
// Each fragment carries at most MTU - 20 octets of data, rounded down to a multiple of 8: 976.
const FRAG_DATA = Math.floor((MTU_B - 20) / 8) * 8;
const firstDataLen = FRAG_DATA - 8; // the UDP header takes 8 of the 976 octets
const restLen = 8 + DATA_LEN - FRAG_DATA;

const frag1 = ethIpv4({
  link: 'lan-b',
  note: 'First fragment, as sent by the router on LAN B (MTU 1000).',
  eth: { src: R_B.mac, dst: HOST_B.mac },
  ip: {
    src: HOST_A.ip,
    dst: HOST_B.ip,
    ttl: 63,
    id: ID_1,
    protocol: 17,
    df: false,
    mf: true,
    fragOffset: 0,
    notes: { id: 'Same as the original: this is how the receiver knows which fragments belong together.', ttl: '64 minus 1 for the router.', mf: 'More fragments follow.' },
  },
  inner: [
    udp1,
    appLayer(appData.subarray(0, firstDataLen), `first ${firstDataLen} of ${DATA_LEN} data octets`),
  ],
});

const frag2 = ethIpv4({
  link: 'lan-b',
  note: 'Second and last fragment, as sent by the router on LAN B.',
  eth: { src: R_B.mac, dst: HOST_B.mac },
  ip: {
    src: HOST_A.ip,
    dst: HOST_B.ip,
    ttl: 63,
    id: ID_1,
    protocol: 17,
    df: false,
    mf: false,
    fragOffset: FRAG_DATA / 8,
    notes: { fragOffset: `${FRAG_DATA} octets of the original payload came before this fragment.`, mf: 'Last fragment.' },
  },
  inner: [
    binaryPayload({
      id: 'ip-fragment',
      name: 'Fragment data',
      short: 'Frag',
      about:
        'The last part of the original UDP datagram: application data only, without a UDP header. Only after reassembly can Host B hand the complete datagram to UDP.',
      bytes: appData.subarray(firstDataLen),
      display: `last ${restLen} of ${DATA_LEN} data octets (no UDP header in this fragment)`,
      osi: [4],
      tcpip: 'transport',
      osiNote: 'This is a piece of the UDP datagram. It has no header of its own; the receiver only sees UDP again after reassembling the fragments in the IP layer.',
      sources: [{ rfc: 791, section: '3.2' }],
    }),
  ],
});

// ---- datagram 2: DF set (the default on Linux), too big for LAN B
const udp2 = udp({ srcPort: 40002, dstPort: 9000 }, { srcIp: HOST_A.ip, dstIp: HOST_B.ip }, appData);
const dgram2 = ethIpv4({
  link: 'lan-a',
  note: 'As sent by Host A on LAN A.',
  eth: { src: HOST_A.mac, dst: R_A.mac },
  ip: { src: HOST_A.ip, dst: HOST_B.ip, ttl: 64, id: ID_2, protocol: 17, df: true, notes: { df: 'Set: routers must not fragment this packet.' } },
  inner: [udp2, appLayer(appData, `${DATA_LEN} octets of application data`)],
});

const original2 = ipDatagram(dgram2);
const fragNeeded = icmpError({
  kind: 'frag-needed',
  nextHopMtu: MTU_B,
  original: original2,
  originalItems: dgram2.layers.filter((l) => l.def.id === 'ipv4' || l.def.id === 'udp'),
  notes: { nextHopMtu: 'The MTU of LAN B.' },
});
const icmpBack: Capture = ethIpv4({
  link: 'lan-a',
  note: 'As sent by the router on LAN A. 576 octets: the maximum RFC 1812 suggests for ICMP errors.',
  eth: { src: R_A.mac, dst: HOST_A.mac },
  ip: { src: R_A.ip, dst: HOST_A.ip, ttl: 64, id: 0x0e11, protocol: 1, df: false, notes: { src: 'The router interface the error is sent from (RFC 1812, 4.3.2.4).' } },
  inner: [fragNeeded],
});

export const ipv4Exchange: Exchange = {
  id: 'ipv4',
  title: 'IPv4',
  summary: 'A packet crosses a router: TTL, MAC rewrite, fragmentation and Path MTU Discovery.',
  group: 'Internet',
  scenario:
    'Host A sends two 1400-octet UDP datagrams to Host B on another network. The router between them forwards onto a link with an MTU of only 1000 octets. The first datagram may be fragmented; the second has Don’t Fragment set.',
  intro:
    'IP delivers packets across networks, one hop at a time. At every router the packet gets a new Ethernet frame and a TTL one lower, while source and destination address stay the same. When the next link cannot carry a packet in one piece (its MTU is too small), IPv4 can split it into fragments that only the destination puts back together. Today hosts prefer to avoid that: they set Don’t Fragment and let routers report the bottleneck instead (Path MTU Discovery).\n\nIPv6 note: IPv6 routers never fragment. A packet that is too big is always dropped with an ICMPv6 "Packet Too Big" message, only the source may fragment (with a Fragment extension header), and every IPv6 link must carry at least 1280 octets (RFC 8200). The IPv6 header has no checksum and no fragmentation fields at all.\n\nThe MTU of 1000 on LAN B is unusual and chosen to make the effect visible; real bottlenecks are tunnels and VPNs (for example 1420 for WireGuard) or PPPoE (1492).',
  sources: [
    { rfc: 791, note: 'Internet Protocol' },
    { rfc: 1812, note: 'Requirements for IPv4 routers' },
    { rfc: 1191, note: 'Path MTU Discovery' },
    { rfc: 792, note: 'ICMP' },
    { rfc: 6864, note: 'Identification field' },
    { rfc: 768, note: 'UDP' },
    { rfc: 8200, note: 'IPv6, for the comparison' },
    { rfc: 8900, note: 'IP fragmentation considered fragile' },
    { rfc: 5737, note: 'Documentation IPv4 addresses used here' },
    { rfc: 7042, note: 'Documentation MAC addresses used here' },
  ],
  participants: [
    { id: 'hostA', label: 'Host A', kind: 'host', addr: { mac: HOST_A.mac, ipv4: HOST_A.ip }, pos: { x: 0, y: 0 }, lifeline: true },
    {
      id: 'router',
      label: 'Router',
      kind: 'router',
      addr: { mac: R_A.mac, ipv4: R_A.ip },
      pos: { x: 3, y: 0 },
      lifeline: true,
      note: `LAN A: ${R_A.ip} / ${R_A.mac}\nLAN B: ${R_B.ip} / ${R_B.mac}`,
    },
    { id: 'hostB', label: 'Host B', kind: 'host', addr: { mac: HOST_B.mac, ipv4: HOST_B.ip }, pos: { x: 6, y: 0 }, lifeline: true },
  ],
  links: [
    { id: 'lan-a', a: 'hostA', b: 'router', label: 'LAN A, MTU 1500' },
    { id: 'lan-b', a: 'router', b: 'hostB', label: 'LAN B, MTU 1000' },
  ],
  categories: [
    { id: 'packet', label: 'Original packets', color: 'blue' },
    { id: 'fragment', label: 'Fragments', color: 'yellow' },
    { id: 'icmp', label: 'ICMP error', color: 'red' },
  ],
  steps: [
    // ---------------------------------------------------------------- 1
    {
      id: 'dgram1',
      from: 'hostA',
      to: 'router',
      path: ['hostA', 'router'],
      label: 'Datagram, 1400 B',
      time: 0,
      category: 'packet',
      protocol: 'UDP',
      info: '40001 → 9000 Len=1372',
      details: {
        what:
          'Host A sends a UDP datagram of 1400 octets (20 IPv4 + 8 UDP + 1372 data) to Host B. Host B is on another network, so the frame goes to the router MAC address; the IP destination is Host B. Don’t Fragment is not set.',
        why:
          'Routing works on the IP destination, delivery on the current link works on the MAC address. LAN A has an MTU of 1500, so the packet fits on this first link.',
        keyFields: [
          { layer: 'ipv4', field: 'totalLength' },
          { layer: 'ipv4', field: 'df' },
          { layer: 'ipv4', field: 'id' },
          { layer: 'ipv4', field: 'ttl' },
        ],
        typical:
          'Linux sets DF on almost everything by default. A socket has to opt out explicitly (IP_PMTUDISC_DONT) to send packets like this one, which some UDP applications do to avoid dealing with path MTU at all.',
        insight: 'The sender does not know the MTU of links further away. It only knows its own: 1500 here.',
      },
      captures: [dgram1],
      sources: [{ rfc: 791, section: '3.1' }, { rfc: 1122, section: '3.3.1' }],
    },
    // ---------------------------------------------------------------- 2
    {
      id: 'frag1',
      from: 'router',
      to: 'hostB',
      path: ['router', 'hostB'],
      label: 'Fragment 1 of 2',
      time: 0.2,
      category: 'fragment',
      protocol: 'IPv4',
      info: `Fragmented IP protocol (proto=UDP 17, off=0, ID=${ID_1.toString(16)})`,
      details: {
        what: `The router decrements TTL to 63 and looks up Host B: it is on LAN B, MTU ${MTU_B}. The packet (1400) is too big and DF is not set, so the router fragments it. Each fragment gets its own copy of the IP header with the same Identification. This first fragment carries the first ${FRAG_DATA} octets of the original payload (the UDP header and ${firstDataLen} octets of data), has More Fragments set and Fragment Offset 0.`,
        why: `A fragment may carry at most ${MTU_B} - 20 = ${MTU_B - 20} octets of data, and fragment offsets count in units of 8 octets, so every fragment except the last must carry a multiple of 8: ${FRAG_DATA}.`,
        keyFields: [
          { layer: 'ipv4', field: 'mf' },
          { layer: 'ipv4', field: 'fragOffset' },
          { layer: 'ipv4', field: 'totalLength' },
          { layer: 'ipv4', field: 'id' },
          { layer: 'ipv4', field: 'checksum' },
        ],
        typical:
          'The router also rewrites the Ethernet header (its LAN B MAC address as source, Host B as destination) and recomputes the header checksum, because TTL, length and flags changed. Source and destination IP address stay the same.',
        wrong:
          'Fragmentation costs routers effort, and if any fragment is lost the whole datagram is lost: there is no retransmission of single fragments. Firewalls and NAT devices often drop fragments because only the first one has port numbers. RFC 8900 calls IP fragmentation fragile for these reasons.',
        insight: 'The UDP header is only in the first fragment. Its Length and Checksum still describe the whole datagram, so UDP can only check them after reassembly.',
      },
      captures: [frag1],
      sources: [{ rfc: 791, section: '3.2' }, { rfc: 1812, section: '5.2.6' }, { rfc: 8900 }],
    },
    // ---------------------------------------------------------------- 3
    {
      id: 'frag2',
      from: 'router',
      to: 'hostB',
      path: ['router', 'hostB'],
      label: 'Fragment 2 of 2',
      time: 0.3,
      category: 'fragment',
      protocol: 'IPv4',
      info: `Fragmented IP protocol (proto=UDP 17, off=${FRAG_DATA}, ID=${ID_1.toString(16)}), last fragment, reassembled: 40001 → 9000 Len=1372`,
      details: {
        what: `The second fragment carries the remaining ${restLen} octets with Fragment Offset ${FRAG_DATA / 8} (that is ${FRAG_DATA} octets) and More Fragments cleared. Host B collects fragments by source, destination, protocol and Identification, places each at its offset and, once the last one with MF = 0 has arrived and no gaps remain, hands the complete 1380-octet UDP datagram to UDP.`,
        why: 'Only the destination reassembles. Fragments may take different paths and arrive in any order; routers in between never put them back together.',
        keyFields: [
          { layer: 'ipv4', field: 'fragOffset' },
          { layer: 'ipv4', field: 'mf' },
          { layer: 'ipv4', field: 'totalLength' },
        ],
        typical: `Check the arithmetic: ${FRAG_DATA} + ${restLen} = 1380 = 8 (UDP header) + 1372 (data). The fragment total lengths are ${20 + FRAG_DATA} and ${20 + restLen}.`,
        wrong:
          'If a fragment never arrives, Host B discards the incomplete datagram after a timeout (Linux: 30 seconds) and may send ICMP Time Exceeded with code 1 (fragment reassembly time exceeded).',
        insight: 'Fragment Offset has only 13 bits, so it counts in 8-octet units to cover the full 65535-octet range of an IP packet.',
      },
      captures: [frag2],
      sources: [{ rfc: 791, section: '3.2' }, { rfc: 1122, section: '3.3.2' }],
    },
    // ---------------------------------------------------------------- 4
    {
      id: 'dgram2',
      from: 'hostA',
      to: 'router',
      path: ['hostA', 'router'],
      label: 'Datagram with DF set',
      time: 1000,
      category: 'packet',
      protocol: 'UDP',
      info: '40002 → 9000 Len=1372 [DF]',
      details: {
        what:
          'A second application on Host A sends a datagram of the same size, this time with Don’t Fragment set, as Linux does by default. It reaches the router like the first one.',
        why: 'With DF set the sender asks: "do not fragment, tell me instead". This is the basis of Path MTU Discovery (RFC 1191).',
        keyFields: [
          { layer: 'ipv4', field: 'df' },
          { layer: 'ipv4', field: 'totalLength' },
        ],
        typical: 'TCP on modern systems sets DF on every segment and discovers the path MTU this way; the MSS option only covers the links at both ends.',
        insight: 'The router has to drop this packet. What matters is that it tells the sender why.',
      },
      captures: [dgram2],
      sources: [{ rfc: 1191, section: '3' }],
    },
    // ---------------------------------------------------------------- 5
    {
      id: 'frag-needed',
      from: 'router',
      to: 'hostA',
      path: ['router', 'hostA'],
      label: 'Fragmentation needed',
      time: 1000.2,
      category: 'icmp',
      protocol: 'ICMP',
      info: `Destination unreachable (Fragmentation needed), next-hop MTU ${MTU_B}`,
      details: {
        what: `The router drops the datagram and sends ICMP Destination Unreachable, code 4 "fragmentation needed and DF set", back to Host A. The message names the MTU of the bottleneck link (${MTU_B}) and quotes the start of the dropped packet, so Host A can tell which socket it concerns.`,
        why: 'Host A now knows that packets to Host B must not exceed 1000 octets. It caches this path MTU for the destination (Linux: for 10 minutes).',
        keyFields: [
          { layer: 'icmp-frag-needed', field: 'code' },
          { layer: 'icmp-frag-needed', field: 'nextHopMtu' },
          { layer: 'icmp-frag-needed', field: 'original' },
          { layer: 'ipv4', field: 'src' },
        ],
        typical:
          'What happens next depends on the sender. TCP simply sends smaller segments. For UDP the data is lost; with the Linux default (IP_PMTUDISC_WANT) the kernel fragments later oversized datagrams itself at the source, and a socket with IP_PMTUDISC_DO gets the error EMSGSIZE and must send smaller datagrams.',
        wrong:
          'Firewalls that block all ICMP also block these messages. The sender then never learns the path MTU, and large packets simply vanish while small ones work: a "PMTU black hole", typical symptom: a connection opens fine but hangs as soon as large data flows. RFC 4821 (Packetization Layer PMTUD) avoids depending on ICMP.',
        insight: 'The quoted original still shows TTL 64. A Linux router checks the size before it decrements TTL, so it quotes the packet exactly as it arrived; other implementations may quote it after the decrement.',
      },
      captures: [icmpBack],
      sources: [{ rfc: 1191, section: '4' }, { rfc: 792 }, { rfc: 1812, section: '4.3.2.3' }, { rfc: 4821 }],
    },
  ],
};

export const ipv4Fragments = { original: dgram1, fragments: [frag1, frag2] };
