/**
 * A chain of three certificates for the figure on certificates and PKI, and the checks a client
 * makes on it, as the topic lists them (RFC 5280 path validation, RFC 9525 for the name):
 * each signature verifies with the key of the certificate above, the chain ends at a root in the
 * trust store, every certificate is within its validity period and not revoked, a certificate that
 * signs others is marked as a CA, and the name in the address is among the leaf's names.
 *
 * Every check can be broken on purpose to see which one fails.
 */

export type Level = 'leaf' | 'intermediate' | 'root';

export interface Faults {
  /** The address the browser opened differs from the names in the leaf. */
  wrongName: boolean;
  leafExpired: boolean;
  leafRevoked: boolean;
  /** The leaf was changed after signing, so the intermediate's signature no longer matches. */
  leafTampered: boolean;
  /** The server sends only its leaf, without the intermediate. */
  intermediateMissing: boolean;
  intermediateExpired: boolean;
  intermediateRevoked: boolean;
  /** The intermediate is not marked as allowed to sign certificates (basic constraints, CA false). */
  intermediateNotCa: boolean;
  /** The root is not in the client's trust store. */
  rootUntrusted: boolean;
}

export const NO_FAULTS: Faults = {
  wrongName: false,
  leafExpired: false,
  leafRevoked: false,
  leafTampered: false,
  intermediateMissing: false,
  intermediateExpired: false,
  intermediateRevoked: false,
  intermediateNotCa: false,
  rootUntrusted: false,
};

export const FAULT_LABELS: { key: keyof Faults; level: Level; label: string }[] = [
  { key: 'wrongName', level: 'leaf', label: 'Open shop.example.com instead' },
  { key: 'leafExpired', level: 'leaf', label: 'Expired' },
  { key: 'leafRevoked', level: 'leaf', label: 'Revoked' },
  { key: 'leafTampered', level: 'leaf', label: 'Changed after signing' },
  { key: 'intermediateMissing', level: 'intermediate', label: 'Not sent by the server' },
  { key: 'intermediateExpired', level: 'intermediate', label: 'Expired' },
  { key: 'intermediateRevoked', level: 'intermediate', label: 'Revoked' },
  { key: 'intermediateNotCa', level: 'intermediate', label: 'Not marked as a CA' },
  { key: 'rootUntrusted', level: 'root', label: 'Not in the trust store' },
];

export const CERTS: Record<Level, { subject: string; issuer: string; names?: string[] }> = {
  leaf: { subject: 'www.example.com', issuer: 'Example Issuing CA', names: ['www.example.com', 'example.com'] },
  intermediate: { subject: 'Example Issuing CA', issuer: 'Example Root CA' },
  root: { subject: 'Example Root CA', issuer: 'Example Root CA (itself)' },
};

export interface Check {
  level: Level;
  what: string;
  ok: boolean;
  /** Why it failed, or undefined if it passed. */
  why?: string;
  /** False when the check could not be made because the chain could not be built. */
  made: boolean;
}

export function validate(f: Faults): { checks: Check[]; trusted: boolean; address: string } {
  const address = f.wrongName ? 'shop.example.com' : 'www.example.com';
  const built = !f.intermediateMissing;
  const c = (level: Level, what: string, ok: boolean, why: string, made = true): Check => ({ level, what, ok: made ? ok : false, made, ...(made && !ok ? { why } : {}) });
  const checks: Check[] = [
    c('leaf', `The address ${address} is among its names`, !f.wrongName, `the leaf names only ${CERTS.leaf.names!.join(' and ')}`),
    c('leaf', 'Within its validity period', !f.leafExpired, 'its "not after" date has passed'),
    c('leaf', 'Not revoked', !f.leafRevoked, 'the CA has revoked it'),
    c('leaf', 'Signature verifies with the key of the intermediate', !f.leafTampered, 'the signed content no longer matches the signature', built),
    c('intermediate', 'Present: the server sent it along', built, 'without it the client cannot link the leaf to a root'),
    c('intermediate', 'Within its validity period', !f.intermediateExpired, 'its "not after" date has passed', built),
    c('intermediate', 'Not revoked', !f.intermediateRevoked, 'the root CA has revoked it', built),
    c('intermediate', 'Allowed to sign certificates (marked as a CA)', !f.intermediateNotCa, 'its basic constraints say it is not a CA, so its signature on the leaf does not count', built),
    c('intermediate', 'Signature verifies with the key of the root', true, '', built),
    c('root', 'In the trust store of the client', !f.rootUntrusted, 'the client has never been told to trust this root', built),
  ];
  return { checks, trusted: checks.every((x) => x.ok), address };
}
