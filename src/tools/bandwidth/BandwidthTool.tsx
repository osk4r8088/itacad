import { useId, useState, type ReactNode } from 'react';
import { SourceList } from '../../shared/components/SourceList';
import { href } from '../../app/router';
import { RATES, SOURCES, UNITS, bdp, convert, duration, num, scaleFor, transfer, unitById, windowLimit, type Framing } from './logic';

const rate = (bps: number) => (bps >= 1e9 ? `${num(bps / 1e9)} Gbit/s` : bps >= 1e6 ? `${num(bps / 1e6)} Mbit/s` : `${num(bps / 1e3)} kbit/s`);
const bytes = (b: number) => (b >= 1024 ** 3 ? `${num(b / 1024 ** 3)} GiB` : b >= 1024 ** 2 ? `${num(b / 1024 ** 2)} MiB` : b >= 1024 ? `${num(b / 1024)} KiB` : `${num(b)} B`);

function NumberField({ label, value, onChange, step = 'any', children }: { label: string; value: number; onChange: (v: number) => void; step?: string; children?: ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="bw-pair">
        <input id={id} type="number" min={0} step={step} inputMode="decimal" value={Number.isNaN(value) ? '' : value} onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))} aria-invalid={!(value > 0)} />
        {children}
      </div>
    </div>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="field check">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

