import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Exchange } from '../../shared/schema';
import { href, replaceHash } from '../../app/router';
import { NetworkView } from './NetworkView';
import { SequenceView } from './SequenceView';
import { StepControls } from './StepControls';
import { StepDetails } from './StepDetails';
import { PacketView, type Selection } from '../../shared/components/PacketView';
import { SourceList } from '../../shared/components/SourceList';
import { Prose } from '../../shared/components/Prose';
import { FlowTable } from './FlowTable';
import { ProtocolSwitcher } from './ProtocolSwitcher';
import { PhaseBar } from './PhaseBar';
import { SITE_NAME } from '../../shared/hub';
import { hasQuiz } from '../../quizzes/catalog';
import { ReadFirst } from '../../app/ReadFirst';
import { resolveRef } from '../../app/entries';
import { LevelBadge } from '../../shared/components/LevelBadge';
import type { EntryRef } from '../../shared/refs';

/** Relative width of the sequence column in the dashboard: more lifelines need more room. */
function seqWeight(exchange: Exchange): string {
  const n = exchange.participants.filter((p) => p.lifeline).length;
  return `${n <= 2 ? 0.95 : n === 3 ? 1.25 : n === 4 ? 1.5 : 1.8}fr`;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function defaultSelection(exchange: Exchange, index: number): Selection {
  const first = exchange.steps[index].details.keyFields[0];
  return first ? { layer: first.layer, field: first.field } : { layer: exchange.steps[index].captures[0].layers.at(-1)!.def.id };
}

interface Props {
  exchange: Exchange;
  stepNumber: number;
  /** Link of a step; protocol pages use #/protocols/<id>/<n>, lessons their own route. */
  stepHref?: (step: number) => string;
  /** Replaces the protocol menu in the top bar, for example with the lesson title. */
  crumb?: ReactNode;
  /** The entry this exchange belongs to, for its level and Read first links; a protocol by default. */
  entry?: EntryRef;
}

export function ExchangePage({ exchange, stepNumber, stepHref, crumb, entry }: Props) {
  const count = exchange.steps.length;
  const index = Math.min(Math.max(stepNumber, 1), count) - 1;
  const step = exchange.steps[index];

  const [link, setLink] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(() => defaultSelection(exchange, index));
  const [playing, setPlaying] = useState(false);

  const goTo = useCallback(
    (i: number) => {
      const clamped = Math.min(Math.max(i, 0), count - 1);
      replaceHash(stepHref ? stepHref(clamped + 1) : href.exchange(exchange.id, clamped + 1));
    },
    [count, stepHref, exchange.id],
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
      if (t instanceof Element && t.closest('input, textarea, select, [contenteditable="true"], .switcher-menu')) return;
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
  const level = resolveRef(entry ?? { protocol: exchange.id })?.level;

  return (
    <div className="exchange" style={{ '--seq-fr': seqWeight(exchange) } as React.CSSProperties}>
      <header className="ex-bar">
        <div className="ex-title">
          <a href={href.home} className="site-title">
            {SITE_NAME}
          </a>
          <span className="crumb">
            {crumb ?? <ProtocolSwitcher currentId={exchange.id} currentTitle={exchange.title} />}
          </span>
          <details className="about">
            <summary>About this exchange</summary>
            <div className="about-pop">
              <ReadFirst entry={entry ?? { protocol: exchange.id }} />
              <p className="scenario">{exchange.scenario}</p>
              <Prose text={exchange.intro} />
              <h2>Sources</h2>
              <SourceList sources={exchange.sources} />
            </div>
          </details>
          {hasQuiz(exchange.id) && (
            <a className="quiz-link" href={href.quiz(exchange.id)}>
              Quiz
            </a>
          )}
          {level && <LevelBadge level={level} />}
        </div>
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
      </header>

      {exchange.phases && <PhaseBar exchange={exchange} index={index} onGo={(i) => (setPlaying(false), goTo(i))} />}

      <div className="row-top">
        <section className="panel area-network" aria-label="Network view">
          <h2>Network</h2>
          <NetworkView exchange={exchange} step={step} />
        </section>
        <section className="panel area-flow" aria-label="Packet flow">
          <h2>Packet flow</h2>
          <FlowTable
            exchange={exchange}
            index={index}
            onSelect={(i) => {
              setPlaying(false);
              goTo(i);
            }}
          />
        </section>
      </div>

      <div className="row-bottom">
        <section className="panel area-seq" aria-label="Sequence view">
          <h2>Sequence</h2>
          <SequenceView exchange={exchange} index={index} onSelect={goTo} />
        </section>
        <section className="panel area-details" aria-label="Step details">
          <StepDetails
            exchange={exchange}
            step={step}
            index={index}
            onSelectField={(s) => {
              setSelection(s);
              document.getElementById('packet')?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
            }}
          />
        </section>
        <section className="panel area-packet" id="packet" aria-label="Packet view">
          <h2>Packet</h2>
          <PacketView exchange={exchange} step={step} capture={capture} onLink={setLink} selection={selection} onSelect={setSelection} />
        </section>
      </div>
    </div>
  );
}
