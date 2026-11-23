import { useState } from 'react';
import { BITS, PRESETS, SIGNED_WEIGHTS, WEIGHTS, binary, bitAt, hex, invert, negate, parseByte, plusOne, signed, toggle, unsigned } from './bits';

const POSITIONS = Array.from({ length: BITS }, (_, i) => i);

/** Eight bits to switch on and off, read at the same time as unsigned, signed and hexadecimal. */
export default function BitToggler() {
  const [byte, setByte] = useState(0x41);
  const [text, setText] = useState('');
  const [note, setNote] = useState<string>('');
  const typed = text.trim() === '' ? undefined : parseByte(text);

  const set = (b: number, why = '') => {
    setByte(b);
    setNote(why);
  };

  return (
    <div className="bits-figure">
      <div className="bits-row" role="group" aria-label="Bits, most significant first">
        {POSITIONS.map((i) => {
          const on = bitAt(byte, i) === 1;
          return (
            <button
              key={i}
              type="button"
              className={`bits-bit${on ? ' is-on' : ''}${i === 3 ? ' is-nibble-end' : ''}`}
              aria-pressed={on}
              aria-label={`Bit ${BITS - 1 - i}, worth ${WEIGHTS[i]}${i === 0 ? ' or -128 when signed' : ''}`}
              onClick={() => set(toggle(byte, i))}
            >
              {on ? 1 : 0}
            </button>
          );
        })}
      </div>
      <div className="bits-row bits-weights" aria-hidden="true">
        {POSITIONS.map((i) => (
          <span key={i} className={i === 3 ? 'is-nibble-end' : undefined}>
            {WEIGHTS[i]}
          </span>
        ))}
      </div>
      <div className="bits-row bits-weights bits-signed" aria-hidden="true">
        {POSITIONS.map((i) => (
          <span key={i} className={i === 3 ? 'is-nibble-end' : undefined}>
            {SIGNED_WEIGHTS[i]}
          </span>
        ))}
      </div>

      <p className="bits-legend">Value of each position: unsigned in the upper row, signed in the lower row. Only the highest bit differs.</p>
      <dl className="bits-readings" aria-live="polite">
        <div>
          <dt>Unsigned</dt>
          <dd className="mono">{unsigned(byte)}</dd>
        </div>
        <div>
          <dt>Signed (two's complement)</dt>
          <dd className="mono">{signed(byte)}</dd>
        </div>
        <div>
          <dt>Hexadecimal</dt>
          <dd className="mono">{hex(byte)}</dd>
        </div>
        <div>
          <dt>Binary</dt>
          <dd className="mono">{binary(byte)}</dd>
        </div>
      </dl>

      <div className="bits-actions">
        <button
          type="button"
          className="chip"
          onClick={() => {
            const r = plusOne(byte);
            set(r.result, r.wrapped ? '255 + 1 does not fit into eight bits: the carry falls off the left end and the byte wraps around to 0.' : unsigned(byte) === 127 ? '127 + 1 sets the highest bit: unsigned this is 128, signed it jumps from 127 to -128.' : '');
          }}
        >
          Add 1
        </button>
        <button type="button" className="chip" onClick={() => set(invert(byte), 'Every bit flipped. Read signed, the result is minus the old value minus one.')}>
          Invert all bits
        </button>
        <button
          type="button"
          className="chip"
          onClick={() =>
            set(
              negate(byte),
              signed(byte) === -128 ? 'Invert and add 1 gives -128 again: +128 does not fit into a signed byte, so -128 has no positive partner.' : `Invert and add 1: in two's complement that is the negative of a number. ${signed(byte)} became ${signed(negate(byte))}.`,
            )
          }
        >
          Negate
        </button>
        <label className="bits-input">
          <span>Set to</span>
          <input
            value={text}
            placeholder="-1 or 0x41"
            onChange={(e) => {
              setText(e.target.value);
              const b = parseByte(e.target.value);
              if (b !== undefined) set(b);
            }}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={text.trim() !== '' && typed === undefined}
          />
        </label>
      </div>
      <div className="vm-presets" role="group" aria-label="Examples">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" className="link-button" onClick={() => set(p.byte)}>
            {p.label}
          </button>
        ))}
      </div>
      {note && <p className="bits-note">{note}</p>}
      {text.trim() !== '' && typed === undefined && <p className="bits-note notice">That does not fit into one byte. Use a whole number from -128 to 255, 0x and two hex digits, or 0b and up to eight bits.</p>}
    </div>
  );
}
