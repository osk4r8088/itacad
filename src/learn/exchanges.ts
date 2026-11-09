import { urlToPageExchange } from './url-to-page/exchange';
import { arpSpoofingExchange } from './arp-spoofing/exchange';

/** All lesson exchanges, loaded at once. Used by the tests; the site loads each through the lesson registry. */
export const lessonExchanges = [urlToPageExchange, arpSpoofingExchange];
