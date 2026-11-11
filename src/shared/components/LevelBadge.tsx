import { LEVELS, levelLabel, type Level } from '../levels';

export function LevelBadge({ level }: { level: Level }) {
  return (
    <span className={`level level-${level}`} title={LEVELS[level].about}>
      {levelLabel(level)}
    </span>
  );
}
