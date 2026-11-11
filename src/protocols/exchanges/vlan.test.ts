import { describe, expect, it } from 'vitest';
import { vlanExchange as ex } from './vlan';
import type { Capture } from '../../shared/schema';
import { nestedBytes } from '../../shared/headers/stacks';

const step = (id: string) => ex.steps.find((s) => s.id === id)!;
const on = (id: string, link: string) => step(id).captures.find((c) => c.link === link)!;
const has = (c: Capture, layer: string) => c.layers.some((l) => l.def.id === layer);
const frameLength = (c: Capture) => nestedBytes(c.layers.slice(1)).length;
const val = (c: Capture, layer: string, field: string) => c.layers.find((l) => l.def.id === layer)!.values[field].display;

describe('VLAN (802.1Q)', () => {
  it('tags VLAN 10 on trunks and never on access ports', () => {
    for (const s of ex.steps)
      for (const c of s.captures) {
        if (c.link.startsWith('acc-')) expect(has(c, 'vlan'), `${s.id} ${c.link}`).toBe(false);
        if (has(c, 'vlan')) expect(val(c, 'vlan', 'vid'), `${s.id} ${c.link}`).toBe('10');
      }
  });

  it('adds exactly the 4 octets of the tag and recomputes the FCS', () => {
    const access = on('ping-a-c', 'acc-a');
    const trunk = on('ping-a-c', 'trunk');
    expect(frameLength(trunk) - frameLength(access)).toBe(4);
    expect(val(trunk, 'ethernet', 'fcs')).not.toBe(val(access, 'ethernet', 'fcs'));
    expect(val(trunk, 'ipv4', 'checksum')).toBe(val(access, 'ipv4', 'checksum'));
  });

  it('keeps the padding of a minimum-size frame when the switch inserts the tag', () => {
    expect(frameLength(on('arp-request', 'acc-a'))).toBe(64);
    expect(frameLength(on('arp-request', 'trunk'))).toBe(68);
  });

  it('sends the native VLAN untagged: both captures are the same frame', () => {
    const [a, b] = step('ping-b-d').captures;
    expect(nestedBytes(a.layers.slice(1))).toEqual(nestedBytes(b.layers.slice(1)));
  });

  it('routes between VLANs: new source MAC and TTL one lower', () => {
    const into = on('route-in', 'r-trunk');
    const out = on('route-out', 'acc-d');
    expect(Number(val(out, 'ipv4', 'ttl'))).toBe(Number(val(into, 'ipv4', 'ttl')) - 1);
    expect(val(out, 'ethernet', 'src')).toBe(val(into, 'ethernet', 'dst'));
  });
});
