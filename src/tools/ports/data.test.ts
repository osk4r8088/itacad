import { describe, expect, it } from 'vitest';
import { PORTS, CATEGORIES, rangeOf, search } from './data';
import { CATALOG } from '../../protocols/catalog';

describe('port list', () => {
  it('has each port once', () => {
    const ports = PORTS.map((p) => p.port);
    expect(new Set(ports).size).toBe(ports.length);
  });
  it('uses valid ports, categories and transports', () => {
    for (const p of PORTS) {
      expect(p.port).toBeGreaterThanOrEqual(0);
      expect(p.port).toBeLessThanOrEqual(65535);
      expect(CATEGORIES).toContain(p.category);
      expect(p.transports.length).toBeGreaterThan(0);
      expect(p.service).toMatch(/^[a-z0-9-]+$/);
    }
  });
  it('links only to exchanges that exist', () => {
    const ids = new Set(CATALOG.map((e) => e.id));
    for (const p of PORTS) if (p.exchange) expect(ids, `port ${p.port}`).toContain(p.exchange);
  });
  it('relates ports in both directions', () => {
    for (const p of PORTS) {
      if (!p.related) continue;
      const other = PORTS.find((x) => x.port === p.related);
      expect(other, `port ${p.related}`).toBeDefined();
      expect(other!.related, `port ${p.related} back to ${p.port}`).toBe(p.port);
    }
  });
});

describe('ranges (RFC 6335)', () => {
  it.each([
    [0, 'system'],
    [1023, 'system'],
    [1024, 'user'],
    [49151, 'user'],
    [49152, 'dynamic'],
    [65535, 'dynamic'],
  ])('%i is %s', (port, range) => {
    expect(rangeOf(port)).toBe(range);
  });
});

describe('search', () => {
  const all = { transport: 'all', category: 'all' } as const;
  it('finds by port prefix, name and description', () => {
    expect(search({ ...all, text: '443' }).map((p) => p.port)).toEqual([443]);
    expect(search({ ...all, text: '5' }).map((p) => p.port)).toEqual([53, 500, 514, 520, 546, 547, 587, 5060, 5061, 5353, 5432]);
    expect(search({ ...all, text: 'imap' }).map((p) => p.port)).toEqual([143, 993]);
    expect(search({ ...all, text: 'active directory' }).map((p) => p.port)).toEqual([88, 389]);
  });
  it('filters by transport and category', () => {
    expect(search({ text: '', transport: 'UDP', category: 'Mail' })).toEqual([]);
    expect(search({ text: '', transport: 'all', category: 'Mail' }).every((p) => p.category === 'Mail')).toBe(true);
    expect(search({ text: '', transport: 'UDP', category: 'all' }).every((p) => p.transports.includes('UDP'))).toBe(true);
  });
  it('sorts by port', () => {
    const ports = search({ ...all, text: '' }).map((p) => p.port);
    expect(ports).toEqual([...ports].sort((a, b) => a - b));
  });
});
