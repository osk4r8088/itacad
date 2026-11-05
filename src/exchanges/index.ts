import type { Exchange } from '../schema';
import { tcpExchange } from './tcp';

/** All exchanges, in the order they appear on the index page. Add new ones here. */
export const exchanges: Exchange[] = [tcpExchange];

export function findExchange(id: string): Exchange | undefined {
  return exchanges.find((e) => e.id === id);
}
