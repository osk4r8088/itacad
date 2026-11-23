import { useState } from 'react';
import { CERTS, FAULT_LABELS, NO_FAULTS, validate, type Faults, type Level } from './cert-chain';

const ORDER: Level[] = ['root', 'intermediate', 'leaf'];
const TITLE: Record<Level, string> = { root: 'Root certificate', intermediate: 'Intermediate certificate', leaf: 'Leaf certificate (the server)' };

/** A chain of three certificates where every link can be broken to see which check fails. */
export default function CertChain() {
  const [faults, setFaults] = useState<Faults>(NO_FAULTS);
  const { checks, trusted, address } = validate(faults);
  const failed = checks.filter((c) => c.made && !c.ok);

  return (
    <div className="cc-figure">
      <p className={`cc-verdict ${trusted ? 'is-ok' : 'is-bad'}`} aria-live="polite">
        {trusted ? (
          <>
            <strong>Trusted.</strong> The browser opens https://{address} without a warning.
          </>
        ) : (
          <>
            <strong>Refused.</strong> The browser shows a warning for https://{address}: {failed.map((c) => `${c.level}: ${c.why}`).join('; ')}.
          </>
        )}
      </p>

      <ol className="cc-chain">
        {ORDER.map((level, i) => {
          const cert = CERTS[level];
          const mine = checks.filter((c) => c.level === level);
          const missing = level === 'intermediate' && faults.intermediateMissing;
          return (
            <li key={level} className={`cc-cert${missing ? ' is-missing' : ''}${mine.some((c) => c.made && !c.ok) ? ' is-bad' : ''}`}>
              {i > 0 && <span className="cc-link">signed by the certificate above</span>}
              <div className="cc-head">
                <strong>{TITLE[level]}</strong>
                <span>
                  Subject <span className="mono">{cert.subject}</span>, issuer <span className="mono">{cert.issuer}</span>
                  {cert.names && (
                    <>
                      , names <span className="mono">{cert.names.join(', ')}</span>
                    </>
                  )}
                </span>
              </div>
              <ul className="cc-checks">
                {mine.map((c) => (
                  <li key={c.what} className={!c.made ? 'is-skip' : c.ok ? 'is-ok' : 'is-bad'}>
                    <span className="cc-mark">{!c.made ? 'Not checked' : c.ok ? 'OK' : 'Fails'}</span> {c.what}
                  </li>
                ))}
              </ul>
              <div className="cc-faults" role="group" aria-label={`Break the ${level} certificate`}>
                <span>Break it:</span>
                {FAULT_LABELS.filter((f) => f.level === level).map((f) => (
                  <label key={f.key}>
                    <input type="checkbox" checked={faults[f.key]} onChange={(e) => setFaults({ ...faults, [f.key]: e.target.checked })} /> {f.label}
                  </label>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
      <div>
        <button type="button" className="link-button" onClick={() => setFaults(NO_FAULTS)} disabled={trusted}>
          Repair everything
        </button>
      </div>
      <p className="vm-note">
        The names and certificates are invented. Real clients differ in details, for example in how they check revocation; the checks shown are the ones the text lists.
      </p>
    </div>
  );
}
