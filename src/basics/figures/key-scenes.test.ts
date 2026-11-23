import { describe, expect, it } from 'vitest';
import { DH, RSA, encryptScene, exchangeScene, modPow, signScene, type Step } from './key-scenes';

const eveSecrets = (steps: Step[]) => steps.flatMap((s) => s.knows.Eve.filter((i) => i.secret));

describe('toy arithmetic', () => {
  it('computes powers modulo n', () => {
    expect(modPow(5, 6, 23)).toBe(8);
    expect(modPow(2, 10, 1000)).toBe(24);
    expect(modPow(7, 0, 13)).toBe(1);
  });

  it('uses a working RSA key pair: d inverts e modulo (p-1)(q-1)', () => {
    expect(RSA.n).toBe(RSA.p * RSA.q);
    expect((RSA.e * RSA.d) % ((RSA.p - 1) * (RSA.q - 1))).toBe(1);
    for (let m = 0; m < RSA.n; m += 97) expect(modPow(modPow(m, RSA.e, RSA.n), RSA.d, RSA.n)).toBe(m);
  });

  it('gives both sides the same Diffie-Hellman secret', () => {
    const A = modPow(DH.g, DH.a, DH.p);
    const B = modPow(DH.g, DH.b, DH.p);
    expect(modPow(B, DH.a, DH.p)).toBe(modPow(A, DH.b, DH.p));
  });
});

describe('the scenes', () => {
  it('lets Bob decrypt the message Alice encrypted', () => {
    const steps = encryptScene(65);
    const last = steps[steps.length - 1];
    expect(last.knows.Bob.find((i) => i.label === 'Message')!.value).toBe('65');
    expect(steps.find((s) => s.wire?.label === 'Ciphertext')!.wire!.value).toBe(String(modPow(65, RSA.e, RSA.n)));
  });

  it('ends the key exchange with equal secrets that never crossed the network', () => {
    const steps = exchangeScene();
    const last = steps[steps.length - 1];
    const a = last.knows.Alice.find((i) => i.label === 'Shared secret')!.value;
    const b = last.knows.Bob.find((i) => i.label === 'Shared secret')!.value;
    expect(a).toBe(b);
    expect(steps.some((s) => s.wire?.value === a && s.wire.label !== 'From Alice' && s.wire.label !== 'From Bob')).toBe(false);
  });

  it('never gives Eve a secret item, in any scene', () => {
    expect(eveSecrets(encryptScene())).toEqual([]);
    expect(eveSecrets(exchangeScene())).toEqual([]);
    expect(eveSecrets(signScene('m', 'aa', 'm', 'aa'))).toEqual([]);
  });

  it('gives Eve exactly what crossed the network', () => {
    for (const steps of [encryptScene(), exchangeScene()]) {
      const wire = steps.flatMap((s) => (s.wire ? [s.wire] : []));
      expect(steps[steps.length - 1].knows.Eve).toEqual(wire);
    }
  });

  it('keeps private keys with their owners', () => {
    const enc = encryptScene();
    expect(enc[enc.length - 1].knows.Alice.some((i) => i.label === "Bob's private key")).toBe(false);
    const sig = signScene('m', 'aa', 'm', 'aa');
    expect(sig[sig.length - 1].knows.Bob.some((i) => i.label === "Alice's private key")).toBe(false);
  });

  it('accepts the signature only when the received message hashes the same', () => {
    expect(signScene('pay 10', 'h1', 'pay 10', 'h1').at(-1)!.text).toMatch(/valid/);
    expect(signScene('pay 10', 'h1', 'pay 1000', 'h2').at(-1)!.text).toMatch(/fails/);
  });
});
