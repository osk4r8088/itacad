import { useId, useState } from 'react';
import { SourceList } from '../../shared/components/SourceList';
import { writePenalty, arrayState, dataDisks, gfMul, gfPow2, LEVEL_INFO, LEVELS, recover, rebuildRead, stripeValues, SOURCES, tolerance, ureProbability, validDisks, type Block, type Level } from './logic';

const SIZES_TB = [1, 2, 4, 8, 12, 16, 20, 24];
const URE_RATES = [
  { bits: 1e14, label: '1 per 10^14 bits (typical desktop disk)' },
  { bits: 1e15, label: '1 per 10^15 bits (typical NAS or enterprise disk)' },
];

const bits8 = (v: number) => v.toString(2).padStart(8, '0');
const hex2 = (v: number) => v.toString(16).padStart(2, '0');
const label = (b: Block) => (b.kind === 'p' ? 'P' : b.kind === 'q' ? 'Q' : `D${b.index}`);
const pct = (x: number) => (x < 0.0005 ? '< 0.1 %' : `${(x * 100).toFixed(x < 0.1 ? 1 : 0)} %`);

function nearestValid(level: Level, n: number): number {
  let m = Math.max(n, LEVEL_INFO[level].minDisks);
  if (LEVEL_INFO[level].evenOnly && m % 2) m += 1;
  return Math.min(m, 8);
}

