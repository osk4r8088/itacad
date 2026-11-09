import { describe, expect, it } from 'vitest';
import { exchanges } from './exchanges';
import { CATALOG } from './catalog';

describe('catalog', () => {
  it('lists every exchange exactly once', () => {
    expect(CATALOG.map((e) => e.id).sort()).toEqual(exchanges.map((e) => e.id).sort());
  });

  it.each(CATALOG.map((e) => [e.id, e] as const))('%s matches its exchange file and loads it', async (id, entry) => {
    const ex = exchanges.find((e) => e.id === id)!;
    expect({ title: entry.title, summary: entry.summary, group: entry.group }).toEqual({ title: ex.title, summary: ex.summary, group: ex.group });
    expect(await entry.load()).toBe(ex);
  });
});
