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
    ['#/explore', { page: 'explore' }],
    ['#/explore/raid', { page: 'explorer', id: 'raid' }],
    ['#/learn', { page: 'learn' }],
    ['#/learn/attacks', { page: 'lesson', id: 'attacks', step: 1 }],
    ['#/learn/url-to-page/7', { page: 'lesson', id: 'url-to-page', step: 7 }],
    ['#/learn/quizzes', { page: 'lesson', id: 'quizzes', step: 1 }],
    ['#/learn/quizzes/tcp', { page: 'quiz', id: 'tcp' }],
    ['#/basics', { page: 'basics' }],
    ['#/basics/hardware', { page: 'category', id: 'hardware' }],
    ['#/basics/hardware/cpu', { page: 'topic', category: 'hardware', id: 'cpu' }],
    ['#/basics/glossary', { page: 'glossary' }],
    ['#/tcp/3', { page: 'redirect', to: '#/protocols/tcp/3' }],
    ['#/dns', { page: 'redirect', to: '#/protocols/dns/1' }],
  ])('%s', (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
  });

  it('round-trips the link helpers', () => {
    expect(parseRoute(href.exchange('tls', 4))).toEqual({ page: 'exchange', id: 'tls', step: 4 });
    expect(parseRoute(href.tool('decoder'))).toEqual({ page: 'tool', id: 'decoder' });
    expect(parseRoute(href.quiz('dns'))).toEqual({ page: 'quiz', id: 'dns' });
    expect(parseRoute(href.topic('hardware', 'memory'))).toEqual({ page: 'topic', category: 'hardware', id: 'memory' });
  });
});