/** Bit-level view of one stripe: how parity is formed and how missing blocks come back. */
function StripeMath({ level, n, s, failed }: { level: Level; n: number; s: number; failed: Set<number> }) {
  const { blocks, values } = stripeValues(level, n, s);
  const rec = recover(level, n, s, failed);
  const order = blocks
    .map((b, d) => ({ b, d }))
    .sort((x, y) => {
      const rank = (b: Block) => (b.kind === 'data' ? b.index : b.kind === 'p' ? 1e9 : 1e9 + 1);
      return rank(x.b) - rank(y.b);
    });
  const dataInStripe = order.filter((x) => x.b.kind === 'data');
  return (
    <div className="raid-math">
      <table className="raid-bits">
        <thead>
          <tr>
            <th scope="col">Block</th>
            <th scope="col">Disk</th>
            <th scope="col">Bits</th>
            <th scope="col">Hex</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {order.map(({ b, d }) => {
            const r = rec[d];
            const isParity = b.kind !== 'data';
            return (
              <tr key={d} className={`${isParity ? 'parity' : ''}${failed.has(d) ? (r.ok ? ' rebuilt' : ' lost') : ''}`}>
                <th scope="row">{label(b)}</th>
                <td>{d}</td>
                <td className="mono">{r.ok ? bits8(r.value) : '????????'}</td>
                <td className="mono">{r.ok ? hex2(r.value) : '??'}</td>
                <td className="small">{failed.has(d) ? (r.ok ? `rebuilt: ${r.how}` : `lost: ${r.how}`) : 'read'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {(level === '5' || level === '6') && (
        <div className="prose small">
          <p>
            <strong>P</strong> is the XOR of the data blocks: each bit is 1 if an odd number of data blocks have a 1 there. XOR is its own inverse, so any one missing block is the XOR of all the others, including P.
          </p>
          {level === '6' && (
            <p>
              <strong>Q</strong> weights every data block with a different power of 2 in the Galois field GF(2^8) before combining them: Q ={' '}
              {dataInStripe.map(({ d }, i) => (
                <span key={d} className="mono">
                  {i ? ' xor ' : ''}
                  {gfPow2(i)}*{hex2(values[d])}
                </span>
              ))}{' '}
              = <span className="mono">{dataInStripe.map(({ d }, i) => hex2(gfMul(gfPow2(i), values[d]))).join(' xor ')}</span> = <span className="mono">{hex2(values[blocks.findIndex((x) => x.kind === 'q')])}</span>. Because the weights differ, P and Q give two independent equations, enough to solve for two missing blocks.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** RAID visualizer: layouts of RAID 0, 1, 5, 6 and 10, disk failures and rebuilds. */
export default function RaidTool() {
  const [level, setLevel] = useState<Level>('5');
  const [n, setN] = useState(4);
  const [sizeTb, setSizeTb] = useState(8);
  const [ure, setUre] = useState(URE_RATES[0].bits);
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const [stripeSel, setStripeSel] = useState(0);
  const ids = { n: useId(), size: useId(), ure: useId() };

  const info = LEVEL_INFO[level];
  const k = dataDisks(level, n);
  const tol = tolerance(level, n);
  const state = arrayState(level, n, failed);
  const rebuild = rebuildRead(level, n, sizeTb * 1e12);
  const stripes = Array.from({ length: Math.max(n, 4) }, (_, s) => s);

  const choose = (l: Level) => {
    setLevel(l);
    setN(nearestValid(l, n));
    setFailed(new Set());
  };
  const toggle = (d: number) => {
    const next = new Set(failed);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    setFailed(next);
  };

  return (
    <div className="index tool raid-tool">
      <h1>RAID</h1>
      <p className="lead">How RAID levels spread data and parity over disks, how much capacity they cost, and what happens when disks fail. Click a disk to fail it, click a stripe to see the bits.</p>

      <div className="tool-input raid-input">
        <fieldset className="field segmented wide">
          <legend>Level</legend>
          {LEVELS.map((l) => (
            <label key={l}>
              <input type="radio" name="level" checked={level === l} onChange={() => choose(l)} />
              RAID {l}
            </label>
          ))}
        </fieldset>
        <div className="field">
          <label htmlFor={ids.n}>
            Disks: {n}
            {info.evenOnly && <span className="muted"> (pairs)</span>}
          </label>
          <input
            id={ids.n}
            type="range"
            min={info.minDisks}
            max={8}
            step={info.evenOnly ? 2 : 1}
            value={n}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (validDisks(level, v)) {
                setN(v);
                setFailed(new Set());
                setStripeSel(0);
              }
            }}
          />
        </div>
        <div className="field">
          <label htmlFor={ids.size}>Disk size</label>
          <select id={ids.size} value={sizeTb} onChange={(e) => setSizeTb(Number(e.target.value))}>
            {SIZES_TB.map((s) => (
              <option key={s} value={s}>
                {s} TB
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="raid-about">
        <strong>{info.name}.</strong> {info.about}
      </p>

      <dl className="raid-facts">
        <div>
          <dt>Usable capacity</dt>
          <dd>
            {k * sizeTb} TB <span className="muted small">of {n * sizeTb} TB</span>
          </dd>
        </div>
        <div>
          <dt>Efficiency</dt>
          <dd>{Math.round((k / n) * 100)} %</dd>
        </div>
        <div>
          <dt>Survives</dt>
          <dd>
            {tol.guaranteed === tol.best ? `${tol.guaranteed} failed disk${tol.guaranteed === 1 ? '' : 's'}` : `1 to ${tol.best} failed disks, one per pair`}
          </dd>
        </div>
        <div>
          <dt>Small random write</dt>
          <dd>
            {writePenalty(level, n)} disk I/O{writePenalty(level, n) === 1 ? '' : 's'}
          </dd>
        </div>
        <div>
          <dt>Array state</dt>
          <dd className={`state-${state}`}>{state === 'optimal' ? 'Optimal' : state === 'degraded' ? `Degraded, ${failed.size} disk${failed.size > 1 ? 's' : ''} failed` : 'Failed, data lost'}</dd>
        </div>
      </dl>

      <section aria-labelledby="h-layout">
        <h2 id="h-layout">Layout</h2>
        <div className="raid-grid-wrap">
          <table className="raid-grid">
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">Stripe</span>
                </th>
                {Array.from({ length: n }, (_, d) => (
                  <th key={d} scope="col">
                    <button type="button" className={`disk${failed.has(d) ? ' failed' : ''}`} aria-pressed={failed.has(d)} onClick={() => toggle(d)} title={failed.has(d) ? 'Replace this disk' : 'Fail this disk'}>
                      Disk {d}
                      <span className="small">{failed.has(d) ? 'failed' : 'ok'}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stripes.map((s) => {
                const { blocks } = stripeValues(level, n, s);
                const rec = recover(level, n, s, failed);
                return (
                  <tr key={s} className={s === stripeSel ? 'selected' : ''}>
                    <th scope="row">
                      <button type="button" className="link-button" onClick={() => setStripeSel(s)} aria-pressed={s === stripeSel}>
                        Stripe {s}
                      </button>
                    </th>
                    {blocks.map((b, d) => {
                      const r = rec[d];
                      const cls = `block kind-${b.kind}${failed.has(d) ? (r.ok ? ' rebuilt' : ' lost') : ''}`;
                      return (
                        <td key={d} className={cls} onClick={() => setStripeSel(s)}>
                          <strong>{label(b)}</strong>
                          <span className="mono small">{r.ok ? hex2(r.value) : '??'}</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="legend small muted">
          <span className="key-block kind-data" /> data <span className="key-block kind-p" /> parity <span className="key-block rebuilt" /> rebuilt from the other disks <span className="key-block lost" /> lost. Each block holds one byte here; real arrays use chunks of 64 to 512 KiB.
          {(level === '5' || level === '6') && ' Parity rotates as in Linux md (left-symmetric), so no disk is a parity bottleneck.'}
        </p>
      </section>

      <section aria-labelledby="h-stripe">
        <h2 id="h-stripe">Stripe {stripeSel} in bits</h2>
        <StripeMath level={level} n={n} s={stripeSel} failed={failed} />
      </section>

      <section aria-labelledby="h-rebuild">
        <h2 id="h-rebuild">Rebuild risk</h2>
        {rebuild ? (
          <>
            <div className="field raid-ure">
              <label htmlFor={ids.ure}>Unrecoverable read error rate (datasheet)</label>
              <select id={ids.ure} value={ure} onChange={(e) => setUre(Number(e.target.value))}>
                {URE_RATES.map((u) => (
                  <option key={u.bits} value={u.bits}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
            <p>
              After one disk fails, rebuilding a replacement reads <strong>{(rebuild.bytes / 1e12).toLocaleString('en-US')} TB</strong>
              {level === '5' || level === '6' ? ` (all ${n - 1} remaining disks)` : ' (the mirror copy)'}. With the datasheet rate, the chance of at least one unreadable sector on the way is about{' '}
              <strong>{pct(ureProbability(rebuild.bytes, ure))}</strong>.{' '}
              {rebuild.correctable
                ? level === '6'
                  ? 'RAID 6 still has a second parity during the rebuild, so such an error is corrected.'
                  : 'Another copy remains, so such an error is corrected.'
                : 'Without remaining redundancy, that sector is lost, and some controllers abort the whole rebuild.'}
            </p>
            <p className="small muted">
              The rate is a worst-case specification; real disks usually do better. The formula is 1 - e^(-bits read / rate). Rebuilding also takes time: at 150 MB/s, one {sizeTb} TB disk takes about {Math.round((sizeTb * 1e12) / 150e6 / 3600)} hours, during which the array is
              unprotected or less protected.
            </p>
          </>
        ) : (
          <p>RAID 0 has nothing to rebuild from: a failed disk means restoring from backup.</p>
        )}
      </section>

      <section aria-labelledby="h-how">
        <h2 id="h-how">How to choose</h2>
        <div className="prose">
          <p>
            <strong>RAID 1</strong> and <strong>RAID 10</strong> are simple and fast for small random writes (one I/O per copy, so 2 with two copies), and rebuild by copying one disk. They cost half of the raw capacity. <strong>RAID 5</strong> loses only one disk of capacity, but every small write costs 4 I/Os (read data and parity, write both), and a rebuild reads all other disks without a safety margin, which makes it risky with today's large disks. <strong>RAID 6</strong> keeps a second parity for exactly that situation, at 6 I/Os per small write. <strong>RAID 0</strong> is for scratch data only.
          </p>
          <p>
            <strong>RAID is not a backup.</strong> It protects against a failed disk, not against deleting a file, ransomware, a broken controller writing garbage to all disks, fire or theft. All copies in a RAID change at the same moment. A backup is a separate copy, ideally following the 3-2-1 rule: three copies, on two kinds of media, one off site.
          </p>
          <p>
            The levels go back to the 1988 paper by Patterson, Gibson and Katz, which defined RAID 1 to 5. RAID 0 (no redundancy) and RAID 6 were named later; RAID 2 (bit striping with a Hamming code), RAID 3 (byte striping with a parity disk) and RAID 4 (block striping with a parity disk) are no longer used, because rotating the parity (RAID 5) removes the parity disk as a bottleneck.
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
