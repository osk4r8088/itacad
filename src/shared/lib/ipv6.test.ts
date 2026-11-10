import { describe, expect, it } from 'vitest';
import { canonicalIpv6, eui64, multicastMac, solicitedNode, withInterfaceId } from './ipv6';
import { parseMac } from './encode';

describe('IPv6 text form (RFC 5952)', () => {
  it.each([
    ['2001:0db8:0000:0000:0000:0000:0000:0001', '2001:db8::1'],
    ['2001:db8:0:0:1:0:0:1', '2001:db8::1:0:0:1'], // first of two equal runs
    ['2001:db8:0:1:1:1:1:1', '2001:db8:0:1:1:1:1:1'], // a single zero group is not shortened
    ['FE80::0200:5EFF:FE00:530A', 'fe80::200:5eff:fe00:530a'],
    ['::', '::'],
    ['ff02:0:0:0:0:0:0:2', 'ff02::2'],
  ])('%s', (input, expected) => expect(canonicalIpv6(input)).toBe(expected));

  it('rejects invalid forms', () => {
    for (const bad of ['1::2::3', '1:2:3:4:5:6:7', '1:2:3:4:5:6:7:8:9', 'g::1', '12345::1']) expect(() => canonicalIpv6(bad), bad).toThrow();
  });
});

describe('derived addresses', () => {
  const mac = parseMac('00:00:5e:00:53:0a');

  it('builds the modified EUI-64 interface identifier', () => {
    expect(withInterfaceId('fe80::', eui64(mac))).toBe('fe80::200:5eff:fe00:530a');
  });

  it('maps an address to its solicited-node group and multicast MAC', () => {
    expect(solicitedNode('2001:db8:1::200:5eff:fe00:530a')).toBe('ff02::1:ff00:530a');
    expect(solicitedNode('fe80::200:5eff:fe00:530a')).toBe('ff02::1:ff00:530a');
    expect(multicastMac('ff02::1:ff00:530a')).toBe('33:33:ff:00:53:0a');
    expect(multicastMac('ff02::2')).toBe('33:33:00:00:00:02');
  });
});
