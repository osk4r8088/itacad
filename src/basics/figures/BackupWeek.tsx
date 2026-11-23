import { useState } from 'react';
import { DAYS, latestRestorable, plan, restore, stored, type Kind, type Strategy } from './backup-week';

const STRATEGIES: { id: Strategy; label: string }[] = [
  { id: 'full', label: 'Full every night' },
  { id: 'incremental', label: 'Incremental' },
  { id: 'differential', label: 'Differential' },
];

const KIND_LABEL: Record<Kind, string> = { full: 'Full', incremental: 'Incremental', differential: 'Differential' };

const list = (days: number[]) => {
  const names = days.map((d) => DAYS[d]);
  return names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

/** A week of nightly backups: pick a night to restore and see which backups it needs; damage one to see what is lost. */
export default function BackupWeek() {
  const [strategy, setStrategy] = useState<Strategy>('incremental');
  const [day, setDay] = useState(3);
  const [damaged, setDamaged] = useState<Set<number>>(new Set());
  const nights = plan(strategy);
  const r = restore(strategy, day, damaged);
  const latest = latestRestorable(strategy, damaged);

  const flip = (d: number) => {
    const next = new Set(damaged);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    setDamaged(next);
  };

  return (
    <div className="bw-figure">
      <div className="bw-choice" role="group" aria-label="Kind of nightly backup">
        <span>Nightly backups after the full one on Sunday</span>
        {STRATEGIES.map((s) => (
          <button key={s.id} type="button" className="chip" aria-pressed={strategy === s.id} onClick={() => setStrategy(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      <ol className="bw-week">
        {nights.map((n) => {
          const needed = r.needed.includes(n.day);
          const broken = damaged.has(n.day);
          return (
            <li key={n.day} className={`bw-night bw-${n.kind}${needed ? ' is-needed' : ''}${broken ? ' is-damaged' : ''}${n.day === day ? ' is-target' : ''}`}>
              <button type="button" className="bw-pick" aria-pressed={n.day === day} onClick={() => setDay(n.day)}>
                <span className="bw-day">{DAYS[n.day]}</span>
                <span className="bw-kind">{KIND_LABEL[n.kind]}</span>
                <span className="bw-size mono">{n.size} GB</span>
                <span className="bw-bar" style={{ width: `${Math.max(4, n.size)}%` }} aria-hidden="true" />
              </button>
              <label className="bw-damage">
                <input type="checkbox" checked={broken} onChange={() => flip(n.day)} /> damaged
              </label>
            </li>
          );
        })}
      </ol>

      <p className="bw-result" aria-live="polite">
        {r.broken === undefined ? (
          <>
            <strong>Restore {DAYS[day]}'s state:</strong> {r.needed.length === 1 ? 'one backup' : `${r.needed.length} backups`}, {list(r.needed)}, {r.read} GB to read.
            {strategy === 'incremental' && day > 1 && <> Every link of the chain has to be readable.</>}
            {strategy === 'differential' && day > 1 && <> The nights in between are not needed.</>}
          </>
        ) : (
          <>
            <strong>{DAYS[day]}'s state cannot be restored:</strong> the backup of {DAYS[r.broken]} is damaged and the restore needs it.{' '}
            {latest === undefined ? 'No night of this week can be restored at all.' : `The latest state that can still be restored is ${DAYS[latest]}'s.`}
          </>
        )}
      </p>
      <p className="bw-stats">
        Stored this week: <span className="mono">{stored(strategy)} GB</span> in 7 backups, for 100 GB of data.
      </p>
      <p className="vm-note">Invented sizes, and every day changes different data, so the numbers add up exactly. Real software also compresses, removes duplicates and often works incrementally forever, as the next paragraph describes.</p>
    </div>
  );
}
