import { useEffect, useState } from 'react';
import { differingBits, differingDigits, sha256Hex } from './hash';

/** Two texts and their SHA-256 hashes; a small change in the text flips about half of the 256 bits. */
export default function HashExplorer() {
  const [a, setA] = useState('hello');
  const [b, setB] = useState('hellp');
  const [hashes, setHashes] = useState<[string, string] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    Promise.all([sha256Hex(a), sha256Hex(b)])
      .then((pair) => current && setHashes(pair))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [a, b]);

  const changed = hashes ? differingDigits(hashes[0], hashes[1]) : [];
  const bits = hashes ? differingBits(hashes[0], hashes[1]) : 0;

  return (
    <div className="hash-figure">
      <HashInput label="First text" value={a} onChange={setA} hash={hashes?.[0]} changed={changed} />
      <HashInput label="Second text" value={b} onChange={setB} hash={hashes?.[1]} changed={changed} />
      {failed ? (
        <p className="hash-result" role="alert">
          This browser does not offer SHA-256 on this page.
        </p>
      ) : (
        hashes && (
          <p className="hash-result" aria-live="polite">
            {a === b ? (
              <>The texts are identical, and so are the hashes: the same input always gives the same hash.</>
            ) : (
              <>
                <strong>{bits} of 256 bits</strong> differ ({Math.round((bits / 256) * 100)} %). The marked digits are the ones that changed. The length of the hash is the same for any input: {new TextEncoder().encode(a).length} and{' '}
                {new TextEncoder().encode(b).length} bytes of text both give 32 bytes.
              </>
            )}
          </p>
        )
      )}
    </div>
  );
}

function HashInput({ label, value, onChange, hash, changed }: { label: string; value: string; onChange: (v: string) => void; hash?: string; changed: boolean[] }) {
  return (
    <div className="hash-row">
      <label>
        <span>{label}</span>
        <input type="text" value={value} maxLength={200} spellCheck={false} autoComplete="off" onChange={(e) => onChange(e.target.value)} />
      </label>
      <code className="hash-value" aria-label={`SHA-256 of the ${label.toLowerCase()}`}>
        {hash
          ? Array.from(hash, (ch, i) => (
              <span key={i} className={changed[i] ? 'is-changed' : undefined}>
                {ch}
              </span>
            ))
          : ' '}
      </code>
    </div>
  );
}
