/**
 * Who holds which key, in the three things a key pair can do (the list on the topic page):
 * encrypting to someone, agreeing on a secret, and signing. Alice and Bob talk; Eve sees everything
 * that crosses the network and nothing else.
 *
 * The first two scenes compute with toy numbers, so the arithmetic can be followed: textbook RSA with
 * n = 61 x 53, and Diffie-Hellman modulo 23. Real keys are far larger (see the table of key sizes on the page), which is what makes
 * Eve's job infeasible. The signing scene uses a real SHA-256 hash and shows the signature as a sealed value.
 */

export type Actor = 'Alice' | 'Bob' | 'Eve';

export interface Item {
  label: string;
  value: string;
  secret: boolean;
}

export interface Step {
  text: string;
  /** What crosses the network in this step; Eve sees it. */
  wire?: Item;
  /** What each actor knows after this step. */
  knows: Record<Actor, Item[]>;
}

/** Modular exponentiation for small numbers (all intermediate products stay below 2^53). */
export function modPow(base: number, exp: number, mod: number): number {
  let result = 1;
  let b = base % mod;
  let e = exp;
  while (e > 0) {
    if (e & 1) result = (result * b) % mod;
    b = (b * b) % mod;
    e = Math.floor(e / 2);
  }
  return result;
}

export const RSA = { p: 61, q: 53, n: 61 * 53, e: 17, d: 2753 };
export const DH = { p: 23, g: 5, a: 6, b: 15 };

const pub = (label: string, value: string | number): Item => ({ label, value: String(value), secret: false });
const sec = (label: string, value: string | number): Item => ({ label, value: String(value), secret: true });

/** Builds a scene from steps that each add items; knowledge accumulates. */
function scene(steps: { text: string; wire?: Item; add: Partial<Record<Actor, Item[]>> }[]): Step[] {
  const knows: Record<Actor, Item[]> = { Alice: [], Bob: [], Eve: [] };
  return steps.map((s) => {
    for (const a of ['Alice', 'Bob', 'Eve'] as Actor[]) knows[a] = [...knows[a], ...(s.add[a] ?? [])];
    if (s.wire) knows.Eve = [...knows.Eve, s.wire];
    return { text: s.text, ...(s.wire ? { wire: s.wire } : {}), knows: { Alice: [...knows.Alice], Bob: [...knows.Bob], Eve: [...knows.Eve] } };
  });
}

export function encryptScene(message = 65): Step[] {
  const { n, e, d } = RSA;
  const c = modPow(message, e, n);
  const back = modPow(c, d, n);
  const bobPublic = pub("Bob's public key", `n = ${n}, e = ${e}`);
  return scene([
    { text: `Bob makes a key pair. He keeps the private key (d = ${d}) and publishes the public one.`, wire: bobPublic, add: { Bob: [bobPublic, sec("Bob's private key", `d = ${d}`)], Alice: [bobPublic] } },
    { text: `Alice wants to send the number ${message}. She encrypts it with Bob's public key: ${message}^${e} mod ${n} = ${c}.`, add: { Alice: [sec('Message', message)] } },
    { text: `Alice sends ${c}. Eve sees it, and Bob's public key, but cannot undo the encryption without d.`, wire: pub('Ciphertext', c), add: { Bob: [pub('Ciphertext', c)] } },
    { text: `Bob decrypts with his private key: ${c}^${d} mod ${n} = ${back}. Only the holder of d can do this.`, add: { Bob: [sec('Message', back)] } },
  ]);
}

export function exchangeScene(): Step[] {
  const { p, g, a, b } = DH;
  const A = modPow(g, a, p);
  const B = modPow(g, b, p);
  const sA = modPow(B, a, p);
  const sB = modPow(A, b, p);
  const group = pub('Public numbers', `p = ${p}, g = ${g}`);
  return scene([
    { text: `Both agree on public numbers p = ${p} and g = ${g}. Eve may know them too.`, wire: group, add: { Alice: [group], Bob: [group] } },
    { text: `Each picks a private number and keeps it: Alice ${a}, Bob ${b}.`, add: { Alice: [sec('Private value', a)], Bob: [sec('Private value', b)] } },
    { text: `Alice sends g^${a} mod ${p} = ${A}.`, wire: pub('From Alice', A), add: { Bob: [pub('From Alice', A)] } },
    { text: `Bob sends g^${b} mod ${p} = ${B}.`, wire: pub('From Bob', B), add: { Alice: [pub('From Bob', B)] } },
    {
      text: `Alice computes ${B}^${a} mod ${p} = ${sA}; Bob computes ${A}^${b} mod ${p} = ${sB}. The same secret, which never crossed the network. Eve has ${A} and ${B} but neither private value.`,
      add: { Alice: [sec('Shared secret', sA)], Bob: [sec('Shared secret', sB)] },
    },
  ]);
}

/** The signing scene, given the hash of the message Alice signs and the hash of what Bob receives. */
export function signScene(message: string, signedHash: string, received: string, receivedHash: string): Step[] {
  const valid = verify(signedHash, receivedHash);
  const alicePublic = pub("Alice's public key", 'published');
  const sig = pub('Signature', `sealed over ${signedHash.slice(0, 12)}...`);
  return scene([
    { text: 'Alice has a key pair and publishes the public key.', wire: alicePublic, add: { Alice: [alicePublic, sec("Alice's private key", 'kept by Alice')], Bob: [alicePublic] } },
    { text: `Alice hashes the message and signs the hash ${signedHash.slice(0, 12)}... with her private key.`, add: { Alice: [pub('Message', message)] } },
    { text: 'She sends the message and the signature. Nothing is secret here: Eve can read both.', wire: pub('Message and signature', message), add: { Bob: [pub('Message', received), sig] } },
    {
      text: valid
        ? `Bob hashes what he received (${receivedHash.slice(0, 12)}...) and checks the signature with Alice's public key: valid. The message is unchanged and came from the holder of Alice's private key.`
        : `Bob hashes what he received (${receivedHash.slice(0, 12)}...). The signature was made over a different hash, so the check with Alice's public key fails: the message was changed on the way.`,
      add: {},
    },
  ]);
}

export const verify = (signedHash: string, receivedHash: string) => signedHash === receivedHash;
