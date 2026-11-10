import { tcpQuiz } from './tcp';
import { dnsQuiz } from './dns';
import { dhcpQuiz } from './dhcp';
import { arpQuiz } from './arp';
import { icmpQuiz } from './icmp';
import { tlsQuiz } from './tls';

/** All quizzes, loaded at once. Used by the tests; the site loads each through the catalog. */
export const allQuizzes = [tcpQuiz, dnsQuiz, dhcpQuiz, arpQuiz, icmpQuiz, tlsQuiz];
