import { describe, expect, it } from 'vitest';
import { classify, formatIpv4, historicalClass, maskOf, parseInput, parseIpv4, prefixOfMask, roleOf, subnet, SPECIAL_BLOCKS, toBits } from './logic';

const ip = (s: string) => parseIpv4(s)!;
const fmt = (s: ReturnType<typeof subnet>) => ({
  network: formatIpv4(s.network),
  broadcast: formatIpv4(s.broadcast),
  first: formatIpv4(s.firstHost),
  last: formatIpv4(s.lastHost),
  mask: formatIpv4(s.mask),
  wildcard: formatIpv4(s.wildcard),
  hosts: s.hosts,
  total: s.total,
});

describe('parseIpv4 and formatIpv4', () => {
  it.each(['0.0.0.0', '192.0.2.77', '255.255.255.255', '10.0.0.1'])('round-trips %s', (s) => {
    expect(formatIpv4(ip(s))).toBe(s);
  });
  it('uses unsigned values', () => {
    expect(ip('255.255.255.255')).toBe(4294967295);
    expect(ip('128.0.0.0')).toBe(2 ** 31);
  });
  it.each(['256.0.0.1', '1.2.3', '1.2.3.4.5', '01.2.3.4', '1.2.3.-4', 'a.b.c.d', '', '1..2.3'])('rejects %s', (s) => {
    expect(parseIpv4(s)).toBeUndefined();
  });
});

describe('masks', () => {
  it.each([
    [0, '0.0.0.0'],
    [8, '255.0.0.0'],
    [20, '255.255.240.0'],
    [26, '255.255.255.192'],
    [31, '255.255.255.254'],
    [32, '255.255.255.255'],
  ])('/%i is %s and back', (prefix, mask) => {
    expect(formatIpv4(maskOf(prefix))).toBe(mask);
    expect(prefixOfMask(ip(mask))).toBe(prefix);
  });
  it('rejects masks with non-contiguous one bits', () => {
    expect(prefixOfMask(ip('255.0.255.0'))).toBeUndefined();
    expect(prefixOfMask(ip('255.255.255.253'))).toBeUndefined();
  });
  it('shows bits most significant first', () => {
    expect(toBits(ip('192.0.2.77'))).toBe('11000000000000000000001001001101');
  });
});

