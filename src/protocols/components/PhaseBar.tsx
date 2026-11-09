import type { Exchange } from '../../shared/schema';
import { href } from '../../app/router';

/** Phases of an exchange that chains protocols: where we are, and a jump to each phase. */
export function PhaseBar({ exchange, index, onGo }: { exchange: Exchange; index: number; onGo: (step: number) => void }) {
  const phases = exchange.phases ?? [];
  const current = exchange.steps[index].phase;
  const firstStep = (id: string) => exchange.steps.findIndex((s) => s.phase === id);
  const currentIndex = phases.findIndex((p) => p.id === current);
  const phase = phases[currentIndex];
  return (
    <nav className="phase-bar" aria-label="Phases">
      <ol>
        {phases.map((p, i) => (
          <li key={p.id} className={i < currentIndex ? 'done' : i === currentIndex ? 'current' : ''}>
            <button type="button" onClick={() => onGo(firstStep(p.id))} aria-current={i === currentIndex ? 'step' : undefined} title={p.about}>
              <span className="num">{i + 1}</span> {p.label}
            </button>
          </li>
        ))}
      </ol>
      {phase && (
        <p className="phase-about small">
          <strong>{phase.label}:</strong> {phase.about}
          {phase.deepDive && (
            <>
              {' '}
              <a href={href.exchange(phase.deepDive)}>Deep dive</a>
            </>
          )}
        </p>
      )}
    </nav>
  );
}