function Units() {
  const [value, setValue] = useState(1);
  const [from, setFrom] = useState('TB');
  const rows = value > 0 ? convert(value, from) : [];
  const group = (kind: string) => rows.filter((r) => r.kind === kind);
  return (
    <section aria-labelledby="h-units">
      <h2 id="h-units">Bits, bytes and prefixes</h2>
      <div className="tool-input">
        <NumberField label="Amount" value={value} onChange={setValue}>
          <Select label="Unit" value={from} options={UNITS.map((u) => u.id)} onChange={setFrom} />
        </NumberField>
      </div>
      {rows.length > 0 && (
        <div className="bw-units">
          {[
            ['Bits', 'bit'],
            ['Bytes, decimal (SI)', 'decimal'],
            ['Bytes, binary (IEC)', 'binary'],
          ].map(([title, kind]) => (
            <table key={kind} className="kv">
              <caption>{title}</caption>
              <tbody>
                {group(kind).map((r) => (
                  <tr key={r.id} className={r.id === from ? 'is-input' : ''}>
                    <th scope="row">{r.id}</th>
                    <td className="mono">{num(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      )}
      <p className="small muted">
        A byte is 8 bits. Decimal prefixes count in powers of 1000 (1 kB = 1000 B), binary prefixes in powers of 1024 (1 KiB = 1024 B). Disk makers use decimal, many operating systems show binary but write "GB": that is why a 1 TB disk appears as about 931 "GB". Link speeds are always decimal and in bits: 1 Gbit/s is 10<sup>9</sup> bits per second.
      </p>
    </section>
  );
}

function Transfer() {
  const [size, setSize] = useState(4);
  const [sizeUnit, setSizeUnit] = useState('GiB');
  const [speed, setSpeed] = useState(100);
  const [speedUnit, setSpeedUnit] = useState('Mbit/s');
  const [mtu, setMtu] = useState(1500);
  const [ipv6, setIpv6] = useState(false);
  const [timestamps, setTimestamps] = useState(true);
  const [vlan, setVlan] = useState(false);
  const bps = speed * RATES.find((r) => r.id === speedUnit)!.bps;
  const fileBytes = (size * unitById(sizeUnit).bits) / 8;
  const framing: Framing = { mtu, ipv6, timestamps, vlan };
  const valid = size > 0 && speed > 0 && mtu >= 1280 && mtu <= 9216;
  const t = valid ? transfer(fileBytes, bps, framing) : undefined;
  return (
    <section aria-labelledby="h-transfer">
      <h2 id="h-transfer">Transfer time</h2>
      <div className="tool-input">
        <NumberField label="File size" value={size} onChange={setSize}>
          <Select label="Size unit" value={sizeUnit} options={UNITS.filter((u) => u.kind !== 'bit').map((u) => u.id)} onChange={setSizeUnit} />
        </NumberField>
        <NumberField label="Link speed" value={speed} onChange={setSpeed}>
          <Select label="Speed unit" value={speedUnit} options={RATES.map((r) => r.id)} onChange={setSpeedUnit} />
        </NumberField>
        <NumberField label="MTU (1280 to 9216)" value={mtu} onChange={setMtu} step="1" />
        <div className="bw-checks">
          <Check label="IPv6 (40-octet header)" checked={ipv6} onChange={setIpv6} />
          <Check label="TCP timestamps (12 octets)" checked={timestamps} onChange={setTimestamps} />
          <Check label="VLAN tag (4 octets)" checked={vlan} onChange={setVlan} />
        </div>
      </div>
      {!valid && <p className="notice">Enter a size and speed above zero and an MTU between 1280 (the IPv6 minimum) and 9216 (common jumbo frames).</p>}
      {t && (
        <>
          <table className="kv">
            <tbody>
              <tr>
                <th scope="row">Time at the raw link speed</th>
                <td>
                  {duration(t.raw)} <span className="muted">(size in bits divided by the speed)</span>
                </td>
              </tr>
              <tr>
                <th scope="row">With protocol overhead</th>
                <td>
                  <strong>{duration(t.withOverhead)}</strong> <span className="muted">at a goodput of {rate(t.goodput)}</span>
                </td>
              </tr>
              <tr>
                <th scope="row">Full-sized segments</th>
                <td>
                  {t.segments.toLocaleString('en-US')} <span className="muted">of {t.seg.payload} octets of data each</span>
                </td>
              </tr>
            </tbody>
          </table>
          <div className="bw-frame" aria-label={`One segment on the wire: ${t.seg.wire} octets, of which ${t.seg.payload} are data`}>
            {[
              ['Preamble, SFD, gap', t.seg.phy, 'kind-phy'],
              ['Ethernet', t.seg.ethernet, 'kind-link'],
              [ipv6 ? 'IPv6' : 'IPv4', t.seg.ip, 'kind-internet'],
              ['TCP', t.seg.tcp, 'kind-transport'],
              ['Data', t.seg.payload, 'kind-application'],
            ].map(([label, n, cls]) => (
              <span key={label as string} className={`bw-part ${cls}`} style={{ flexGrow: n as number }} title={`${label}: ${n} octets`}>
                {label} {n}
              </span>
            ))}
          </div>
          <p className="small muted">
            One full segment on the wire: {t.seg.wire} octets for {t.seg.payload} octets of data, {(t.seg.efficiency * 100).toFixed(1)} %. Not counted: the handshake, slow start at the beginning, acknowledgments in the other direction, retransmissions and the overhead of TLS. Real transfers are therefore a little slower still.
          </p>
        </>
      )}
    </section>
  );
}

function Window() {
  const [speed, setSpeed] = useState(1);
  const [speedUnit, setSpeedUnit] = useState('Gbit/s');
  const [rtt, setRtt] = useState(20);
  const [win, setWin] = useState(65535);
  const bps = speed * RATES.find((r) => r.id === speedUnit)!.bps;
  const valid = speed > 0 && rtt > 0 && win > 0;
  const product = bdp(bps, rtt / 1000);
  const shift = scaleFor(product);
  const limit = windowLimit(win, rtt / 1000);
  return (
    <section aria-labelledby="h-window">
      <h2 id="h-window">Window and round-trip time</h2>
      <div className="tool-input">
        <NumberField label="Link speed" value={speed} onChange={setSpeed}>
          <Select label="Speed unit" value={speedUnit} options={RATES.map((r) => r.id)} onChange={setSpeedUnit} />
        </NumberField>
        <NumberField label="Round-trip time (ms)" value={rtt} onChange={setRtt} />
        <NumberField label="TCP window (octets)" value={win} onChange={setWin} step="1" />
      </div>
      {!valid && <p className="notice">Enter values above zero.</p>}
      {valid && (
        <table className="kv">
          <tbody>
            <tr>
              <th scope="row">Bandwidth-delay product</th>
              <td>
                <strong>{bytes(product)}</strong> <span className="muted">({Math.round(product).toLocaleString('en-US')} octets in flight to keep the link busy)</span>
              </td>
            </tr>
            <tr>
              <th scope="row">Window scaling needed</th>
              <td>
                {shift === undefined
                  ? 'More than window scaling allows (shift 14, about 1 GiB): use several connections.'
                  : shift === 0
                    ? 'None: the 16-bit window field (65,535 octets) is enough.'
                    : `A shift of at least ${shift}: 65,535 x 2^${shift} = ${(65535 * 2 ** shift).toLocaleString('en-US')} octets.`}{' '}
                <span className="muted">
                  See the window scale option in the <a href={href.exchange('tcp', 1)}>TCP handshake</a>.
                </span>
              </td>
            </tr>
            <tr>
              <th scope="row">Throughput with this window</th>
              <td>
                <strong>{rate(Math.min(limit, bps))}</strong>{' '}
                <span className="muted">
                  {limit < bps ? `limited by the window: ${((limit / bps) * 100).toFixed(1)} % of the link. One window per round trip: window / RTT = ${rate(limit)}.` : 'the window is large enough; the link is the limit.'}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      )}
      <p className="small muted">
        TCP may only have one window of unacknowledged data on the way. When that is sent, it waits for acknowledgments, which come back one round trip later. So throughput can never exceed window / RTT, however fast the link. The window must be at least the bandwidth-delay product to fill a link. The original 16-bit window field allows 65,535 octets; window scaling (RFC 7323) multiplies it by up to 2<sup>14</sup>.
      </p>
    </section>
  );
}

/** Bandwidth calculator: units, transfer time with overhead, and window limits. */
export default function BandwidthTool() {
  return (
    <div className="index tool bandwidth-tool">
      <h1>Bandwidth calculator</h1>
      <p className="lead">Everyday questions about data rates without unit mistakes: bits or bytes, decimal or binary prefixes, how long a transfer really takes, and why a fast link can still be slow over a long distance.</p>
      <Units />
      <Transfer />
      <Window />
      <section aria-labelledby="h-sources">
        <h2 id="h-sources">Sources</h2>
        <SourceList sources={SOURCES} />
      </section>
    </div>
  );
}
