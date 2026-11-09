import { urlToPageExchange } from './url-to-page/exchange';
import { arpSpoofingExchange } from './arp-spoofing/exchange';
import { synFloodExchange } from './syn-flood/exchange';
import { dnsPoisoningExchange } from './dns-poisoning/exchange';
import { rogueDhcpExchange } from './rogue-dhcp/exchange';

/** All lesson exchanges, loaded at once. Used by the tests; the site loads each through the lesson registry. */
export const lessonExchanges = [urlToPageExchange, arpSpoofingExchange, synFloodExchange, dnsPoisoningExchange, rogueDhcpExchange];
