import type { Exchange, OsiLayer, Step } from '../../shared/schema';
import { OSI_LAYERS } from '../../shared/layers';
import type { Selection } from '../../shared/components/PacketView';
import { Prose } from '../../shared/components/Prose';
import { SourceLink } from '../../shared/components/SourceList';

/** OSI layers carried in the first capture of a step, as "1 Physical", "2 Data Link", ... */
function osiLayers(step: Step): string[] {
  const present = new Set(step.captures[0].layers.flatMap((l) => l.def.osi));
  return ([1, 2, 3, 4, 5, 6, 7] as OsiLayer[]).filter((o) => present.has(o)).map((o) => `${o} ${OSI_LAYERS[o].name}`);
}

/** For exchanges that chain protocols: every fact learned so far, the new ones marked, the rest still unknown. */
function KnownSoFar({ exchange, index }: { exchange: Exchange; index: number }) {
  const all = exchange.steps.flatMap((s, i) => (s.learned ?? []).map((l) => ({ ...l, at: i })));
  if (all.length === 0) return null;
  return (
    <div className="known">
      <h3>Known so far</h3>
      <dl>
        {all.map((l) => (
          <div key={l.label} className={l.at === index ? 'new' : l.at > index ? 'unknown' : ''}>
            <dt>{l.label}</dt>
            <dd className="mono">{l.at <= index ? l.value : 'not yet known'}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

interface Props {
  exchange: Exchange;
  step: Step;
  index: number;
  onSelectField: (s: Selection) => void;
}

export function StepDetails({ exchange, step, index, onSelectField }: Props) {
  const name = (id: string) => exchange.participants.find((p) => p.id === id)?.label ?? id;
  const layers = step.captures[0].layers;
  const fieldName = (layer: string, field: string) => {
    const def = layers.find((l) => l.def.id === layer)?.def;
    const f = def && [...def.fields, ...(def.trailer ?? [])].find((x) => x.id === field);
    return f ? `${def.name.replace(/ header$/, '')}: ${f.name}` : `${layer}.${field}`;
  };
  const d = step.details;

  return (
    <div className="step-details">
      <h2>
        Step {index + 1}: {step.label}
      </h2>
      <p className="muted">
        {name(step.from)} to {name(step.to)}
        {step.states && (
          <>
            {' '}
            &middot; state after this step:{' '}
            {Object.entries(step.states)
              .map(([id, s]) => `${name(id)} ${s}`)
              .join(', ')}
          </>
        )}
      </p>
      <p className="muted osi-line">OSI layers: {osiLayers(step).join(', ')}</p>
      <KnownSoFar exchange={exchange} index={index} />

      <h3>In this step</h3>
      <Prose text={d.what} />
      <h3>Why it works this way</h3>
      <Prose text={d.why} />

      {d.keyFields.length > 0 && (
        <>
          <h3>Fields that matter</h3>
          <ul className="key-fields">
            {d.keyFields.map((k) => (
              <li key={`${k.layer}.${k.field}`}>
                <button type="button" className="chip" onClick={() => onSelectField({ layer: k.layer, field: k.field })}>
                  {fieldName(k.layer, k.field)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {d.typical && (
        <>
          <h3>Typical values</h3>
          <Prose text={d.typical} />
        </>
      )}
      {d.wrong && (
        <>
          <h3>What can go wrong</h3>
          <Prose text={d.wrong} />
        </>
      )}
      {d.insight && (
        <div className="insight">
          <h3>Insight</h3>
          <Prose text={d.insight} />
        </div>
      )}

      <p className="step-sources muted">
        Sources:{' '}
        {step.sources.map((s, i) => (
          <span key={i}>
            {i > 0 && ', '}
            <SourceLink source={s} />
          </span>
        ))}
      </p>
    </div>
  );
}
