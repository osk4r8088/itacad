import type { Exchange } from '../../shared/schema';
import { tcpExchange } from './tcp';
import { udpExchange } from './udp';
import { ipv4Exchange } from './ipv4';
import { icmpExchange } from './icmp';
import { arpExchange } from './arp';
import { dhcpExchange } from './dhcp';
import { dnsExchange } from './dns';
import { ntpExchange } from './ntp';
import { http1Exchange } from './http1';
import { http2Exchange } from './http2';
import { http3Exchange } from './http3';
import { smtpExchange } from './smtp';
import { imapExchange } from './imap';
import { ftpExchange } from './ftp';
import { websocketExchange } from './websocket';
import { tlsExchange } from './tls';
import { sshExchange } from './ssh';

/** All exchanges. Add new ones here; their `group` decides where they appear in the navigation. */
export const exchanges: Exchange[] = [
  dhcpExchange,
  dnsExchange,
  ntpExchange,
  http1Exchange,
  http2Exchange,
  http3Exchange,
  smtpExchange,
  imapExchange,
  ftpExchange,
  websocketExchange,
  tlsExchange,
  sshExchange,
  tcpExchange,
  udpExchange,
  ipv4Exchange,
  icmpExchange,
  arpExchange,
];

/** Navigation groups, top to bottom in the order of the protocol stack. */
export const GROUPS = ['Application', 'Security', 'Transport', 'Internet', 'Link'] as const;

/** Exchanges that are planned but not built yet. Shown greyed out in the navigation. */
export const PLANNED: { title: string; group: (typeof GROUPS)[number] }[] = [
];

export interface NavEntry {
  title: string;
  summary?: string;
  /** Set for exchanges that exist. */
  id?: string;
}

/** Navigation entries per group, built exchanges first, then planned ones not built yet. */
export function navGroups(): { group: string; entries: NavEntry[] }[] {
  const built = new Set(exchanges.map((e) => e.title));
  const groups = [...GROUPS, ...exchanges.map((e) => e.group).filter((g) => !(GROUPS as readonly string[]).includes(g))];
  return [...new Set(groups)]
    .map((group) => ({
      group,
      entries: [
        ...exchanges.filter((e) => e.group === group).map((e) => ({ id: e.id, title: e.title, summary: e.summary })),
        ...PLANNED.filter((p) => p.group === group && !built.has(p.title)).map((p) => ({ title: p.title })),
      ],
    }))
    .filter((g) => g.entries.length > 0);
}

export function findExchange(id: string): Exchange | undefined {
  return exchanges.find((e) => e.id === id);
}
