import { describe, expect, it } from 'vitest';
import { LAYERS, MODELS } from './responsibility-data';

const col = (id: string) => MODELS.findIndex((m) => m.id === id);
const owners = (id: string) => LAYERS.map((l) => l.owners[col(id)]);

describe('responsibility matrix data', () => {
  it('has one owner per model for every layer', () => {
    for (const l of LAYERS) expect(l.owners.length, l.id).toBe(MODELS.length);
  });

  it('leaves everything with the customer on-premises', () => {
    expect(new Set(owners('onprem'))).toEqual(new Set(['customer']));
  });

  it('keeps access rights and data with the customer in every model', () => {
    for (const id of ['access', 'data']) {
      expect(new Set(LAYERS.find((l) => l.id === id)!.owners), id).toEqual(new Set(['customer']));
    }
  });

  it('never hands a layer back to the customer when moving from IaaS to PaaS to SaaS', () => {
    const rank = { customer: 0, shared: 1, provider: 2 };
    for (const l of LAYERS) {
      const r = l.owners.map((o) => rank[o]);
      expect(r, l.id).toEqual([...r].sort((a, b) => a - b));
    }
  });

  it('follows the NIST service models: operating system with the customer in IaaS only', () => {
    const os = LAYERS.find((l) => l.id === 'os')!.owners;
    expect(os[col('iaas')]).toBe('customer');
    expect(os[col('paas')]).toBe('provider');
    expect(os[col('saas')]).toBe('provider');
  });
});
