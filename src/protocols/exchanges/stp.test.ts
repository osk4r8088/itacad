import { describe, expect, it } from 'vitest';
import { stpExchange as ex } from './stp';
import type { Capture } from '../../shared/schema';
import { nestedBytes } from '../../shared/headers/stacks';

const bpdus = ex.steps.flatMap((s) => s.captures.filter((c) => c.layers.some((l) => l.def.id === 'stp-bpdu')).map((c) => [s.id, c] as const));
const val = (c: Capture, layer: string, field: string) => c.layers.find((l) => l.def.id === layer)!.values[field].display;

describe('Spanning Tree', () => {
  it('sends every BPDU in an 802.3 frame to the STP multicast address, with the right length', () => {
    expect(bpdus.length).toBeGreaterThan(0);
    for (const [id, c] of bpdus) {
      expect(val(c, 'ethernet', 'dst'), id).toBe('01:80:c2:00:00:00 (multicast)');
      const frame = nestedBytes(c.layers.slice(1));
      const length = (frame[12] << 8) | frame[13];
      expect(length, id).toBe(38); // LLC 3 + configuration BPDU 35
      expect(frame.length, id).toBe(64);
    }
  });

  it('agrees everywhere on the lowest bridge as root', () => {
    const ids = ex.participants.filter((p) => p.kind === 'switch').map((p) => p.addr!.mac!).sort();
    for (const [id, c] of bpdus) expect(val(c, 'stp-bpdu', 'rootId'), id).toBe(`32768/0/${ids[0]}`);
  });

  it('adds one port cost per hop from the root', () => {
    for (const [id, c] of bpdus) {
      const fromRoot = val(c, 'stp-bpdu', 'bridgeId') === val(c, 'stp-bpdu', 'rootId');
      expect(val(c, 'stp-bpdu', 'rootPathCost'), id).toBe(fromRoot ? '0' : '20,000');
      expect(val(c, 'stp-bpdu', 'messageAge'), id).toBe(fromRoot ? '0 s' : '1 s');
    }
  });

  it('drops the copy at the blocked port once the tree is built', () => {
    const blocked = ex.steps.find((s) => s.id === 'tree-blocked')!;
    expect(blocked.lost).toBe(true);
    expect(blocked.to).toBe('sw3');
  });
});
