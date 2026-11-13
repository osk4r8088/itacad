import { useState } from 'react';
import { encodeText, hex, isSurrogate } from './utf8';

const START = 'Aé€\u{10348}';

/** Type a text and see each code point with its UTF-8 bytes, fixed bits and payload bits apart. */
export default function Utf8Encoder() {
  const [text, setText] = useState(START);
  const encoded = encodeText(text);
  const total = encoded.reduce((sum, e) => sum + e.bytes.length, 0);

  return (
    <div className="utf8-figure">
      <label className="utf8-input">
        <span>Text</span>
        <input type="text" value={text} maxLength={16} spellCheck={false} autoComplete="off" onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="utf8-scroll">
        <table className="utf8-table">
          <thead>
            <tr>
              <th scope="col">Character</th>
              <th scope="col">Code point</th>
              <th scope="col">Bits (fixed, from the code point)</th>
              <th scope="col">Bytes</th>
            </tr>
          </thead>
          <tbody>
            {encoded.map((e, i) => (
              <tr key={i}>
                <td className="utf8-char">{e.char.trim() === '' ? (e.codePoint === 0x20 ? 'space' : '') : e.char}</td>
                <td>
                  <code>{e.label}</code>
                </td>
                <td>
                  {isSurrogate(e.codePoint) ? (
                    <span className="utf8-none">half of a UTF-16 surrogate pair, no UTF-8 form</span>
                  ) : (
                    <code className="utf8-bits">
                      {e.bits.map((b, j) => (
                        <span key={j} className="utf8-byte">
                          <span className="utf8-prefix">{b.prefix}</span>
                          <span className="utf8-payload">{b.payload}</span>
                        </span>
                      ))}
                    </code>
                  )}
                </td>
                <td>
                  <code>{e.bytes.map(hex).join(' ')}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="utf8-total" aria-live="polite">
        {encoded.length} code {encoded.length === 1 ? 'point' : 'points'}, {total} {total === 1 ? 'byte' : 'bytes'} in UTF-8.
      </p>
    </div>
  );
}
