import { describe, expect, it } from 'vitest';
import { bdp, convert, duration, perSegment, scaleFor, transfer, windowLimit } from './logic';

const v = (rows: ReturnType<typeof convert>, id: string) => rows.find((r) => r.id === id)!.value;

describe('units', () => {
  it('keeps decimal and binary prefixes apart', () => {
    const r = convert(1, 'GiB');
    expect(v(r, 'B')).toBe(1073741824);
    expect(v(r, 'GB')).toBeCloseTo(1.073741824, 9);
    expect(v(r, 'Gbit')).toBeCloseTo(8.589934592, 9);
    expect(v(convert(100, 'Mbit'), 'MB')).toBe(12.5);
  });
  it('formats durations', () => {
    expect(duration(0.0123)).toBe('12.3 ms');
    expect(duration(90)).toBe('90 s');
    expect(duration(3725)).toBe('1 h 2 min 5 s');
  });
});

describe('overhead', () => {
  it('matches the classic Ethernet figures', () => {
    // 1460 octets of TCP payload in 1538 octets on the wire, the calculation of RFC 6349 section 4.1.1
    const plain = perSegment({ mtu: 1500, ipv6: false, timestamps: false, vlan: false });
    expect([plain.payload, plain.wire]).toEqual([1460, 1538]);
    expect(plain.efficiency).toBeCloseTo(0.9493, 4);
    expect(perSegment({ mtu: 1500, ipv6: false, timestamps: true, vlan: false }).payload).toBe(1448);
    expect(perSegment({ mtu: 1500, ipv6: true, timestamps: true, vlan: true }).payload).toBe(1428);
  });
  it('gives the transfer time with and without overhead', () => {
    const t = transfer(1e9, 100e6, { mtu: 1500, ipv6: false, timestamps: false, vlan: false });
    expect(t.raw).toBe(80);
    expect(t.withOverhead).toBeCloseTo(80 / (1460 / 1538), 6);
    expect(t.segments).toBe(Math.ceil(1e9 / 1460));
  });
});

describe('window', () => {
  it('computes the bandwidth-delay product and the scale needed', () => {
    expect(bdp(1e9, 0.02)).toBe(2.5e6);
    expect(scaleFor(65535)).toBe(0);
    expect(scaleFor(2.5e6)).toBe(6);
    expect(scaleFor(2 ** 31)).toBeUndefined();
  });
  it('limits throughput to one window per round trip', () => {
    expect(windowLimit(65535, 0.05)).toBeCloseTo(10.4856e6, 1);
  });
});
