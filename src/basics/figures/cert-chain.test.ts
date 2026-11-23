import { describe, expect, it } from 'vitest';
import { FAULT_LABELS, NO_FAULTS, validate, type Faults } from './cert-chain';

describe('the certificate chain', () => {
  it('is trusted when nothing is broken, and every check is made and passes', () => {
    const r = validate(NO_FAULTS);
    expect(r.trusted).toBe(true);
    for (const c of r.checks) expect(c.ok && c.made, c.what).toBe(true);
  });

  for (const f of FAULT_LABELS) {
    it(`is refused when "${f.label}" is set on the ${f.level}, and a check on that certificate says why`, () => {
      const r = validate({ ...NO_FAULTS, [f.key]: true } as Faults);
      expect(r.trusted).toBe(false);
      const failed = r.checks.filter((c) => !c.ok && c.made);
      expect(failed.length).toBeGreaterThan(0);
      expect(failed.some((c) => c.level === f.level)).toBe(true);
      for (const c of failed) expect(c.why, c.what).toBeTruthy();
    });
  }

  it('cannot check the upper part of the chain without the intermediate', () => {
    const r = validate({ ...NO_FAULTS, intermediateMissing: true });
    const notMade = r.checks.filter((c) => !c.made).map((c) => c.level);
    expect(notMade).toContain('root');
    expect(notMade).toContain('intermediate');
    expect(r.checks.find((c) => c.what.startsWith('The address'))!.made).toBe(true);
  });

  it('names the address that was opened', () => {
    expect(validate({ ...NO_FAULTS, wrongName: true }).address).toBe('shop.example.com');
  });

  it('fails exactly one check per fault while the chain can be built', () => {
    for (const f of FAULT_LABELS) {
      if (f.key === 'intermediateMissing') continue;
      const r = validate({ ...NO_FAULTS, [f.key]: true } as Faults);
      expect(r.checks.filter((c) => !c.ok).length, f.key).toBe(1);
    }
  });
});
