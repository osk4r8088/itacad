import { describe, expect, it } from 'vitest';
import { ipv6Exchange as ex } from './ipv6';
import type { Step } from '../../shared/schema';
import { parseIpv6 } from '../../shared/lib/ipv6';

const layers = (s: Step) => s.captures[0].layers;
const value = (s: Step, layer: string, field: string) => layers(s).find((l) => l.def.id === layer)!.values[field].display.split(' ')[0];
const nd = ex.steps.filter((s) => layers(s).some((l) => /^icmpv6-(rs|ra|ns|na)$/.test(l.def.id)));
const step = (id: string) => ex.steps.find((s) => s.id === id)!;

describe('IPv6, NDP and SLAAC', () => {
  it('sends every Neighbor Discovery message with hop limit 255', () => {
    expect(nd.length).toBeGreaterThan(0);
    for (const s of nd) expect(value(s, 'ipv6', 'hopLimit'), s.id).toBe('255');
  });

  it('probes for duplicates from the unspecified address, without a link-layer address option', () => {
    for (const id of ['dad-link-local', 'dad-global']) {
      expect(value(step(id), 'ipv6', 'src')).toBe('::');
      expect(value(step(id), 'icmpv6-ns', 'options')).toBe('none');
    }
  });

  it('sends multicast to the matching 33:33 Ethernet address', () => {
    for (const s of ex.steps) {
      const dst = value(s, 'ipv6', 'dst');
      if (!dst.startsWith('ff')) continue;
      const tail = value(s, 'ethernet', 'dst').split(':').slice(2).join('');
      const group = dst.split(':').slice(-2).map((g) => g.padStart(4, '0')).join('');
      expect(value(s, 'ethernet', 'dst').startsWith('33:33:'), s.id).toBe(true);
      expect(tail, s.id).toBe(group);
    }
  });

  it('forms the global address from the advertised prefix and the same interface identifier', () => {
    const prefix = layers(step('ra')).find((l) => l.def.id === 'icmpv6-ra')!.values.options.items!.find((o) => o.def.id === 'nd-opt-prefix')!.values.prefix.display;
    const global = value(step('dad-global'), 'icmpv6-ns', 'target');
    const linkLocal = value(step('dad-link-local'), 'icmpv6-ns', 'target');
    expect(parseIpv6(global).subarray(0, 8)).toEqual(parseIpv6(prefix).subarray(0, 8));
    expect(parseIpv6(global).subarray(8)).toEqual(parseIpv6(linkLocal).subarray(8));
  });

  it('confirms reachability only with solicited advertisements', () => {
    for (const id of ['resolve-na', 'nud-na']) expect(value(step(id), 'icmpv6-na', 'solicited')).toBe('1');
    expect(value(step('nud-na'), 'icmpv6-na', 'router')).toBe('1');
    expect(value(step('resolve-na'), 'icmpv6-na', 'router')).toBe('0');
  });
});
