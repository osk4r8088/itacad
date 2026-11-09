interface Props {
  index: number;
  count: number;
  label: string;
  playing: boolean;
  onGo: (index: number) => void;
  onTogglePlay: () => void;
}

export function StepControls({ index, count, label, playing, onGo, onTogglePlay }: Props) {
  return (
    <nav className="controls" aria-label="Steps">
      <button type="button" onClick={() => onGo(index - 1)} disabled={index === 0} aria-label="Previous step">
        <span aria-hidden="true">&larr;</span> Prev
      </button>
      <div className="controls-status" aria-live="polite">
        <span className="controls-count">
          Step {index + 1} / {count}
        </span>
        <span className="controls-label">{label}</span>
      </div>
      <button type="button" onClick={() => onGo(index + 1)} disabled={index === count - 1} aria-label="Next step">
        Next <span aria-hidden="true">&rarr;</span>
      </button>
      <button type="button" onClick={onTogglePlay} aria-pressed={playing} className="play">
        {playing ? 'Pause' : 'Play'}
      </button>
      <span className="controls-hint muted">Arrow keys step</span>
    </nav>
  );
}
