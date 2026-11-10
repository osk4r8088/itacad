import type { Quiz } from './schema';

/** Quizzes by exchange id, loaded when opened. Every quiz must match an exchange in the protocol catalog. */
export const QUIZZES: Record<string, () => Promise<Quiz>> = {
  tcp: () => import('./tcp').then((m) => m.tcpQuiz),
  dns: () => import('./dns').then((m) => m.dnsQuiz),
  dhcp: () => import('./dhcp').then((m) => m.dhcpQuiz),
  arp: () => import('./arp').then((m) => m.arpQuiz),
  icmp: () => import('./icmp').then((m) => m.icmpQuiz),
  tls: () => import('./tls').then((m) => m.tlsQuiz),
};

export const hasQuiz = (id: string): boolean => id in QUIZZES;
