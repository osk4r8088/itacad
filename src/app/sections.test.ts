import { describe, expect, it } from 'vitest';
import { SECTIONS } from './sections';
import { parseRoute } from './router';

describe('site sections', () => {
  it('has unique ids and a positive count each', () => {
    expect(new Set(SECTIONS.map((s) => s.id)).size).toBe(SECTIONS.length);
    for (const s of SECTIONS) expect(s.count(), s.id).toBeGreaterThan(0);
  });

  it('links highlights to pages that exist', () => {
    const links = [...SECTIONS.flatMap((s) => [s.href, ...s.highlights().map((h) => h.href)])];
    for (const l of links) expect(parseRoute(l).page, l).not.toBe('redirect');
    for (const s of SECTIONS) expect(s.highlights().length, s.id).toBeGreaterThanOrEqual(2);
  });
});
