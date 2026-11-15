import { describe, expect, it } from 'vitest';
import { differingBits, differingDigits, sha256Hex } from './hash';

describe('hash figure helpers', () => {
  it('computes the SHA-256 values quoted in the topic', async () => {
    expect(await sha256Hex('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    expect(await sha256Hex('hellp')).toBe('fdd7585e08c4e2afd71dcabdb4636c89d557a3f42db9e2040c8bbd1708aa4ce7');
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('hashes the UTF-8 bytes of a text', async () => {
    expect(await sha256Hex('é')).toBe(await sha256Hex('é'.normalize('NFC')));
    expect(await sha256Hex('é')).not.toBe(await sha256Hex('é'));
  });

  it('counts differing bits', async () => {
    expect(differingBits('00', 'ff')).toBe(8);
    expect(differingBits('a5', 'a5')).toBe(0);
    expect(differingBits('1', '3')).toBe(1);
    expect(differingBits(await sha256Hex('hello'), await sha256Hex('hellp'))).toBe(131);
    expect(() => differingBits('00', '000')).toThrow();
  });

  it('marks differing digits', () => {
    expect(differingDigits('abc', 'abd')).toEqual([false, false, true]);
  });
});
