import { LEVELS, type Level } from '../levels';

/** Chips to show all entries or only those of one level. Nothing is stored. */
export function LevelFilter({ value, onChange }: { value: Level | null; onChange: (level: Level | null) => void }) {
  return (
    <div className="level-filter" role="group" aria-label="Filter by level">
      <button type="button" className="chip" aria-pressed={value === null} onClick={() => onChange(null)}>
        All levels
      </button>
      {([1, 2, 3] as Level[]).map((l) => (
        <button key={l} type="button" className="chip" aria-pressed={value === l} onClick={() => onChange(l)} title={LEVELS[l].about}>
          {l} {LEVELS[l].name}
        </button>
      ))}
    </div>
  );
}
