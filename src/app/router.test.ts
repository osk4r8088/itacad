import { describe, expect, it } from 'vitest';
import { href, parseRoute } from './router';

describe('parseRoute', () => {
  it.each([
    ['', { page: 'home' }],
    ['#/', { page: 'home' }],
    ['#/protocols', { page: 'protocols' }],
    ['#/protocols/tcp', { page: 'exchange', id: 'tcp', step: 1 }],
    ['#/protocols/tcp/3', { page: 'exchange', id: 'tcp', step: 3 }],
    ['#/protocols/tcp/0', { page: 'exchange', id: 'tcp', step: 1 }],
    ['#/tools', { page: 'tools' }],
    ['#/tools/subnet', { page: 'tool', id: 'subnet' }],
    ['#/learn', { page: 'learn' }],
    ['#/learn/attacks', { page: 'lesson', id: 'attacks' }],
    ['#/tcp/3', { page: 'redirect', to: '#/protocols/tcp/3' }],
    ['#/dns', { page: 'redirect', to: '#/protocols/dns/1' }],
  ])('%s', (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
  });

  it('round-trips the link helpers', () => {
    expect(parseRoute(href.exchange('tls', 4))).toEqual({ page: 'exchange', id: 'tls', step: 4 });
    expect(parseRoute(href.tool('decoder'))).toEqual({ page: 'tool', id: 'decoder' });
  });
});
