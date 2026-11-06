import type { StructInstance } from '../schema';
import { ROW_BITS, rows, segments } from '../lib/layout';

interface Props {
  inst: StructInstance;
  payloadOctets: number;
  payloadName?: string;
  selected?: string;
  onSelect: (fieldId: string) => void;
}

/** RFC-style diagram: 32 bits per row, every field as a clickable cell. */
export function HeaderDiagram({ inst, payloadOctets, payloadName, selected, onSelect }: Props) {
  const grid = rows(segments(inst, payloadOctets));
  return (
    <div className="diagram" role="group" aria-label={`${inst.def.name}, fields in 32-bit rows`}>
      <div className="diagram-ruler" aria-hidden="true">
        {Array.from({ length: ROW_BITS }, (_, i) => (
          <span key={i}>{i % 8 === 0 || i === ROW_BITS - 1 ? i : ''}</span>
        ))}
      </div>
      {grid.map((cells, r) => (
        <div className="diagram-row" key={r}>
          {cells.map((c, i) => {
            const style = { gridColumn: `${c.col + 1} / span ${c.span}` };
            if (c.seg.kind === 'payload') {
              return (
                <div key={i} className="cell payload" style={style}>
                  {payloadName ? `Payload: ${payloadName}` : 'Payload'}, {payloadOctets} octets (not to scale)
                </div>
              );
            }
            const f = c.seg.field!;
            const v = c.seg.value!;
            const narrow = c.span < 8;
            const vertical = c.span <= 2;
            const label = narrow ? (f.short ?? f.name) : f.name;
            // Narrow cells show only the value itself ("8" instead of "8 (32 octets)"); the details panel has the rest.
            const display = c.seg.compact
              ? `${v.display.replace(/\s+/g, ' ')} (${v.bits / 8} octets, not to scale)`
              : c.span < 12
                ? v.display.split(' ')[0]
                : v.display;
            return (
              <button
                type="button"
                key={i}
                className={`cell${selected === f.id ? ' selected' : ''}${narrow ? ' narrow' : ''}${vertical ? ' vertical' : ''}${v.unverified ? ' unverified' : ''}${!c.first ? ' cont' : ''}${c.seg.compact ? ' compact' : ''}`}
                style={style}
                onClick={() => onSelect(f.id)}
                title={`${f.name} (${v.bits} bits): ${v.display}`}
                aria-label={`${f.name}, ${v.bits} bits, value ${v.display}`}
                aria-pressed={selected === f.id}
              >
                <span className="cell-name">{c.first ? label : `${label} (cont.)`}</span>
                {(c.first || !narrow) && <span className="cell-value">{c.first ? display : ''}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
