import { useState } from 'react';
import { LAYERS, MODELS, OWNER_LABEL } from './responsibility-data';

/** Who manages which layer per service model; selecting a model highlights its column and explains it. */
export default function ResponsibilityMatrix() {
  const [selected, setSelected] = useState(1);
  const model = MODELS[selected];
  const notes = LAYERS.filter((l) => l.note && (l.owners[selected] === 'shared' || l.owners.every((o) => o === 'customer')));

  return (
    <div className="resp-figure">
      <div className="resp-models" role="group" aria-label="Service model">
        {MODELS.map((m, i) => (
          <button key={m.id} type="button" className={`resp-model${i === selected ? ' is-selected' : ''}`} aria-pressed={i === selected} onClick={() => setSelected(i)}>
            {m.name}
          </button>
        ))}
      </div>
      <div className="resp-scroll">
        <table className="resp-table">
          <thead>
            <tr>
              <th scope="col">Layer</th>
              {MODELS.map((m, i) => (
                <th key={m.id} scope="col" className={i === selected ? 'is-selected' : undefined}>
                  <abbr title={m.name}>{m.short}</abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LAYERS.map((l) => (
              <tr key={l.id}>
                <th scope="row">{l.name}</th>
                {l.owners.map((o, i) => (
                  <td key={i} className={`resp-cell owner-${o}${i === selected ? ' is-selected' : ''}`}>
                    {OWNER_LABEL[o]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="resp-about" aria-live="polite">
        <p>
          <strong>{model.name}:</strong> {model.about}
        </p>
        <ul>
          {notes.map((l) => (
            <li key={l.id}>
              <strong>{l.name}:</strong> {l.note}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
