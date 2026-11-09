import type { HubEntry } from '../shared/hub';

/** Learning content that goes beyond a single protocol. Works like the tool registry. */
export const LESSONS: HubEntry[] = [
  {
    id: 'url-to-page',
    title: 'From URL to page',
    summary: 'Typing a URL and pressing Enter: DHCP, ARP, DNS, TCP, TLS and HTTP in one chain.',
    status: 'planned',
    issue: 2,
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
