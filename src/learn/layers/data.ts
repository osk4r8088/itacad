import type { OsiLayer, Source } from '../../shared/schema';
import { arpDef } from '../../shared/headers/arp';
import { icmpEchoDef } from '../../shared/headers/icmp';
import { longDef } from '../../shared/headers/quic';
import { tlsRecordDef } from '../../shared/headers/tls';
import { packetDef } from '../../shared/headers/ssh';

// What the overview says about each OSI layer. Names and short descriptions come from
// src/shared/layers.ts; the notes on protocols that do not fit cleanly come from their header definitions.

export interface Problem {
  symptom: string;
  /** Linux commands that show the problem. */
  check: string[];
}

export interface LayerFacts {
  job: string;
  /** Common name of the unit of data. */
  unit: string;
  addresses: string;
  devices: string;
  /** Ids from src/tools/registry.ts. */
  tools: string[];
  problems: Problem[];
}

export const UNIT_NOTE =
  'The names segment, packet and frame are common usage, not ISO terms: ISO/IEC 7498-1 calls the unit of every layer an (N)-protocol-data-unit. UDP\'s unit is called a datagram.';

export const LAYERS: Record<OsiLayer, LayerFacts> = {
  7: {
    job: 'The protocols applications speak with each other: fetching pages, sending mail, resolving names.',
    unit: 'Message (data)',
    addresses: 'Names and identifiers: host names (www.example.com), URLs, e-mail addresses.',
    devices: 'Servers and clients; proxies, web application firewalls and load balancers that look into the application data.',
    tools: ['dns-records', 'decoder'],
    problems: [
      { symptom: 'A name does not resolve, or resolves to the wrong address.', check: ['dig www.example.com', 'dig @192.0.2.53 www.example.com +trace'] },
      { symptom: 'The server answers, but with an error status.', check: ['curl -v http://www.example.com/'] },
    ],
  },
  6: {
    job: 'How data is represented: character encoding, compression, encryption. On the Internet this is not a layer of its own; it is part of the application protocol or of TLS.',
    unit: 'Message (data)',
    addresses: 'None of its own.',
    devices: 'No devices of their own; TLS is terminated by servers, proxies or load balancers.',
    tools: ['numbers'],
    problems: [
      { symptom: 'TLS handshake fails: expired or wrong certificate, missing intermediate, no common version.', check: ['openssl s_client -connect www.example.com:443 -servername www.example.com'] },
      { symptom: 'Garbled text: sender and receiver assume different character encodings.', check: ['curl -sI http://www.example.com/ (look at Content-Type and charset)'] },
    ],
  },
  5: {
    job: 'Managing the dialogue between applications: opening, keeping and resuming sessions. The Internet protocols have no separate session layer; TLS sessions, HTTP connections and application logins cover parts of the idea.',
    unit: 'Message (data)',
    addresses: 'None of its own.',
    devices: 'No devices of their own.',
    tools: [],
    problems: [{ symptom: 'Sessions drop after a fixed idle time, often because a NAT router or firewall forgot the connection.', check: ['ss -tno (shows timers of open TCP connections)'] }],
  },
  4: {
    job: 'End-to-end communication between processes on two hosts, told apart by port numbers. TCP adds reliability, ordering and flow control; UDP only adds ports and a checksum.',
    unit: 'Segment (TCP), datagram (UDP)',
    addresses: 'Port numbers, 16 bits: 443 for HTTPS, 53 for DNS.',
    devices: 'Firewalls that filter by port and track connections, NAT routers that rewrite ports, layer 4 load balancers.',
    tools: ['ports', 'tcp-states', 'decoder'],
    problems: [
      { symptom: 'Connection refused: the host answers with RST because nothing listens on the port.', check: ['ss -tlnp (on the server: what listens where)', 'nc -vz www.example.com 443'] },
      { symptom: 'Connection times out: a firewall drops the packets silently.', check: ['nc -vz -w 3 www.example.com 443', 'traceroute -T -p 443 www.example.com'] },
    ],
  },
  3: {
    job: 'Addressing hosts across networks and routing packets hop by hop to the destination.',
    unit: 'Packet',
    addresses: 'IP addresses: 32 bits for IPv4, 128 bits for IPv6, with a prefix that names the network.',
    devices: 'Routers and layer 3 switches.',
    tools: ['subnet', 'vlsm', 'ipv6', 'decoder'],
    problems: [
      { symptom: 'No address, wrong prefix or no default route.', check: ['ip addr', 'ip route'] },
      { symptom: 'The destination is unreachable, or the path breaks somewhere.', check: ['ping 192.0.2.1', 'traceroute 203.0.113.80'] },
      { symptom: 'Small packets work, large ones vanish (MTU problem).', check: ['tracepath 203.0.113.80', 'ping -M do -s 1472 203.0.113.80'] },
    ],
  },
  2: {
    job: 'Delivering frames between interfaces on the same link, and detecting damaged frames with a checksum.',
    unit: 'Frame',
    addresses: 'MAC addresses, 48 bits, for example 00:00:5e:00:53:0a.',
    devices: 'Switches, bridges, wireless access points, network interface cards.',
    tools: ['decoder'],
    problems: [
      { symptom: 'The gateway\'s MAC address cannot be resolved, or an address is used twice.', check: ['ip neigh', 'arping -I eth0 192.0.2.1'] },
      { symptom: 'Frames with errors: a bad cable or a duplex mismatch shows up as CRC errors.', check: ['ip -s link show eth0'] },
    ],
  },
  1: {
    job: 'Turning bits into signals on a medium and back: voltages on copper, light in fiber, radio waves; plus connectors and timing.',
    unit: 'Bits',
    addresses: 'None.',
    devices: 'Cables, connectors, transceivers, repeaters, hubs, media converters.',
    tools: ['bandwidth'],
    problems: [
      { symptom: 'No link: cable unplugged or broken, port disabled.', check: ['ip link show eth0 (NO-CARRIER, state DOWN)', 'ethtool eth0 (Link detected)'] },
      { symptom: 'Link at the wrong speed or duplex.', check: ['ethtool eth0 (Speed, Duplex)'] },
    ],
  },
};

/** Where each protocol of the site sits in the OSI model. Protocols not listed here are ordinary application protocols at layer 7. */
export interface Placement {
  osi: OsiLayer[];
  note?: string;
}

export const PLACEMENTS: Record<string, Placement> = {
  tls: { osi: [6], note: tlsRecordDef.osiNote },
  ssh: { osi: [6, 7], note: `${packetDef.osiNote} The login and the shell on top of it are application layer.` },
  http3: { osi: [7, 4], note: `HTTP/3 itself is an application protocol. It runs on QUIC: ${longDef.osiNote}` },
  tcp: { osi: [4] },
  udp: { osi: [4] },
  ipv4: { osi: [3] },
  icmp: { osi: [3], note: icmpEchoDef.osiNote },
  ipv6: { osi: [3] },
  nat: { osi: [3, 4], note: 'NAT is not a protocol with its own header. The router rewrites fields of other layers: IP addresses at layer 3 and, for PAT, TCP and UDP ports at layer 4, plus the checksums that cover them.' },
  arp: { osi: [2], note: arpDef.osiNote },
};

export const placementOf = (id: string): Placement => PLACEMENTS[id] ?? { osi: [7] };

export const SOURCES: Source[] = [
  { spec: 'ISO/IEC 7498-1:1994', note: 'OSI Basic Reference Model' },
  { rfc: 1122, section: '1.1.3', note: 'the Internet protocol layers' },
  { rfc: 3439, section: '3', note: 'layering considered harmful: why the Internet does not follow OSI strictly' },
];
