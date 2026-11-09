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

/** All exchanges, loaded eagerly. Used by the tests; the site loads exchanges through catalog.ts. */
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
