import type { Exchange, Step } from '../schema';
import type { Selection } from './ExchangePage';
import { Prose } from './Prose';
import { SourceLink } from './SourceList';

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

      <h3>What happens</h3>
      <Prose text={d.what} />
      <h3>Why</h3>
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
