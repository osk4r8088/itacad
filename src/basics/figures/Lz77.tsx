import { useMemo, useState } from 'react';
import { EXAMPLES, MAX_MATCH, MIN_MATCH, WINDOWS, encode, summarize } from './lz77';

const MAX_LENGTH = 300;

/** A short text in which repeated strings turn into back references. */
export default function Lz77() {
  const [text, setText] = useState(EXAMPLES[0].text);
  const [window, setWindow] = useState(4096);
  const [picked, setPicked] = useState<number | undefined>(undefined);
  const tokens = useMemo(() => encode(text, window), [text, window]);
  const sum = summarize(text, tokens);
  const chars = [...text];
  const sel = picked === undefined ? undefined : tokens[picked];
  const ref = sel?.kind === 'ref' ? sel : undefined;
  const isSource = (i: number) => !!ref && i >= ref.at - ref.distance && i < ref.at - ref.distance + ref.length;
  const isTarget = (i: number) => !!ref && i >= ref.at && i < ref.at + ref.length;

  return (
    <div className="lz-figure">
      <label className="lz-input">
        <span>Text</span>
        <textarea
          value={text}
          maxLength={MAX_LENGTH}
          rows={4}
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value);
            setPicked(undefined);
          }}
        />
      </label>
      <div className="vm-presets" role="group" aria-label="Examples">
        {EXAMPLES.map((e) => (
          <button
            key={e.label}
            type="button"
            className="link-button"
            onClick={() => {
              setText(e.text);
              setPicked(undefined);
            }}
          >
            {e.label}
          </button>
        ))}
      </div>
      <div className="vm-choice" role="group" aria-label="How far back the compressor looks">
        <span>Window</span>
        {WINDOWS.map((w) => (
          <button
            key={w}
            type="button"
            className="chip"
            aria-pressed={window === w}
            onClick={() => {
              setWindow(w);
              setPicked(undefined);
            }}
          >
            {w} characters
          </button>
        ))}
      </div>

      <div>
        <p className="lz-heading">Compressed: characters as they are, and references</p>
        <p className="lz-tokens">
          {tokens.map((t, k) =>
            t.kind === 'literal' ? (
              <span key={k} className="lz-lit">
                {t.char === '\n' ? '↵' : t.char}
              </span>
            ) : (
              <button key={k} type="button" className="lz-ref" aria-pressed={picked === k} onClick={() => setPicked(picked === k ? undefined : k)}>
                copy {t.length} from {t.distance} back
              </button>
            ),
          )}
        </p>
      </div>

      <div>
        <p className="lz-heading">Original{ref ? ': the selected reference copies the marked source to the marked place' : ''}</p>
        <p className="lz-original">
          {chars.map((c, i) => (
            <span key={i} className={isSource(i) ? 'is-source' : isTarget(i) ? 'is-target' : undefined}>
              {c}
            </span>
          ))}
        </p>
      </div>

      <p className="lz-stats" aria-live="polite">
        {sum.characters} characters: {sum.literals} written as they are, and {sum.refs} {sum.refs === 1 ? 'reference' : 'references'} that stand for the other {sum.covered}.
        {ref && (
          <>
            {' '}
            The selected reference repeats “{chars.slice(ref.at, ref.at + ref.length).join('').replace(/\n/g, '↵')}”{ref.distance < ref.length ? ', and it overlaps itself: the copy reads characters it has only just written' : ''}.
          </>
        )}
      </p>
      <p className="vm-note">
        Simplified for the picture: references are only used from {MIN_MATCH} characters up, at most {MAX_MATCH}, as in DEFLATE, but the search here is a plain greedy one and the result is not Huffman-coded afterwards. DEFLATE looks 32 KiB back; the small windows show what a short memory misses.
      </p>
    </div>
  );
}
