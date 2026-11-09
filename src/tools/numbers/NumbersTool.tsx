import { useId, useState } from 'react';
import { SourceList } from '../../shared/components/SourceList';
import { BASES, bits, bytesBigEndian, changeWidth, flipBit, format, maxSigned, maxUnsigned, minSigned, parse, SOURCES, valueOf, weight, WIDTHS, type Base, type Width } from './logic';

interface Example {
  label: string;
  about: string;
  width: Width;
  signed: boolean;
  pattern: bigint;
}

const EXAMPLES: Example[] = [
  { label: '0x0800', about: 'EtherType of IPv4', width: 16, signed: false, pattern: 0x0800n },
  { label: '192.0.2.1', about: 'An IPv4 address is a 32-bit number', width: 32, signed: false, pattern: 0xc0000201n },
  { label: '255.255.255.192', about: 'Subnet mask /26', width: 32, signed: false, pattern: 0xffffffc0n },
  { label: '65535', about: 'Highest port number, 16 bits', width: 16, signed: false, pattern: 0xffffn },
  { label: '-1', about: 'All bits set, read as signed', width: 8, signed: true, pattern: 0xffn },
  { label: '-128', about: 'Smallest 8-bit signed number', width: 8, signed: true, pattern: 0x80n },
];

const hex2 = (n: number) => n.toString(16).padStart(2, '0');

