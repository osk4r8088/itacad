import { useEffect, useId, useMemo, useState } from 'react';
import wordListText from './eff_large_wordlist.txt?raw';
import { SourceList } from '../../shared/components/SourceList';
import { alphabet, ATTACKS, CHARSETS, entropyBits, formatDuration, generatePassphrase, generatePassword, parseWordList, secondsToExhaust, SOURCES, type CharsetId } from './generate';
import { DICTIONARY_NAMES, PATTERN_NAMES, SCORE_NAMES } from './names';

// zxcvbn and its dictionaries (about 900 kB compressed) load separately, so the generator is usable at once.
type AnalyzeModule = typeof import('./analyze');

const WORDS = parseWordList(wordListText);
const SEPARATORS = [
  { value: '-', label: 'Hyphen' },
  { value: ' ', label: 'Space' },
  { value: '.', label: 'Dot' },
  { value: '_', label: 'Underscore' },
  { value: '', label: 'None' },
];

type Mode = 'passphrase' | 'password';

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => setState('done'),
          () => setState('failed'),
        )
      }
    >
      {state === 'done' ? 'Copied' : state === 'failed' ? 'Copy failed, select the text' : 'Copy'}
    </button>
  );
}

function AttackTimes({ bits }: { bits: number }) {
  return (
    <table className="kv small">
      <tbody>
        {ATTACKS.map((a) => (
          <tr key={a.id}>
            <th scope="row" title={a.about}>
              {a.label}
            </th>
            <td>{formatDuration(secondsToExhaust(bits, a.rate))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Generator({ onCheck }: { onCheck: (secret: string) => void }) {
  const [mode, setMode] = useState<Mode>('passphrase');
  const [words, setWords] = useState(6);
  const [separator, setSeparator] = useState('-');
  const [length, setLength] = useState(20);
  const [sets, setSets] = useState<CharsetId[]>(['lower', 'upper', 'digits', 'symbols']);
  const [avoidLookalikes, setAvoidLookalikes] = useState(false);
  const [round, setRound] = useState(0);
  const ids = { words: useId(), sep: useId(), length: useId() };

  const result = useMemo(() => {
    if (mode === 'passphrase') {
      const r = generatePassphrase(WORDS, { words, separator });
      return { secret: r.phrase, picks: r.picks, bits: entropyBits(words, WORDS.length), choices: WORDS.length, count: words };
    }
    const chars = alphabet({ length, sets, avoidLookalikes });
    if (!chars.length) return undefined;
    return { secret: generatePassword({ length, sets, avoidLookalikes }), picks: [], bits: entropyBits(length, chars.length), choices: chars.length, count: length };
    // round is a dependency so "Generate again" draws a new secret
  }, [mode, words, separator, length, sets, avoidLookalikes, round]);

  const toggleSet = (id: CharsetId) => setSets(sets.includes(id) ? sets.filter((s) => s !== id) : [...sets, id]);

  return (
    <section className="pw-panel" aria-labelledby="h-gen">
      <h2 id="h-gen">Generate</h2>
      <fieldset className="field segmented">
        <legend>Type</legend>
        <label>
          <input type="radio" name="mode" checked={mode === 'passphrase'} onChange={() => setMode('passphrase')} />
          Passphrase
        </label>
        <label>
          <input type="radio" name="mode" checked={mode === 'password'} onChange={() => setMode('password')} />
          Password
        </label>
      </fieldset>

      {mode === 'passphrase' ? (
        <div className="pw-options">
          <div className="field">
            <label htmlFor={ids.words}>Words: {words}</label>
            <input id={ids.words} type="range" min={3} max={10} value={words} onChange={(e) => setWords(Number(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor={ids.sep}>Separator</label>
            <select id={ids.sep} value={separator} onChange={(e) => setSeparator(e.target.value)}>
              {SEPARATORS.map((s) => (
                <option key={s.label} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="pw-options">
          <div className="field">
            <label htmlFor={ids.length}>Length: {length}</label>
            <input id={ids.length} type="range" min={8} max={64} value={length} onChange={(e) => setLength(Number(e.target.value))} />
          </div>
          <fieldset className="field checks-list">
            <legend>Characters</legend>
            {(Object.keys(CHARSETS) as CharsetId[]).map((id) => (
              <label key={id}>
                <input type="checkbox" checked={sets.includes(id)} onChange={() => toggleSet(id)} />
                {CHARSETS[id].label}
              </label>
            ))}
            <label>
              <input type="checkbox" checked={avoidLookalikes} onChange={(e) => setAvoidLookalikes(e.target.checked)} />
              Avoid look-alikes (I l 1 | O 0 o, quotes)
            </label>
          </fieldset>
        </div>
      )}

      {result ? (
        <>
          <output className="pw-secret mono" aria-live="polite">
            {result.secret}
          </output>
          <div className="pw-actions">
            <button type="button" onClick={() => setRound(round + 1)}>
              Generate again
            </button>
            <CopyButton text={result.secret} />
            <button type="button" onClick={() => onCheck(result.secret)}>
              Check it below
            </button>
          </div>
          <p className="small">
            <strong>{result.bits.toFixed(1)} bits of entropy:</strong> {result.count} {mode === 'passphrase' ? 'words' : 'characters'}, each one of {result.choices.toLocaleString('en-US')} equally likely choices ({Math.log2(result.choices).toFixed(2)} bits each). {result.secret.length} characters long.
          </p>
          {mode === 'passphrase' && (
            <p className="small muted">
              Dice rolls for these words: {result.picks.map((p) => `${p.roll} ${p.word}`).join(', ')}. With five real dice per word you can create a passphrase without trusting any computer.
            </p>
          )}
          <h3>Time to try every possibility</h3>
          <AttackTimes bits={result.bits} />
        </>
      ) : (
        <p className="notice">Choose at least one character set.</p>
      )}
    </section>
  );
}

/** Rough "naive" entropy: length times log2 of the character classes used. Shown to contrast with zxcvbn. */
function naiveBits(pw: string): number {
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[ -/:-@[-`{-~]/.test(pw)) pool += 33;
  if (/[^\x20-\x7e]/.test(pw)) pool += 100;
  return entropyBits([...pw].length, pool);
}

function Analyzer({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  const [mod, setMod] = useState<AnalyzeModule | 'failed'>();
  const id = useId();
  useEffect(() => {
    import('./analyze').then(setMod, () => setMod('failed'));
  }, []);
  const result = useMemo(() => (value && mod && mod !== 'failed' ? mod.analyze(value) : undefined), [value, mod]);
  const length = [...value].length;

  return (
    <section className="pw-panel" aria-labelledby="h-check">
      <h2 id="h-check">Check a password</h2>
      <div className="field">
        <label htmlFor={id}>Password</label>
        <div className="pw-input">
          <input id={id} className="mono" type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" spellCheck={false} />
          <button type="button" onClick={() => setShow(!show)} aria-pressed={show}>
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
        <span className="small muted">Checked in your browser. Nothing is sent or stored. Still, do not type passwords you actually use.</span>
      </div>

      {!mod && <p className="small muted">Loading the password dictionaries (about 900 kB)...</p>}
      {mod === 'failed' && <p className="notice">The password dictionaries could not be loaded. Reload the page to try again.</p>}

      {result && (
        <div aria-live="polite">
          <div className={`pw-score score-${result.score}`}>
            <div className="pw-bar" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className={i <= result.score ? 'on' : ''} />
              ))}
            </div>
            <strong>{SCORE_NAMES[result.score]}</strong>
            <span className="small muted">
              {' '}
              score {result.score} of 4, about 10<sup>{result.guessesLog10.toFixed(1)}</sup> guesses
            </span>
          </div>

          {result.feedback.warning && <p className="pw-warning">{result.feedback.warning}</p>}
          {result.feedback.suggestions.length > 0 && (
            <ul className="small">
              {result.feedback.suggestions.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}

          <h3>What an attacker sees</h3>
          <ol className="pw-parts">
            {result.sequence.map((m, i) => (
              <li key={i} className={`pattern-${m.pattern}`}>
                <span className="mono token">{m.token}</span>
                <span className="small">
                  {PATTERN_NAMES[m.pattern] ?? m.pattern}
                  {m.pattern === 'dictionary' && (
                    <span className="muted">
                      {' '}
                      ({m.l33t ? 'with substitutions, ' : ''}
                      {m.reversed ? 'reversed, ' : ''}"{m.matchedWord}", rank {Number(m.rank).toLocaleString('en-US')} in {DICTIONARY_NAMES[String(m.dictionaryName)] ?? String(m.dictionaryName)})
                    </span>
                  )}
                  {m.pattern === 'spatial' && <span className="muted"> ({m.graph} layout)</span>}
                  {m.pattern === 'repeat' && <span className="muted"> ("{String(m.baseToken)}" {m.repeatCount} times)</span>}
                  {m.pattern === 'date' && <span className="muted"> ({m.year})</span>}
                </span>
              </li>
            ))}
          </ol>

          <h3>Estimated time to crack</h3>
          <table className="kv small">
            <tbody>
              {ATTACKS.map((a, i) => {
                const key = (['onlineThrottlingXPerHour', 'onlineNoThrottlingXPerSecond', 'offlineSlowHashingXPerSecond', 'offlineFastHashingXPerSecond'] as const)[i];
                return (
                  <tr key={a.id}>
                    <th scope="row" title={a.about}>
                      {a.label}
                    </th>
                    <td>{formatDuration(result.crackTimes[key].seconds)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p className="small">
            <strong>Length:</strong> {length} characters. NIST requires at least 15 for a password that is the only factor, and 8 when a second factor is required.
          </p>
          <p className="small">
            <strong>Naive formula vs. patterns:</strong> length times character classes gives {naiveBits(value).toFixed(0)} bits; the pattern-aware estimate is {(result.guessesLog10 * Math.log2(10)).toFixed(0)} bits. The gap is what predictable choices cost.
          </p>
        </div>
      )}
    </section>
  );
}

/** Password generator and strength analyzer. */
export default function PasswordsTool() {
  const [check, setCheck] = useState('P@ssw0rd2024!');
  return (
    <div className="index tool passwords-tool">
      <h1>Passwords</h1>
      <p className="lead">Generate random passphrases and passwords, and see how an attacker would guess a password: not character by character, but by trying likely words and patterns first.</p>

      <div className="pw-layout">
        <Generator onCheck={setCheck} />
        <Analyzer value={check} onChange={setCheck} />
      </div>

      <section aria-labelledby="h-how">
        <h2 id="h-how">How strength works</h2>
        <div className="prose">
          <p>
            <strong>Entropy</strong> measures how many equally likely possibilities there are, in bits: each bit doubles them. It is only meaningful when every choice is truly random, as with the generator above. A six-word passphrase from the EFF list has 6 x log2(7776), about 77.5 bits; a random 16-character password from all 94 printable characters has about 105 bits.
          </p>
          <p>
            Human-chosen passwords are not random. Attackers try leaked passwords, words, names, dates and keyboard patterns first, with common substitutions like @ for a and 0 for o. That is why "P@ssw0rd2024!" looks complex but falls quickly. The analyzer uses zxcvbn, which estimates the number of guesses for such a pattern-based attack. An estimator only sees the result, not how it was made: for a generated passphrase it may report more bits than the generator actually used. When a secret is generated, the generator's entropy is the exact number.
          </p>
          <p>
            The time to crack depends on where the attacker guesses. Against a login form with rate limiting, even weak passwords hold for a while. Against a stolen database the attacker guesses offline; how fast depends on the hash: a slow password hash (bcrypt, scrypt, Argon2) allows thousands of guesses per second, a fast hash billions.
          </p>
          <p>
            NIST SP 800-63B-4 reflects this: length instead of composition rules (verifiers must not require mixtures of character types), at least 15 characters for a password that is the only factor, room for at least 64 characters so passphrases fit, checks against lists of common and compromised passwords, and no forced periodic changes. Best of all: a password manager with a unique random password per site, and a second factor.
          </p>
        </div>
      </section>

      <section aria-labelledby="h-sources">
        <h2 id="h-sources">Sources</h2>
        <SourceList sources={SOURCES} />
        <p className="small muted">The passphrase word list is the EFF Large Wordlist for Passphrases by the Electronic Frontier Foundation, licensed under CC BY 3.0 US.</p>
      </section>
    </div>
  );
}
