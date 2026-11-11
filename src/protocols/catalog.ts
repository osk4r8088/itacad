import type { Exchange } from '../shared/schema';
import type { Level } from '../shared/levels';
import type { EntryRef } from '../shared/refs';

/**
 * Lightweight list of all exchanges. The overview, the protocol menu and the start page
 * render from this list only; the exchange data itself is loaded when its page opens.
 * Title, summary and group must match the exchange file (checked by data.test.ts).
 */
export interface CatalogEntry {
  id: string;
  title: string;
  summary: string;
  group: string;
  /** How much a reader needs to know first. */
  level: Level;
  /** Entries to read first, shown in the About panel of the exchange. */
  prereqs?: EntryRef[];
  load: () => Promise<Exchange>;
}

/** Navigation groups, top to bottom in the order of the protocol stack. */
export const GROUPS = ['Application', 'Security', 'Transport', 'Internet', 'Link'] as const;

export const CATALOG: CatalogEntry[] = [
  {
    id: 'dhcp',
    title: 'DHCP',
    summary: 'A new client gets an IPv4 address, gateway and DNS resolver: Discover, Offer, Request, Ack.',
    group: 'Application',
    level: 2,
    prereqs: [{ protocol: 'udp' }, { protocol: 'arp' }],
    load: () => import('./exchanges/dhcp').then((m) => m.dhcpExchange),
  },
  {
    id: 'dns',
    title: 'DNS',
    summary: 'A recursive resolver with an empty cache walks from the root to the answer for www.example.com.',
    group: 'Application',
    level: 2,
    prereqs: [{ protocol: 'udp' }],
    load: () => import('./exchanges/dns').then((m) => m.dnsExchange),
  },
  {
    id: 'ntp',
    title: 'NTP',
    summary: 'One request, one response, four timestamps: how a client measures its clock offset and the round-trip delay.',
    group: 'Application',
    level: 2,
    prereqs: [{ protocol: 'udp' }],
    load: () => import('./exchanges/ntp').then((m) => m.ntpExchange),
  },
  {
    id: 'http1',
    title: 'HTTP/1.1',
    summary: 'A page, a missing favicon and a reload with a conditional request, all on one persistent connection.',
    group: 'Application',
    level: 2,
    prereqs: [{ protocol: 'tcp' }, { protocol: 'dns' }],
    load: () => import('./exchanges/http1').then((m) => m.http1Exchange),
  },
  {
    id: 'http2',
    title: 'HTTP/2',
    summary: 'Two requests in parallel on one connection: binary frames, streams, HPACK header compression, answers out of order.',
    group: 'Application',
    level: 3,
    prereqs: [{ protocol: 'http1' }, { protocol: 'tls' }],
    load: () => import('./exchanges/http2').then((m) => m.http2Exchange),
  },
  {
    id: 'http3',
    title: 'HTTP/3 and QUIC',
    summary: 'QUIC over UDP sets up transport and TLS 1.3 in one round trip; HTTP/3 then runs on QUIC streams.',
    group: 'Application',
    level: 3,
    prereqs: [{ protocol: 'http2' }, { protocol: 'udp' }],
    load: () => import('./exchanges/http3').then((m) => m.http3Exchange),
  },
  {
    id: 'smtp',
    title: 'SMTP',
    summary: 'One mail server hands a message to another: greeting, EHLO, envelope, data, quit.',
    group: 'Application',
    level: 2,
    prereqs: [{ protocol: 'tcp' }, { protocol: 'dns' }],
    load: () => import('./exchanges/smtp').then((m) => m.smtpExchange),
  },
  {
    id: 'imap',
    title: 'IMAP',
    summary: 'Bob reads the mail Alice sent: login, select the inbox, fetch the message, log out.',
    group: 'Application',
    level: 2,
    prereqs: [{ protocol: 'tcp' }],
    load: () => import('./exchanges/imap').then((m) => m.imapExchange),
  },
  {
    id: 'ftp',
    title: 'FTP',
    summary: 'Login, passive mode and a file download over a second connection.',
    group: 'Application',
    level: 2,
    prereqs: [{ protocol: 'tcp' }],
    load: () => import('./exchanges/ftp').then((m) => m.ftpExchange),
  },
  {
    id: 'websocket',
    title: 'WebSocket',
    summary: 'An HTTP upgrade turns the connection into a two-way message channel: masked client frames, server push, ping and close.',
    group: 'Application',
    level: 3,
    prereqs: [{ protocol: 'http1' }],
    load: () => import('./exchanges/websocket').then((m) => m.websocketExchange),
  },
  {
    id: 'tls',
    title: 'TLS 1.3',
    summary: 'The full handshake in one round trip: hellos with key shares, the encrypted server flight, Finished, and the first encrypted data.',
    group: 'Security',
    level: 3,
    prereqs: [{ protocol: 'tcp' }],
    load: () => import('./exchanges/tls').then((m) => m.tlsExchange),
  },
  {
    id: 'ssh',
    title: 'SSH',
    summary: 'Version strings, algorithm negotiation, curve25519 key exchange with host key signature, and the switch to encryption.',
    group: 'Security',
    level: 3,
    prereqs: [{ protocol: 'tcp' }],
    load: () => import('./exchanges/ssh').then((m) => m.sshExchange),
  },
  {
    id: 'tcp',
    title: 'TCP',
    summary: 'Three-way handshake, one request and response, four-way close.',
    group: 'Transport',
    level: 2,
    prereqs: [{ entry: 'layers' }, { protocol: 'ipv4' }],
    load: () => import('./exchanges/tcp').then((m) => m.tcpExchange),
  },
  {
    id: 'udp',
    title: 'UDP',
    summary: 'Syslog datagrams: one delivered, one lost without anybody noticing, one to a closed port.',
    group: 'Transport',
    level: 2,
    prereqs: [{ entry: 'layers' }, { protocol: 'ipv4' }],
    load: () => import('./exchanges/udp').then((m) => m.udpExchange),
  },
  {
    id: 'ipv4',
    title: 'IPv4',
    summary: 'A packet crosses a router: TTL, MAC rewrite, fragmentation and Path MTU Discovery.',
    group: 'Internet',
    level: 2,
    prereqs: [{ entry: 'layers' }],
    load: () => import('./exchanges/ipv4').then((m) => m.ipv4Exchange),
  },
  {
    id: 'ipv6',
    title: 'IPv6, NDP and SLAAC',
    summary: 'A host joins an IPv6 network: link-local address, duplicate check, router advertisement, its own global address, and Neighbor Discovery instead of ARP.',
    group: 'Internet',
    level: 3,
    prereqs: [{ protocol: 'ipv4' }, { protocol: 'icmp' }],
    load: () => import('./exchanges/ipv6').then((m) => m.ipv6Exchange),
  },
  {
    id: 'nat',
    title: 'NAT and PAT',
    summary: 'Two laptops share one public address: rewritten addresses and ports, a translation table, a dropped packet from outside, port forwarding.',
    group: 'Internet',
    level: 2,
    prereqs: [{ protocol: 'ipv4' }, { protocol: 'tcp' }],
    load: () => import('./exchanges/nat').then((m) => m.natExchange),
  },
  {
    id: 'icmp',
    title: 'ICMP',
    summary: 'Ping and traceroute: Echo Request and Reply, and Time Exceeded from the routers on the way.',
    group: 'Internet',
    level: 2,
    prereqs: [{ protocol: 'ipv4' }],
    load: () => import('./exchanges/icmp').then((m) => m.icmpExchange),
  },
  {
    id: 'vlan',
    title: 'VLAN (802.1Q)',
    summary: 'Two VLANs on two switches: access ports, a tagged trunk, the native VLAN, and a router on a stick between the VLANs.',
    group: 'Link',
    level: 2,
    prereqs: [{ topic: 'network-devices' }],
    load: () => import('./exchanges/vlan').then((m) => m.vlanExchange),
  },
  {
    id: 'stp',
    title: 'Spanning Tree',
    summary: 'Three switches in a triangle: a broadcast storm without STP, the root election, a blocked port, and recovery after a link failure.',
    group: 'Link',
    level: 3,
    prereqs: [{ protocol: 'vlan' }],
    load: () => import('./exchanges/stp').then((m) => m.stpExchange),
  },
  {
    id: 'arp',
    title: 'ARP',
    summary: 'Resolving the MAC address of the default gateway before the first packet can leave.',
    group: 'Link',
    level: 2,
    prereqs: [{ topic: 'nic' }, { entry: 'layers' }],
    load: () => import('./exchanges/arp').then((m) => m.arpExchange),
  },
];

/** Exchanges that are planned but not built yet. Shown greyed out in the navigation. */
export const PLANNED: { title: string; group: (typeof GROUPS)[number] }[] = [
];

export interface NavEntry {
  title: string;
  summary?: string;
  /** Set for exchanges that exist. */
  id?: string;
  level?: Level;
}

/** Navigation entries per group, built exchanges first, then planned ones not built yet. */
export function navGroups(): { group: string; entries: NavEntry[] }[] {
  const built = new Set(CATALOG.map((e) => e.title));
  const groups = [...GROUPS, ...CATALOG.map((e) => e.group).filter((g) => !(GROUPS as readonly string[]).includes(g))];
  return [...new Set(groups)]
    .map((group) => ({
      group,
      entries: [
        ...CATALOG.filter((e) => e.group === group).map((e) => ({ id: e.id, title: e.title, summary: e.summary, level: e.level })),
        ...PLANNED.filter((p) => p.group === group && !built.has(p.title)).map((p) => ({ title: p.title })),
      ],
    }))
    .filter((g) => g.entries.length > 0);
}

export function findEntry(id: string): CatalogEntry | undefined {
  return CATALOG.find((e) => e.id === id);
}
