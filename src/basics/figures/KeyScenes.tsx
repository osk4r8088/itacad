import { useEffect, useMemo, useState } from 'react';
import { sha256Hex } from './hash';
import { encryptScene, exchangeScene, signScene, type Actor, type Item, type Step } from './key-scenes';

type SceneId = 'encrypt' | 'exchange' | 'sign';
const SCENES: { id: SceneId; label: string }[] = [
  { id: 'encrypt', label: 'Encrypt to someone' },
  { id: 'exchange', label: 'Agree on a secret' },
  { id: 'sign', label: 'Sign' },
];
const MESSAGE = 'Pay 10 euros to Bob';
const CHANGED = 'Pay 1000 euros to Eve';

/** Who holds which key, in three scenes: encryption, key exchange and signature. */
export default function KeyScenes() {
  const [scene, setScene] = useState<SceneId>('encrypt');
  const [step, setStep] = useState(0);
  const [tamper, setTamper] = useState(false);
  const [hashes, setHashes] = useState<{ original: string; changed: string } | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    Promise.all([sha256Hex(MESSAGE), sha256Hex(CHANGED)]).then(([original, changed]) => alive && setHashes({ original, changed }));
    return () => {
      alive = false;
    };
  }, []);

  const steps: Step[] = useMemo(() => {
    if (scene === 'encrypt') return encryptScene();
    if (scene === 'exchange') return exchangeScene();
    if (!hashes) return [];
    return signScene(MESSAGE, hashes.original, tamper ? CHANGED : MESSAGE, tamper ? hashes.changed : hashes.original);
  }, [scene, hashes, tamper]);

  const pick = (id: SceneId) => {
    setScene(id);
    setStep(0);
  };
  const n = Math.min(step, Math.max(0, steps.length - 1));
  const s = steps[n];

  return (
    <div className="ks-figure">
      <div className="ks-controls" role="group" aria-label="Scene">
        {SCENES.map((x) => (
          <button key={x.id} type="button" className="chip" aria-pressed={scene === x.id} onClick={() => pick(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      {scene === 'sign' && (
        <label className="ks-tamper">
          <input type="checkbox" checked={tamper} onChange={(e) => setTamper(e.target.checked)} /> Eve changes the message on the way to “{CHANGED}”
        </label>
      )}

      {s ? (
        <>
          <p className="ks-text" aria-live="polite">
            <strong>
              Step {n + 1} of {steps.length}.
            </strong>{' '}
            {s.text}
          </p>
          <div className="ks-people">
            {(['Alice', 'Bob', 'Eve'] as Actor[]).map((a) => (
              <div key={a} className={`ks-person ks-${a.toLowerCase()}`}>
                <strong>{a}</strong>
                <span className="ks-role">{a === 'Eve' ? 'sees the network' : a === 'Alice' ? 'sender' : 'receiver'}</span>
                <ul>
                  {s.knows[a].length === 0 ? <li className="ks-none">nothing yet</li> : s.knows[a].map((i, k) => <Known key={k} item={i} />)}
                </ul>
              </div>
            ))}
          </div>
          {s.wire && (
            <p className="ks-wire">
              On the network: <span className="mono">{s.wire.label}: {s.wire.value}</span>
            </p>
          )}
          <div className="sch-step">
            <button type="button" className="chip" onClick={() => setStep(n - 1)} disabled={n === 0}>
              Back
            </button>
            <button type="button" className="chip" onClick={() => setStep(n + 1)} disabled={n === steps.length - 1}>
              Next
            </button>
          </div>
        </>
      ) : (
        <p className="ks-text">Computing the hashes...</p>
      )}
      <p className="vm-note">
        Toy numbers: the encryption is textbook RSA with n = 61 x 53, the key exchange works modulo 23. With numbers this small Eve could simply try every possibility; real keys are far larger (256 bits on an elliptic curve, 2048 bits or more for RSA, as in the tables above), which makes that infeasible. The signature uses a real SHA-256 hash and shows the signature itself only as a sealed value. Items marked private never leave their owner.
      </p>
    </div>
  );
}

function Known({ item }: { item: Item }) {
  return (
    <li className={item.secret ? 'is-secret' : undefined}>
      {item.label}: <span className="mono">{item.value}</span>
      {item.secret && <span className="ks-private"> private</span>}
    </li>
  );
}
