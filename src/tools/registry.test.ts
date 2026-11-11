import { describe, expect, it } from 'vitest';
import { TOOLS, entryHref, toolsFor } from './registry';
import { LESSONS } from '../learn/registry';

describe('tool registry', () => {
  it('puts every entry in exactly one section, and links it there', () => {
    const grouped = [...toolsFor('use'), ...toolsFor('understand')].map((t) => t.id);
    expect(grouped.sort()).toEqual(TOOLS.map((t) => t.id).sort());
    for (const t of toolsFor('understand')) expect(entryHref(t.id)).toBe(`#/explore/${t.id}`);
    for (const t of toolsFor('use')) expect(entryHref(t.id)).toBe(`#/tools/${t.id}`);
  });
  it('gives ready entries something to show, planned entries an issue', () => {
    for (const e of [...TOOLS, ...LESSONS]) {
      if (e.status === 'ready') expect(Boolean(e.component || e.exchange), e.id).toBe(true);
      else expect(e.issue, e.id).toBeGreaterThan(0);
    }
  });
  it('has unique ids', () => {
    for (const list of [TOOLS, LESSONS]) expect(new Set(list.map((e) => e.id)).size).toBe(list.length);
  });
});
