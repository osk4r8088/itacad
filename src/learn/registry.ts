import type { HubEntry } from '../shared/hub';

/** Learning content that goes beyond a single protocol. Works like the tool registry. */
export const LESSONS: HubEntry[] = [
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
    id: 'attacks',
    title: 'More attack scenarios',
    summary: 'SYN flood, DNS cache poisoning and a rogue DHCP server, each with its defense.',
    status: 'planned',
    issue: 8,
  },
  {
    id: 'quizzes',
    title: 'Quizzes',
    summary: 'Check your understanding of each protocol.',
    status: 'planned',
    issue: 7,
  },
];
