import { useState } from 'react';
import { DEFAULTS, STAGE_LABEL, boot, faultsFor, type Options, type Stage } from './boot';

const STAGES: Stage[] = ['firmware', 'loader', 'kernel', 'first'];
const FAULT_LABEL: Record<string, string> = {
  noBootEntry: 'No boot entry for this disk (after cloning it)',
  unsignedLoader: 'A boot loader that is not signed by a trusted key',
  missingDriver: 'The initramfs lacks the disk driver',
};

/** From power-on to login, one step at a time, with things that can break the chain. */
export default function BootChain() {
  const [o, setO] = useState<Options>(DEFAULTS);
  const [step, setStep] = useState(0);
  const steps = boot(o);
  const n = Math.min(step, steps.length - 1);
  const current = steps[n];
  const set = (patch: Partial<Options>) => {
    setO({ ...o, ...patch });
    setStep(0);
  };
  const failedAt = steps.at(-1)!.failed ? steps.at(-1)!.stage : undefined;

  return (
    <div className="bt-figure">
      <div className="bt-controls">
        <div className="bt-group" role="group" aria-label="Operating system">
          {(['linux', 'windows'] as const).map((s) => (
            <button key={s} type="button" className="chip" aria-pressed={o.system === s} onClick={() => set({ system: s, missingDriver: false })}>
              {s === 'linux' ? 'Linux' : 'Windows'}
            </button>
          ))}
        </div>
        <label className="bt-check">
          <input type="checkbox" checked={o.secureBoot} onChange={(e) => set({ secureBoot: e.target.checked })} /> Secure Boot on
        </label>
      </div>
      <fieldset className="bt-faults">
        <legend>Break something</legend>
        {faultsFor(o.system).map((f) => (
          <label key={f} className="bt-check">
            <input type="checkbox" checked={o[f] as boolean} onChange={(e) => set({ [f]: e.target.checked } as Partial<Options>)} /> {FAULT_LABEL[f]}
          </label>
        ))}
      </fieldset>

      <ol className="bt-stages" aria-label="Stages">
        {STAGES.map((s) => {
          const reached = steps.slice(0, n + 1).some((x) => x.stage === s);
          const now = current.stage === s;
          const failed = failedAt === s && n === steps.length - 1;
          return (
            <li key={s} className={`bt-stage${reached ? ' is-reached' : ''}${now ? ' is-now' : ''}${failed ? ' is-failed' : ''}`} aria-current={now ? 'step' : undefined}>
              {STAGE_LABEL[s]}
            </li>
          );
        })}
      </ol>

      <div className={`bt-step${current.failed ? ' is-failed' : ''}`} aria-live="polite">
        <span className="bt-who">
          Step {n + 1} of {steps.length}: {current.who}
        </span>
        <p>{current.text}</p>
        {n === steps.length - 1 && !current.failed && <p className="bt-done">The system has started.</p>}
      </div>
      <div className="sch-step">
        <button type="button" className="chip" onClick={() => setStep(n - 1)} disabled={n === 0}>
          Back
        </button>
        <button type="button" className="chip" onClick={() => setStep(n + 1)} disabled={n === steps.length - 1}>
          Next
        </button>
      </div>
      <p className="vm-note">The stages follow the table above, on UEFI firmware. Details differ between versions, distributions and boot loaders.</p>
    </div>
  );
}
