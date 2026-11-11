import { describe, expect, it } from 'vitest';
import { exchanges as protocolExchanges } from '../../protocols/exchanges';
import { lessonExchanges } from '../../learn/exchanges';

const exchanges = [...protocolExchanges, ...lessonExchanges];
import { nestedBytes } from '../../shared/headers/stacks';
import type { StructInstance } from '../../shared/schema';
import { decode } from './decode';

const DECODED = new Set(['ethernet', 'vlan', 'ipv4', 'tcp', 'udp', 'arp', 'icmp-echo', 'icmp-time-exceeded', 'icmp-dest-unreachable', 'icmp-frag-needed', 'ipv6', 'icmpv6-echo', 'icmpv6-rs', 'icmpv6-ra', 'icmpv6-ns', 'icmpv6-na', 'dns', 'dhcp', 'ntp']);

/** DNS, DHCP and NTP: every question, record and option has to match the builders as well. */
const APPLICATION = new Set(['dns', 'dhcp', 'ntp']);

/** Sub-structures of a field in a comparable form: definition, bytes, and the text and size of every value. */
const flat = (items: StructInstance[] | undefined): unknown =>
  (items ?? []).map((i) => ({
    def: i.def.id,
    summary: i.summary,
    bytes: Array.from(i.bytes),
    values: Object.fromEntries(Object.entries(i.values).map(([id, v]) => [id, `${v.display} [${v.bits} bits]`])),
  }));

const frames = exchanges.flatMap((ex) =>
  ex.steps.flatMap((step) =>
    step.captures.map((c, i) => {
      const layers = c.layers[0].def.id === 'phy' ? c.layers.slice(1) : c.layers;
      return [`${ex.id} step ${step.id} capture ${i}`, layers, nestedBytes(layers)] as const;
    }),
  ),
);

describe('decoding every frame shown on the site', () => {
  it.each(frames)('%s', (_name, built, bytes) => {
    const d = decode(bytes);
    expect(d.issues.filter((i) => i.level !== 'info')).toEqual([]);
    expect(d.checks.every((c) => c.ok)).toBe(true);
    const expected = built.map((l) => (DECODED.has(l.def.id) ? l.def.id : l.def.id === 'ip-fragment' ? 'fragment' : 'data'));
    // Everything above the last decoded header is one data layer in the decoder.
    const lastDecoded = expected.length - 1 - [...expected].reverse().findIndex((id) => id !== 'data');
    expect(d.layers.map((l) => l.def.id)).toEqual(expected.slice(0, lastDecoded + 1).concat(expected.length > lastDecoded + 1 ? ['data'] : []));
    for (const layer of d.layers) {
      const original = built.find((l) => l.def.id === layer.def.id);
      if (!original || !DECODED.has(layer.def.id)) continue;
      expect(layer.bytes, `${layer.def.id} header bytes`).toEqual(original.bytes);
      for (const [id, v] of Object.entries(layer.values)) {
        if (!original.values[id] || id === 'data' || id === 'original') continue;
        // Option lists of TCP and Neighbor Discovery are compared item by item below; their one-line text differs in wording.
        const list = id === 'options' && !APPLICATION.has(layer.def.id);
        if (!list) expect(`${layer.def.id}.${id} = ${v.display}`).toBe(`${layer.def.id}.${id} = ${original.values[id].display}`);
        expect(v.bits, `${layer.def.id}.${id} bits`).toBe(original.values[id].bits);
        if (APPLICATION.has(layer.def.id)) expect(flat(v.items), `${layer.def.id}.${id} items`).toEqual(flat(original.values[id].items));
      }
    }
  });
});
