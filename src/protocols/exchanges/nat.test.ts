import { describe, expect, it } from 'vitest';
import { natExchange as ex } from './nat';
import type { Capture, Step } from '../../shared/schema';

const layer = (c: Capture, id: string) => c.layers.find((l) => l.def.id === id)!;
const v = (c: Capture, l: string, f: string) => layer(c, l).values[f].display.split(' ')[0];
const step = (id: string) => ex.steps.find((s) => s.id === id)!;
const sides = (s: Step) => ({ inside: s.captures.find((c) => c.link === 'lan')!, outside: s.captures.find((c) => c.link === 'wan')! });
const transport = (c: Capture) => (c.layers.some((l) => l.def.id === 'tcp') ? 'tcp' : 'udp');

describe('NAT and PAT', () => {
  const translated = ex.steps.filter((s) => s.captures.length === 2);

  it('shows every translated packet on both sides of the router', () => {
    for (const s of translated) expect(Object.values(sides(s)).every(Boolean), s.id).toBe(true);
  });

  it('rewrites only the private end: address, port and the checksums that cover them', () => {
    for (const s of translated) {
      const { inside, outside } = sides(s);
      const t = transport(inside);
      // Packets from a laptop have their source rewritten, packets to a laptop their destination.
      const out = s.from.startsWith('laptop');
      const addr = out ? 'src' : 'dst';
      const [otherAddr, otherPort] = out ? ['dst', 'dstPort'] : ['src', 'srcPort'];
      expect(v(outside, 'ipv4', addr), s.id).toBe('198.51.100.20');
      expect(v(inside, 'ipv4', addr), s.id).toMatch(/^192\.168\.1\./);
      expect(v(inside, 'ipv4', otherAddr)).toBe(v(outside, 'ipv4', otherAddr));
      expect(v(inside, t, otherPort)).toBe(v(outside, t, otherPort));
      expect(v(inside, t, 'checksum'), `${s.id} transport checksum`).not.toBe(v(outside, t, 'checksum'));
      expect(v(inside, 'ipv4', 'checksum'), `${s.id} IPv4 checksum`).not.toBe(v(outside, 'ipv4', 'checksum'));
      if (t === 'tcp') expect(v(inside, 'tcp', 'seq')).toBe(v(outside, 'tcp', 'seq'));
    }
  });

  it('gives two connections from the same inside port different outside ports', () => {
    const a = sides(step('a-syn')).outside;
    const b = sides(step('b-syn')).outside;
    expect(v(sides(step('a-syn')).inside, 'tcp', 'srcPort')).toBe(v(sides(step('b-syn')).inside, 'tcp', 'srcPort'));
    expect(v(a, 'tcp', 'srcPort')).not.toBe(v(b, 'tcp', 'srcPort'));
    expect(v(sides(step('b-synack')).outside, 'tcp', 'dstPort')).toBe(v(b, 'tcp', 'srcPort'));
  });

  it('records a table entry for every new outgoing mapping', () => {
    for (const id of ['a-syn', 'b-syn', 'b-dns', 'forward-syn']) expect(step(id).learned?.length, id).toBeGreaterThan(0);
  });

  it('has no inside capture for the unsolicited packet', () => {
    expect(step('unsolicited').captures.map((c) => c.link)).toEqual(['wan']);
  });
});
