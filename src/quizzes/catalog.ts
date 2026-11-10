import type { Quiz } from './schema';

/** Quizzes by exchange id, loaded when opened. Every quiz must match an exchange in the protocol catalog. */
export const QUIZZES: Record<string, () => Promise<Quiz>> = {
  tcp: () => import('./tcp').then((m) => m.tcpQuiz),
  dns: () => import('./dns').then((m) => m.dnsQuiz),
  dhcp: () => import('./dhcp').then((m) => m.dhcpQuiz),
  arp: () => import('./arp').then((m) => m.arpQuiz),
  icmp: () => import('./icmp').then((m) => m.icmpQuiz),
  tls: () => import('./tls').then((m) => m.tlsQuiz),
  udp: () => import('./udp').then((m) => m.udpQuiz),
  ipv4: () => import('./ipv4').then((m) => m.ipv4Quiz),
  http1: () => import('./http1').then((m) => m.http1Quiz),
  http2: () => import('./http2').then((m) => m.http2Quiz),
  http3: () => import('./http3').then((m) => m.http3Quiz),
  ntp: () => import('./ntp').then((m) => m.ntpQuiz),
  smtp: () => import('./smtp').then((m) => m.smtpQuiz),
  imap: () => import('./imap').then((m) => m.imapQuiz),
  ftp: () => import('./ftp').then((m) => m.ftpQuiz),
  websocket: () => import('./websocket').then((m) => m.websocketQuiz),
  ssh: () => import('./ssh').then((m) => m.sshQuiz),
};

export const hasQuiz = (id: string): boolean => id in QUIZZES;
