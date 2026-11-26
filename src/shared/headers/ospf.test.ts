import { describe, expect, it } from 'vitest';
import { networkLsa, routerLsa } from './ospf';

// ISO 8473 Annex B verification: over the checksummed octets (the LSA without LS age),
// both running sums must be 0 mod 255 when the check octets are in place.
function verifies(lsa: Uint8Array): boolean {
  let c0 = 0;
  let c1 = 0;
  for (const b of lsa.subarray(2)) {
    c0 = (c0 + b) % 255;
    c1 = (c1 + c0) % 255;
  }
  return c0 === 0 && c1 === 0;
}

describe('OSPF LSA checksum', () => {
  const lsas = [
    routerLsa({ age: 1, advRouter: '198.51.100.2', seq: 0x80000001, links: [{ type: 3, id: '192.0.2.0', data: '255.255.255.0', metric: 10 }] }),
    networkLsa({ age: 1, advRouter: '198.51.100.2', seq: 0x80000001, drIp: '192.0.2.2', mask: '255.255.255.0', attached: ['198.51.100.2', '198.51.100.1'] }),
  ];
  it.each(lsas.map((l) => [l.full.summary!, l] as const))('%s verifies', (_n, l) => {
    expect(verifies(l.full.bytes)).toBe(true);
    expect(l.full.bytes.length).toBe(Number(l.full.values.lsLength.display));
    expect(l.header.bytes).toEqual(l.full.bytes.subarray(0, 20));
  });
  it('does not cover LS age', () => {
    const a = routerLsa({ age: 1, advRouter: '198.51.100.2', seq: 0x80000001, links: [] });
    const b = routerLsa({ age: 900, advRouter: '198.51.100.2', seq: 0x80000001, links: [] });
    expect(a.full.values.lsChecksum.display).toBe(b.full.values.lsChecksum.display);
  });
});
