import { describe, expect, it } from 'vitest';
import { ALL_ZONES, LAYOUTS, deploy, evaluate, type Sizing } from './zones';

const none = new Set<string>();
const sizings: Sizing[] = ['just-enough', 'one-spare'];

describe('regions and zones', () => {
  it('has two regions of three zones, and every layout uses existing zones', () => {
    expect(ALL_ZONES).toEqual(['1a', '1b', '1c', '2a', '2b', '2c']);
    for (const l of LAYOUTS) for (const z of [...deploy(l.id).active, ...deploy(l.id).standby]) expect(ALL_ZONES).toContain(z);
  });

  it('is up when nothing fails, in every layout', () => {
    for (const l of LAYOUTS) for (const s of sizings) expect(evaluate(l.id, s, none).status).toBe('up');
  });

  it('goes down with its only zone', () => {
    expect(evaluate('one-zone', 'one-spare', new Set(['1a'])).status).toBe('down');
  });

  it('survives one lost zone with a spare, and is overloaded without one', () => {
    for (const l of ['two-zones', 'three-zones'] as const) {
      expect(evaluate(l, 'one-spare', new Set(['1a'])).status).toBe('up');
      expect(evaluate(l, 'just-enough', new Set(['1a'])).status).toBe('overloaded');
    }
  });

  it('is overloaded when more zones fail than the spare covers', () => {
    expect(evaluate('three-zones', 'one-spare', new Set(['1a', '1b'])).status).toBe('overloaded');
  });

  it('is not affected by failures in zones it does not use', () => {
    expect(evaluate('two-zones', 'just-enough', new Set(['1c', '2a', '2b', '2c'])).status).toBe('up');
  });

  it('fails over to the second region only when the whole first part is out, with a note on lag', () => {
    const r = evaluate('two-regions', 'one-spare', new Set(['1a', '1b']));
    expect(r.status).toBe('failed-over');
    expect(r.serving).toEqual(['2a', '2b']);
    expect(r.explanation).toMatch(/asynchronously/);
    expect(evaluate('two-regions', 'one-spare', new Set(['1a'])).status).toBe('up');
    expect(evaluate('two-regions', 'one-spare', new Set(ALL_ZONES)).status).toBe('down');
  });

  it('never claims to serve from a failed zone', () => {
    const sets = [[], ['1a'], ['1a', '1b'], ['1a', '1b', '1c'], ALL_ZONES].map((x) => new Set(x));
    for (const l of LAYOUTS) for (const s of sizings) for (const f of sets) for (const z of evaluate(l.id, s, f).serving) expect(f.has(z)).toBe(false);
  });
});
