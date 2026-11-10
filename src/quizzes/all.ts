import { tcpQuiz } from './tcp';
import { dnsQuiz } from './dns';
import { dhcpQuiz } from './dhcp';
import { arpQuiz } from './arp';
import { icmpQuiz } from './icmp';
import { tlsQuiz } from './tls';
import { udpQuiz } from './udp';
import { ipv4Quiz } from './ipv4';
import { http1Quiz } from './http1';
import { http2Quiz } from './http2';
import { http3Quiz } from './http3';
import { ntpQuiz } from './ntp';
import { smtpQuiz } from './smtp';
import { imapQuiz } from './imap';
import { ftpQuiz } from './ftp';
import { websocketQuiz } from './websocket';
import { sshQuiz } from './ssh';
import { natQuiz } from './nat';

/** All quizzes, loaded at once. Used by the tests; the site loads each through the catalog. */
export const allQuizzes = [tcpQuiz, dnsQuiz, dhcpQuiz, arpQuiz, icmpQuiz, tlsQuiz, udpQuiz, ipv4Quiz, http1Quiz, http2Quiz, http3Quiz, ntpQuiz, smtpQuiz, imapQuiz, ftpQuiz, websocketQuiz, sshQuiz, natQuiz];
