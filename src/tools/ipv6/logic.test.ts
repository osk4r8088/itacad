import { describe, expect, it } from 'vitest';
import { blocksOf, compress, countText, expand, fromMac, interfaceId, multicastInfo, parseInput, prefixOf, reverseName, solicitedNodeOf, textNotes, toBigint } from './logic';
import { parseIpv6 } from '../../shared/lib/ipv6';

const a = (text: string) => toBigint(parseIpv6(text));

describe('parsing input', () => {
  it('accepts addresses with prefix, zone and brackets', () => {
    expect(parseInput('2001:db8::1/64')).toEqual({ ok: true, address: a('2001:db8::1'), prefix: 64 });
    expect(parseInput('fe80::1%eth0')).toEqual({ ok: true, address: a('fe80::1') });
    expect(parseInput('[2001:db8::1]')).toEqual({ ok: true, address: a('2001:db8::1') });
  });
  it('explains what is wrong', () => {
    for (const bad of ['', '2001:db8::1::2', '2001:db8::1/129', '192.0.2.1', 'hello']) {
      const r = parseInput(bad);
      expect(r.ok, bad).toBe(false);
    }
  });
});

describe('text forms', () => {
  it('compresses and expands', () => {
    expect(compress(a('2001:0DB8:0000:0000:0001:0000:0000:0001'))).toBe('2001:db8::1:0:0:1');
    expect(expand(a('2001:db8::1'))).toBe('2001:0db8:0000:0000:0000:0000:0000:0001');
    expect(compress(a('::ffff:c000:221'))).toBe('::ffff:192.0.2.33');
  });
  it('says what changed', () => {
    expect(textNotes('2001:0DB8::1', a('2001:db8::1'))).toEqual(['hex digits are written in lowercase', 'leading zeros in a group are left out']);
    expect(textNotes('2001:db8:0:0:0:0:0:1', a('2001:db8::1'))).toEqual(['the longest run of zero groups becomes "::"']);
    expect(textNotes('2001:db8::1', a('2001:db8::1'))).toEqual([]);
  });
});

describe('types', () => {
  it.each([
    ['::1', 'Loopback'],
    ['::', 'Unspecified'],
    ['fe80::1', 'Link-local unicast'],
    ['fd12:3456:789a::1', 'Unique local'],
    ['2001:db8::1', 'Documentation'],
    ['3fff:123::1', 'Documentation'],
    ['2001::1', 'Teredo'],
    ['2001:2::1', 'Benchmarking'],
    ['ff02::1', 'Multicast'],
    ['2a00:1450::1', 'Global unicast'],
    ['::ffff:192.0.2.1', 'IPv4-mapped'],
    ['64:ff9b::c000:201', 'IPv4-IPv6 translation (NAT64 well-known prefix)'],
  ])('%s is %s', (text, name) => expect(blocksOf(a(text))[0].name).toBe(name));

  it('lists the enclosing blocks after the most specific one', () => {
    expect(blocksOf(a('2001:db8::1')).map((b) => b.name)).toEqual(['Documentation', 'Global unicast']);
  });

  it('finds nothing for unallocated space', () => {
    expect(blocksOf(a('4000::1'))).toEqual([]);
  });

  it('reads multicast scope and flags', () => {
    expect(multicastInfo(a('ff02::1'))).toMatchObject({ scope: 'link-local', transient: false, wellKnown: 'all nodes on the link' });
    expect(multicastInfo(a('ff15::1234'))).toMatchObject({ scope: 'site-local', transient: true });
    expect(multicastInfo(a('ff02::1:ff00:530a'))?.solicitedFor).toBe('00530a');
    expect(multicastInfo(a('2001:db8::1'))).toBeUndefined();
  });
});

describe('derived values', () => {
  it('computes network and last address', () => {
    const p = prefixOf(a('2001:db8:1:2:3:4:5:6'), 48);
    expect(compress(p.network)).toBe('2001:db8:1::');
    expect(compress(p.last)).toBe('2001:db8:1:ffff:ffff:ffff:ffff:ffff');
    expect(countText(p.hostBits)).toBe('2^80');
    expect(countText(8)).toBe('256');
  });

  it('builds and recognizes EUI-64 interface identifiers', () => {
    const addr = fromMac(a('2001:db8:1::'), '00:00:5e:00:53:0a')!;
    expect(compress(addr)).toBe('2001:db8:1:0:200:5eff:fe00:530a');
    expect(interfaceId(addr)).toEqual({ iid: '0200:5eff:fe00:530a', fromMac: '00:00:5e:00:53:0a' });
    expect(interfaceId(a('2001:db8::1')).fromMac).toBeUndefined();
    expect(fromMac(a('2001:db8::'), 'not a mac')).toBeUndefined();
  });

  it('gives the solicited-node group and the reverse name', () => {
    expect(solicitedNodeOf(a('2001:db8:1:0:200:5eff:fe00:530a'))).toEqual({ group: 'ff02::1:ff00:530a', mac: '33:33:ff:00:53:0a' });
    // RFC 3596 section 2.5 example
    expect(reverseName(a('4321:0:1:2:3:4:567:89ab'))).toBe('b.a.9.8.7.6.5.0.4.0.0.0.3.0.0.0.2.0.0.0.1.0.0.0.0.0.0.0.1.2.3.4.ip6.arpa');
  });
});
