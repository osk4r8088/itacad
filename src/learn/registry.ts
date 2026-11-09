import type { HubEntry } from '../shared/hub';

/** Learning content that goes beyond a single protocol. Works like the tool registry. */
export const LESSONS: HubEntry[] = [
  {
    id: 'layers',
    title: 'OSI and TCP/IP overview',
    summary: 'Every layer with its job, addresses, devices, and the protocols and tools of this site that belong to it.',
    status: 'planned',
    issue: 34,
  },
  {
    id: 'url-to-page',
    title: 'From URL to page',
    summary: 'A laptop joins a network and opens a web page: DHCP, ARP, DNS, TCP, TLS and HTTP in one chain, frame by frame.',
    status: 'ready',
    issue: 2,
    exchange: () => import('./url-to-page/exchange').then((m) => m.urlToPageExchange),
  },
  {
    id: 'arp-spoofing',
    title: 'Attack: ARP spoofing',
    summary: 'An attacker in the LAN poisons ARP caches and becomes the man in the middle; the switch stops it with Dynamic ARP Inspection.',
    status: 'ready',
    issue: 8,
    exchange: () => import('./arp-spoofing/exchange').then((m) => m.arpSpoofingExchange),
  },
  {
    id: 'syn-flood',
    title: 'Attack: SYN flood',
    summary: 'Forged SYNs fill a server\'s queue of half-open connections until real clients are turned away; SYN cookies answer without keeping state.',
    status: 'ready',
    issue: 8,
    exchange: () => import('./syn-flood/exchange').then((m) => m.synFloodExchange),
  },
  {
    id: 'dns-poisoning',
    title: 'Attack: DNS cache poisoning',
    summary: 'An off-path attacker races the real name server with forged answers and plants a false delegation; random source ports and DNSSEC stop it.',
    status: 'ready',
    issue: 8,
    exchange: () => import('./dns-poisoning/exchange').then((m) => m.dnsPoisoningExchange),
  },
  {
    id: 'rogue-dhcp',
    title: 'Attack: rogue DHCP server',
    summary: 'A host in the LAN answers DHCP first and makes itself gateway and DNS server; DHCP snooping blocks it at the switch.',
    status: 'ready',
    issue: 8,
    exchange: () => import('./rogue-dhcp/exchange').then((m) => m.rogueDhcpExchange),
  },
  {
    id: 'quizzes',
    title: 'Quizzes',
    summary: 'Check your understanding of each protocol.',
    status: 'planned',
    issue: 7,
  },
];