describe('parseInput', () => {
  it('accepts CIDR, mask and plain address forms', () => {
    expect(parseInput('192.0.2.77/26')).toEqual({ ok: true, address: ip('192.0.2.77'), prefix: 26 });
    expect(parseInput(' 192.0.2.77 / 26 ')).toEqual({ ok: true, address: ip('192.0.2.77'), prefix: 26 });
    expect(parseInput('192.0.2.77 255.255.255.192')).toEqual({ ok: true, address: ip('192.0.2.77'), prefix: 26 });
    expect(parseInput('192.0.2.77')).toEqual({ ok: true, address: ip('192.0.2.77') });
  });
  it.each(['', '192.0.2.77/33', '192.0.2.77/x', '192.0.2.300/24', '192.0.2.77 255.0.255.0', '192.0.2.77/24/1'])('rejects "%s" with a message', (s) => {
    const r = parseInput(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
  });
});

describe('subnet', () => {
  it('192.0.2.77/26', () => {
    expect(fmt(subnet(ip('192.0.2.77'), 26))).toEqual({
      network: '192.0.2.64',
      broadcast: '192.0.2.127',
      first: '192.0.2.65',
      last: '192.0.2.126',
      mask: '255.255.255.192',
      wildcard: '0.0.0.63',
      hosts: 62,
      total: 64,
    });
  });
  it('172.16.35.123/20 crosses an octet boundary', () => {
    expect(fmt(subnet(ip('172.16.35.123'), 20))).toMatchObject({ network: '172.16.32.0', broadcast: '172.16.47.255', first: '172.16.32.1', last: '172.16.47.254', hosts: 4094 });
  });
  it('10.1.2.3/8', () => {
    expect(fmt(subnet(ip('10.1.2.3'), 8))).toMatchObject({ network: '10.0.0.0', broadcast: '10.255.255.255', hosts: 16777214 });
  });
  it('/30 leaves two hosts', () => {
    expect(fmt(subnet(ip('198.51.100.6'), 30))).toMatchObject({ network: '198.51.100.4', broadcast: '198.51.100.7', first: '198.51.100.5', last: '198.51.100.6', hosts: 2 });
  });
  it('/31 uses both addresses as hosts (RFC 3021)', () => {
    const s = subnet(ip('198.51.100.7'), 31);
    expect(fmt(s)).toMatchObject({ network: '198.51.100.6', broadcast: '198.51.100.7', first: '198.51.100.6', last: '198.51.100.7', hosts: 2, total: 2 });
    expect(s.rule).toBe('point-to-point');
    expect(roleOf(s)).toBe('host');
  });
  it('/32 is a single host', () => {
    const s = subnet(ip('203.0.113.9'), 32);
    expect(fmt(s)).toMatchObject({ network: '203.0.113.9', broadcast: '203.0.113.9', first: '203.0.113.9', last: '203.0.113.9', hosts: 1, total: 1, wildcard: '0.0.0.0' });
  });
  it('/0 covers everything', () => {
    expect(fmt(subnet(ip('192.0.2.1'), 0))).toMatchObject({ network: '0.0.0.0', broadcast: '255.255.255.255', mask: '0.0.0.0', wildcard: '255.255.255.255', total: 2 ** 32, hosts: 2 ** 32 - 2 });
  });
  it('works near the top of the address space', () => {
    expect(fmt(subnet(ip('255.255.255.200'), 25))).toMatchObject({ network: '255.255.255.128', broadcast: '255.255.255.255' });
  });
  it('tells network, broadcast and host addresses apart', () => {
    expect(roleOf(subnet(ip('192.0.2.64'), 26))).toBe('network');
    expect(roleOf(subnet(ip('192.0.2.127'), 26))).toBe('broadcast');
    expect(roleOf(subnet(ip('192.0.2.65'), 26))).toBe('host');
  });
});

describe('classify', () => {
  it.each([
    ['10.20.30.40', 'Private'],
    ['172.31.255.255', 'Private'],
    ['192.168.1.1', 'Private'],
    ['100.64.0.1', 'Shared address space (carrier-grade NAT)'],
    ['127.0.0.1', 'Loopback'],
    ['169.254.10.20', 'Link-local'],
    ['192.0.2.77', 'Documentation (TEST-NET-1)'],
    ['198.51.100.1', 'Documentation (TEST-NET-2)'],
    ['203.0.113.80', 'Documentation (TEST-NET-3)'],
    ['198.19.0.1', 'Benchmarking'],
    ['224.0.0.251', 'Multicast'],
    ['255.255.255.255', 'Limited broadcast'],
    ['250.1.1.1', 'Reserved for future use'],
    ['0.1.2.3', '"This network"'],
  ])('%s is %s', (addr, name) => {
    expect(classify(ip(addr))?.name).toBe(name);
  });
  it.each(['172.32.0.1', '172.15.255.255', '100.128.0.1', '8.8.8.8', '1.1.1.1'])('%s is public', (addr) => {
    expect(classify(ip(addr))).toBeUndefined();
  });
  it('lists blocks with aligned network addresses', () => {
    for (const b of SPECIAL_BLOCKS) expect((b.network & ~maskOf(b.prefix)) >>> 0).toBe(0);
  });
});

describe('historicalClass', () => {
  it.each([
    ['0.0.0.0', 'A'],
    ['127.255.255.255', 'A'],
    ['128.0.0.0', 'B'],
    ['191.255.255.255', 'B'],
    ['192.0.0.0', 'C'],
    ['223.255.255.255', 'C'],
    ['224.0.0.0', 'D'],
    ['239.255.255.255', 'D'],
    ['240.0.0.0', 'E'],
  ])('%s is class %s', (addr, cls) => {
    expect(historicalClass(ip(addr))).toBe(cls);
  });
});
