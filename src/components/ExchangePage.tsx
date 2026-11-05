import { useCallback, useEffect, useState } from 'react';
import type { Exchange } from '../schema';
import { replaceHash } from '../hooks/useHashRoute';
import { NetworkView } from './NetworkView';
import { SequenceView } from './SequenceView';
import { StepControls } from './StepControls';
import { StepDetails } from './StepDetails';
import { PacketView } from './PacketView';
import { SourceList } from './SourceList';
import { Prose } from './Prose';

export interface Selection {
  layer: string;
  field?: string;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function defaultSelection(exchange: Exchange, index: number): Selection {
  const first = exchange.steps[index].details.keyFields[0];
  return first ? { layer: first.layer, field: first.field } : { layer: exchange.steps[index].captures[0].layers.at(-1)!.def.id };
}

export function ExchangePage({ exchange, stepNumber }: { exchange: Exchange; stepNumber: number }) {
  const count = exchange.steps.length;
  const index = Math.min(Math.max(stepNumber, 1), count) - 1;
  const step = exchange.steps[index];

  const [link, setLink] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(() => defaultSelection(exchange, index));
  const [playing, setPlaying] = useState(false);

  const goTo = useCallback(
    (i: number) => {
      const clamped = Math.min(Math.max(i, 0), count - 1);
      replaceHash(`#/${exchange.id}/${clamped + 1}`);
    },
    [count, exchange.id],
  );

  // New step: select its first key field.
  useEffect(() => {
    setSelection(defaultSelection(exchange, index));
  }, [exchange, index]);

  // Keyboard: arrow keys step, Home and End jump.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target;
      if (t instanceof Element && t.closest('input, textarea, select, [contenteditable="true"]')) return;
      const map: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: count - 1 };
      if (e.key in map) {
        e.preventDefault();
        setPlaying(false);
        goTo(map[e.key]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, count, goTo]);

  // Autoplay.
  useEffect(() => {
    if (!playing) return;
    if (index >= count - 1) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => goTo(index + 1), 3500);
    return () => window.clearTimeout(t);
  }, [playing, index, count, goTo]);

  const capture = step.captures.find((c) => c.link === link) ?? step.captures[0];

  return (
    <div className="exchange">
      <section className="intro">
        <h1>{exchange.title}</h1>
        <p className="scenario">{exchange.scenario}</p>
        <Prose text={exchange.intro} />
      </section>

      <section className="panel" aria-label="Network view">
        <h2>Network</h2>
        <NetworkView exchange={exchange} step={step} />
      </section>

      <StepControls
        index={index}
        count={count}
        label={step.label}
        playing={playing}
        onGo={(i) => {
          setPlaying(false);
          goTo(i);
        }}
        onTogglePlay={() => {
          if (!playing && index >= count - 1) goTo(0);
          setPlaying(!playing);
        }}
      />

      <div className="views">
        <section className="panel" aria-label="Sequence view">
          <h2>Sequence</h2>
          <SequenceView exchange={exchange} index={index} onSelect={goTo} />
        </section>
        <section className="panel" aria-label="Step details">
          <StepDetails
            exchange={exchange}
            step={step}
            index={index}
            onSelectField={(s) => {
              setSelection(s);
              document.getElementById('packet')?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
            }}
          />
        </section>
      </div>

      <section className="panel packet-panel" id="packet" aria-label="Packet view">
        <h2>Packet</h2>
        <PacketView exchange={exchange} step={step} capture={capture} onLink={setLink} selection={selection} onSelect={setSelection} />
      </section>

      <section className="panel sources-panel">
        <h2>Sources</h2>
        <SourceList sources={exchange.sources} />
      </section>
    </div>
  );
}