export default function NumbersTool() {
  const [width, setWidth] = useState<Width>(16);
  const [signed, setSigned] = useState(false);
  const [pattern, setPattern] = useState<bigint>(0x0800n);
  const [draft, setDraft] = useState<{ base: Base; text: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const idBase = useId();

  const draftResult = draft ? parse(draft.text, draft.base, width, signed) : undefined;
  const value = valueOf(pattern, width, signed);
  const bitList = bits(pattern, width);
  const bytes = bytesBigEndian(pattern, width);

  const onField = (base: Base, text: string) => {
    setDraft({ base, text });
    setNotice(null);
    const r = parse(text, base, width, signed);
    if (r.ok) setPattern(r.pattern);
  };

  const onWidth = (w: Width) => {
    const r = changeWidth(pattern, width, w, signed);
    setPattern(r.pattern);
    setWidth(w);
    setDraft(null);
    setNotice(r.truncated ? `${value} does not fit into ${w} bits, so only the lowest ${w} bits are kept.` : null);
  };

  const onSigned = (s: boolean) => {
    setSigned(s);
    setDraft(null);
    setNotice(s !== signed && valueOf(pattern, width, s) !== value ? `Same bits, read ${s ? 'as two\'s complement' : 'as unsigned'}: the decimal value changes.` : null);
  };

  const setBits = bitList.map((b, i) => (b ? width - 1 - i : -1)).filter((i) => i >= 0);

  return (
    <div className="index tool numbers-tool">
      <h1>Number converter</h1>
      <p className="lead">Type in any field, the others follow. Click a bit to flip it. Choose the width and whether the bits are read as a signed number.</p>

      <div className="tool-input numbers-input">
        <fieldset className="field segmented">
          <legend>Width</legend>
          {WIDTHS.map((w) => (
            <label key={w}>
              <input type="radio" name="width" checked={width === w} onChange={() => onWidth(w)} />
              {w} bits
            </label>
          ))}
        </fieldset>
        <label className="check">
          <input type="checkbox" checked={signed} onChange={(e) => onSigned(e.target.checked)} />
          Signed (two's complement)
        </label>

        {BASES.map((b) => {
          const id = `${idBase}-${b.base}`;
          const editing = draft?.base === b.base;
          const error = editing && draftResult && !draftResult.ok ? draftResult.error : undefined;
          return (
            <div key={b.base} className={`field${b.base === 2 ? ' wide' : ''}`}>
              <label htmlFor={id}>
                {b.name}
                {b.prefix && <span className="muted"> ({b.prefix})</span>}
              </label>
              <input
                id={id}
                className="mono"
                value={editing ? draft.text : format(pattern, b.base, width, signed)}
                onChange={(e) => onField(b.base, e.target.value)}
                onBlur={() => !error && setDraft(null)}
                spellCheck={false}
                autoComplete="off"
                inputMode={b.base === 16 ? 'text' : 'numeric'}
                aria-invalid={!!error}
                aria-describedby={error ? `${id}-err` : undefined}
              />
              {error && (
                <span id={`${id}-err`} className="field-error" role="alert">
                  {error}
                </span>
              )}
            </div>
          );
        })}

        <p className="examples small">
          Examples:{' '}
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              className="link-button mono"
              title={ex.about}
              onClick={() => {
                setWidth(ex.width);
                setSigned(ex.signed);
                setPattern(ex.pattern);
                setDraft(null);
                setNotice(ex.about);
              }}
            >
              {ex.label}
            </button>
          ))}
        </p>
      </div>

      {notice && <p className="notice muted">{notice}</p>}

      <section aria-labelledby="h-bits">
        <h2 id="h-bits">Bits</h2>
        <div className="bit-buttons" role="group" aria-label={`${width} bits, most significant first`}>
          {Array.from({ length: width / 8 }, (_, octet) => (
            <div key={octet} className="bit-octet">
              {bitList.slice(octet * 8, octet * 8 + 8).map((b, i) => {
                const index = width - 1 - (octet * 8 + i);
                const w = weight(index, width, signed);
                return (
                  <button
                    key={index}
                    type="button"
                    className={`bit-button${b ? ' set' : ''}${signed && index === width - 1 ? ' sign' : ''}`}
                    aria-pressed={b === 1}
                    aria-label={`Bit ${index}, weight ${w}`}
                    title={`Bit ${index}, weight ${w}${signed && index === width - 1 ? ' (sign bit)' : ''}`}
                    onClick={() => {
                      setPattern(flipBit(pattern, index));
                      setDraft(null);
                      setNotice(null);
                    }}
                  >
                    <span className="bit-value">{b}</span>
                    <span className="bit-index">{index}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <p className="small muted">
          Small numbers are bit positions; bit 0 is the least significant.
          {signed && ' The highlighted sign bit has the negative weight -2^' + (width - 1) + '.'}
        </p>
        <p className="sum mono">
          {setBits.length === 0 ? '0' : setBits.map((i) => weight(i, width, signed).toString()).join(' + ').replace(/\+ -/g, '- ')} = {value.toString()}
        </p>
      </section>

      <section aria-labelledby="h-bytes">
        <h2 id="h-bytes">Bytes</h2>
        <table className="kv">
          <tbody>
            <tr>
              <th scope="row">Range of this width</th>
              <td className="mono">{signed ? `${minSigned(width)} to ${maxSigned(width)}` : `0 to ${maxUnsigned(width)}`}</td>
            </tr>
            {width > 8 && (
              <>
                <tr>
                  <th scope="row">Big endian (network byte order)</th>
                  <td className="mono">{bytes.map(hex2).join(' ')}</td>
                </tr>
                <tr>
                  <th scope="row">Little endian (x86, ARM memory)</th>
                  <td className="mono">{[...bytes].reverse().map(hex2).join(' ')}</td>
                </tr>
              </>
            )}
            {width === 32 && (
              <tr>
                <th scope="row">As IPv4 address</th>
                <td className="mono">{bytes.join('.')}</td>
              </tr>
            )}
            <tr>
              <th scope="row">As ASCII</th>
              <td className="mono">
                {bytes.map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('')} <span className="muted">(non-printable octets shown as .)</span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section aria-labelledby="h-how">
        <h2 id="h-how">How it works</h2>
        <div className="prose">
          <p>
            Every digit has a place value: a power of the base. In binary the places are 1, 2, 4, 8 and so on, so 1100 1000 is 128 + 64 + 8 = 200. One hex digit stands for exactly four bits (a nibble) and two hex digits for one octet, which is why packet headers and MAC addresses are written in hex. Octal groups three bits and survives mainly in Unix file permissions.
          </p>
          <p>
            A fixed width has a fixed range: 8 bits hold 256 patterns. <strong>Unsigned</strong>, they are 0 to 255. <strong>Signed</strong> numbers use two's complement: the top bit gets the negative weight -128, so 1111 1111 is -128 + 127 = -1. To negate a number, invert all bits and add 1. The same bits can therefore mean 255 or -1; only the interpretation differs. Adding past the end wraps around (overflow): 127 + 1 in 8 bits signed is -128.
          </p>
          <p>
            Values wider than one octet must be stored in some byte order. Protocol headers use <strong>big endian</strong>, the most significant octet first, called network byte order (RFC 791, appendix B). Most processors store numbers in memory as <strong>little endian</strong>, so software converts every port number and address field when it reads or writes a header.
          </p>
        </div>
      </section>

      <section aria-labelledby="h-sources">
        <h2 id="h-sources">Sources</h2>
        <SourceList sources={SOURCES} />
      </section>
    </div>
  );
}
