import { describe, expect, it } from 'vitest';
import { freeBlocks, plan, prefixFor } from './logic';
import { formatIpv4, parseIpv4 } from '../subnet/logic';

const cidr = (n: number, p: number) => `${formatIpv4(n)}/${p}`;

describe('prefix for a host count', () => {
  it.each([
    [100, false, 25],
    [126, false, 25],
    [127, false, 24],
    [2, false, 30],
    [2, true, 31],
    [1, false, 30],
    [254, false, 24],
  ])('%i hosts (allow /31: %s) -> /%i', (hosts, allow, p) => expect(prefixFor(hosts, allow)).toBe(p));
});

describe('planning', () => {
  const block = parseIpv4('192.168.10.0')!;
  const needs = [
    { name: 'Link A', hosts: 2 },
    { name: 'Sales', hosts: 100 },
    { name: 'HR', hosts: 25 },
    { name: 'Engineering', hosts: 50 },
  ];

  it('allocates largest first on aligned boundaries', () => {
    const r = plan(block, 24, needs, false);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.allocations.map((a) => [a.need.name, cidr(a.subnet.network, a.subnet.prefix)])).toEqual([
      ['Sales', '192.168.10.0/25'],
      ['Engineering', '192.168.10.128/26'],
      ['HR', '192.168.10.192/27'],
      ['Link A', '192.168.10.224/30'],
    ]);
    expect(r.allocations.map((a) => a.wasted)).toEqual([26, 12, 5, 0]);
    for (const a of r.allocations) expect(a.subnet.network % a.subnet.total).toBe(0);
    expect(r.free.map((f) => cidr(f.network, f.prefix))).toEqual(['192.168.10.228/30', '192.168.10.232/29', '192.168.10.240/28']);
    expect(r.used + r.free.reduce((n, f) => n + 2 ** (32 - f.prefix), 0)).toBe(256);
  });

  it('uses /31 for two-host links when allowed', () => {
    const r = plan(block, 24, [{ name: 'Link', hosts: 2 }], true);
    expect(r.ok && cidr(r.allocations[0].subnet.network, r.allocations[0].subnet.prefix)).toBe('192.168.10.0/31');
  });

  it('reports a block that is too small', () => {
    const r = plan(block, 25, needs, false);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('128 addresses');
    expect(r.error).toContain('"Engineering"');
  });

  it('rejects impossible host counts', () => {
    expect(plan(block, 24, [{ name: 'X', hosts: 0 }], false).ok).toBe(false);
  });

  it('describes free space with the fewest aligned blocks', () => {
    expect(freeBlocks(parseIpv4('10.0.0.4')!, parseIpv4('10.0.0.16')!).map((f) => cidr(f.network, f.prefix))).toEqual(['10.0.0.4/30', '10.0.0.8/29']);
  });
});
