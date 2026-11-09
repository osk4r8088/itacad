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
    id: 'attacks',
    title: 'Attack scenarios',
    summary: 'ARP spoofing, SYN flood, DNS cache poisoning, rogue DHCP, and their defenses.',
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
