import { describe, expect, it } from 'vitest';
import { TOOLS, TOOL_GROUPS, toolsFor } from './registry';
import { LESSONS } from '../learn/registry';

describe('tool registry', () => {
  it('puts every tool in exactly one purpose group', () => {
    const grouped = TOOL_GROUPS.flatMap((g) => toolsFor(g.purpose).map((t) => t.id));
    expect(grouped.sort()).toEqual(TOOLS.map((t) => t.id).sort());
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
