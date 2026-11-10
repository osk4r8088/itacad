import { describe, expect, it } from 'vitest';
import { LAYERS, PLACEMENTS, placementOf } from './data';
import { CATALOG } from '../../protocols/catalog';
import { exchanges } from '../../protocols/exchanges';
import { TOOLS } from '../../tools/registry';

describe('layers overview', () => {
  it('names only existing protocols and tools', () => {
    for (const id of Object.keys(PLACEMENTS)) expect(CATALOG.some((p) => p.id === id), id).toBe(true);
    for (const facts of Object.values(LAYERS)) for (const id of facts.tools) expect(TOOLS.some((t) => t.id === id), id).toBe(true);
  });

  // At least one placed layer must appear in the protocol's own frames. HTTP/3 and SSH are also
  // placed at layer 7, but their application data travels encrypted and is not decoded on the page.
  it('places every protocol where its own headers say it is', () => {
    for (const entry of CATALOG) {
      const ex = exchanges.find((e) => e.id === entry.id)!;
      const osi = new Set(ex.steps.flatMap((s) => s.captures.flatMap((c) => c.layers.flatMap((l) => l.def.osi))));
      const placed = placementOf(entry.id).osi;
      expect(placed.some((n) => osi.has(n)), `${entry.id} at ${placed.join(', ')}, headers at ${[...osi].join(', ')}`).toBe(true);
    }
  });

  it('gives every layer a job, a unit and at least one problem with a command', () => {
    for (const [n, facts] of Object.entries(LAYERS)) {
      expect(facts.job.length, n).toBeGreaterThan(20);
      expect(facts.unit.length, n).toBeGreaterThan(0);
      expect(facts.problems.length, n).toBeGreaterThan(0);
      for (const p of facts.problems) expect(p.check.length, `${n}: ${p.symptom}`).toBeGreaterThan(0);
    }
  });
});
