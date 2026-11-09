import type { Source } from '../../shared/schema';

/** Random source: fills the array with random values. In the browser this is crypto.getRandomValues. */
export type RandomFill = (array: Uint32Array<ArrayBuffer>) => Uint32Array<ArrayBuffer>;

export const cryptoFill: RandomFill = (a) => {
  crypto.getRandomValues(a);
  return a;
};

/**
 * Uniform random integer in [0, n), without modulo bias: values from the top, incomplete
 * block of the 32-bit range are rejected and drawn again.
 */
export function randomBelow(n: number, fill: RandomFill = cryptoFill): number {
  if (!Number.isInteger(n) || n < 1 || n > 2 ** 32) throw new Error(`invalid range ${n}`);
  const limit = 2 ** 32 - (2 ** 32 % n);
  const buf = new Uint32Array(1);
  for (;;) {
    const v = fill(buf)[0];
    if (v < limit) return v % n;
  }
}

export const CHARSETS = {
  lower: { label: 'Lowercase a-z', chars: 'abcdefghijklmnopqrstuvwxyz' },
  upper: { label: 'Uppercase A-Z', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
  digits: { label: 'Digits 0-9', chars: '0123456789' },
  symbols: { label: 'Symbols', chars: '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~' },
} as const;
export type CharsetId = keyof typeof CHARSETS;

/** Characters that are easy to confuse when read or typed by hand. */
export const LOOKALIKES = 'Il1|O0o`\'"';

export interface PasswordOptions {
  length: number;
  sets: CharsetId[];
  avoidLookalikes: boolean;
}

export function alphabet(o: PasswordOptions): string {
  const all = o.sets.map((s) => CHARSETS[s].chars).join('');
  return o.avoidLookalikes ? [...all].filter((c) => !LOOKALIKES.includes(c)).join('') : all;
}

export function generatePassword(o: PasswordOptions, fill: RandomFill = cryptoFill): string {
  const chars = alphabet(o);
  if (!chars.length) throw new Error('no characters selected');
  let out = '';
  for (let i = 0; i < o.length; i++) out += chars[randomBelow(chars.length, fill)];
  return out;
}

/** Entropy in bits of a secret chosen uniformly at random: count * log2(choices). */
export function entropyBits(count: number, choices: number): number {
  return choices <= 1 ? 0 : count * Math.log2(choices);
}

// ---- passphrases (EFF large word list: 7776 words, one per roll of five dice)

export function parseWordList(text: string): { roll: string; word: string }[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [roll, word] = l.split('\t');
      return { roll, word };
    });
}

export interface PassphraseOptions {
  words: number;
  separator: string;
}

export function generatePassphrase(list: { roll: string; word: string }[], o: PassphraseOptions, fill: RandomFill = cryptoFill): { phrase: string; picks: { roll: string; word: string }[] } {
  const picks = Array.from({ length: o.words }, () => list[randomBelow(list.length, fill)]);
  return { phrase: picks.map((p) => p.word).join(o.separator), picks };
}

// ---- guessing time, with the same attack models as zxcvbn

export const ATTACKS = [
  { id: 'onlineThrottling', label: 'Online, throttled', rate: 100 / 3600, about: '100 guesses per hour: a login form with rate limiting.' },
  { id: 'onlineNoThrottling', label: 'Online, not throttled', rate: 10, about: '10 guesses per second against a login without limits.' },
  { id: 'offlineSlow', label: 'Offline, slow hash', rate: 1e4, about: '10,000 guesses per second against a stolen hash made with bcrypt, scrypt or Argon2.' },
  { id: 'offlineFast', label: 'Offline, fast hash', rate: 1e10, about: '10 billion guesses per second against a stolen fast hash such as unsalted SHA-1 or MD5, with many GPUs.' },
] as const;

/** Time to try every possibility; on average an attacker needs half of it. */
export function secondsToExhaust(bits: number, rate: number): number {
  return 2 ** bits / rate;
}

export function formatDuration(seconds: number): string {
  if (seconds < 1) return 'less than a second';
  const units: [string, number][] = [
    ['century', 100 * 365.25 * 86400],
    ['year', 365.25 * 86400],
    ['month', (365.25 / 12) * 86400],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ];
  if (seconds >= 1e4 * units[0][1]) return 'centuries';
  for (const [name, size] of units) {
    if (seconds >= size) {
      const n = Math.floor(seconds / size);
      const plural = name === 'century' ? 'centuries' : `${name}s`;
      return `${n.toLocaleString('en-US')} ${n === 1 ? name : plural}`;
    }
  }
  return 'less than a second';
}

export const SOURCES: Source[] = [
  { spec: 'NIST SP 800-63B-4', section: '3.1.1.2 (password verifiers)', url: 'https://pages.nist.gov/800-63-4/sp800-63b/authenticators/', note: 'length, no composition rules, blocklists' },
  { spec: 'EFF Dice-Generated Passphrases', url: 'https://www.eff.org/dice', note: 'the large word list, CC BY 3.0' },
  { spec: 'zxcvbn: low-budget password strength estimation (Wheeler, USENIX Security 2016)', url: 'https://www.usenix.org/conference/usenixsecurity16/technical-sessions/presentation/wheeler', note: 'the pattern-based strength estimate' },
  { spec: 'zxcvbn-ts', url: 'https://github.com/zxcvbn-ts/zxcvbn', note: 'the TypeScript implementation used here, MIT license' },
];
