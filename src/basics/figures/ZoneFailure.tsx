import { useState } from 'react';
import { LAYOUTS, REGIONS, ZONES, deploy, evaluate, zoneId, type Layout, type Sizing } from './zones';

const STATUS_LABEL = { up: 'Up', overloaded: 'Up, but overloaded', 'failed-over': 'Up in region 2', down: 'Down' } as const;

/** Two regions with three zones each: place the application, switch zones off and see what survives. */
export default function ZoneFailure() {
  const [layout, setLayout] = useState<Layout>('two-zones');
  const [sizing, setSizing] = useState<Sizing>('one-spare');
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const d = deploy(layout);
  const o = evaluate(layout, sizing, failed);
  const flip = (z: string) => {
    const next = new Set(failed);
    if (next.has(z)) next.delete(z);
    else next.add(z);
    setFailed(next);
  };

  return (
    <div className="zn-figure">
      <div className="zn-controls" role="group" aria-label="Where the application runs">
        <span>Runs in</span>
        {LAYOUTS.map((l) => (
          <button key={l.id} type="button" className="chip" aria-pressed={layout === l.id} onClick={() => setLayout(l.id)}>
            {l.label}
          </button>
        ))}
      </div>
      <div className="zn-controls" role="group" aria-label="How the copies are sized">
        <span>Each copy is sized</span>
        <button type="button" className="chip" aria-pressed={sizing === 'just-enough'} disabled={layout === 'one-zone'} onClick={() => setSizing('just-enough')}>
          just for its share
        </button>
        <button type="button" className="chip" aria-pressed={sizing === 'one-spare'} disabled={layout === 'one-zone'} onClick={() => setSizing('one-spare')}>
          to cover a lost zone
        </button>
      </div>

      <div className="zn-regions">
        {REGIONS.map((name, r) => (
          <div key={name} className="zn-region">
            <span className="zn-region-name">{name}</span>
            <div className="zn-zones">
              {ZONES.map((z) => {
                const id = zoneId(r, z);
                const role = d.active.includes(id) ? 'active' : d.standby.includes(id) ? 'standby' : 'unused';
                const out = failed.has(id);
                const serving = o.serving.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    className={`zn-zone is-${role}${out ? ' is-out' : ''}${serving ? ' is-serving' : ''}`}
                    aria-pressed={out}
                    aria-label={`Zone ${id}, ${role === 'unused' ? 'not used' : role}${out ? ', failed' : ''}. Press to ${out ? 'repair' : 'fail'} it.`}
                    onClick={() => flip(id)}
                  >
                    <span className="zn-zone-name">Zone {id}</span>
                    <span className="zn-role">{out ? 'out' : role === 'active' ? 'copy' : role === 'standby' ? 'standby copy' : 'not used'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="zn-controls">
        <button type="button" className="link-button" onClick={() => setFailed(new Set(ZONES.map((z) => zoneId(0, z))))}>
          Lose all of region 1
        </button>
        <button type="button" className="link-button" onClick={() => setFailed(new Set())} disabled={failed.size === 0}>
          Repair all
        </button>
      </div>

      <p className={`zn-status is-${o.status}`} aria-live="polite">
        <strong>{STATUS_LABEL[o.status]}.</strong> {o.explanation}
      </p>
      <p className="vm-note">Select a zone to switch it off or on. A schematic picture: the number of zones, their distances and how failover works differ between providers.</p>
    </div>
  );
}
