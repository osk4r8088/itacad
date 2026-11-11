import { useId, useMemo, useState } from 'react';
import { SourceList } from '../../shared/components/SourceList';
import { formatIpv4, maskOf, parseInput, toBits } from '../subnet/logic';
import { plan, SOURCES, type Allocation, type Free, type Need } from './logic';

const EXAMPLE: { block: string; needs: Need[] } = {
  block: '192.168.10.0/24',
  needs: [
    { name: 'Sales', hosts: 100 },
    { name: 'Engineering', hosts: 50 },
    { name: 'HR', hosts: 25 },
    { name: 'Link to branch A', hosts: 2 },
    { name: 'Link to branch B', hosts: 2 },
  ],
};

const n = (v: number) => v.toLocaleString('en-US');
const cidr = (net: number, p: number) => `${formatIpv4(net)}/${p}`;

interface Row extends Need {
  key: number;
}

/** Network address bits: the block's prefix, the extra subnet bits, and the host bits. */
function BitRow({ label, value, blockPrefix, prefix }: { label: string; value: number; blockPrefix: number; prefix: number }) {
  const bits = toBits(value);
  return (
    <tr>
      <th scope="row">{label}</th>
      <td className="bits" aria-label={`${cidr(value, prefix)}: ${blockPrefix} block bits, ${prefix - blockPrefix} subnet bits, ${32 - prefix} host bits`}>
        {[0, 1, 2, 3].map((octet) => (
          <span key={octet} className="octet" aria-hidden="true">
            {bits
              .slice(octet * 8, octet * 8 + 8)
              .split('')
              .map((b, i) => {
                const pos = octet * 8 + i;
                const kind = pos < blockPrefix ? 'bit-fixed' : pos < prefix ? 'net' : 'host';
                return (
                  <span key={pos} className={`bit ${kind}${pos === prefix && prefix > 0 ? ' edge' : ''}`}>
                    {b}
                  </span>
                );
              })}
          </span>
        ))}
      </td>
      <td className="mono">/{prefix}</td>
    </tr>
  );
}

/** The block as a bar: one segment per subnet and per free block, widths proportional to size. */
function BlockMap({ base, total, allocations, free }: { base: number; total: number; allocations: Allocation[]; free: Free[] }) {
  const parts = [
    ...allocations.map((a) => ({ start: a.subnet.network, size: a.subnet.total, label: a.need.name, cidr: cidr(a.subnet.network, a.subnet.prefix), free: false })),
    ...free.map((f) => ({ start: f.network, size: 2 ** (32 - f.prefix), label: 'free', cidr: cidr(f.network, f.prefix), free: true })),
  ].sort((a, b) => a.start - b.start);
  return (
    <div className="vlsm-map" role="list" aria-label="Address block from first to last address">
      {parts.map((p) => (
        <div key={p.start} role="listitem" className={`vlsm-seg${p.free ? ' free' : ''}`} style={{ flexGrow: p.size, flexBasis: 0 }} title={`${p.label}: ${p.cidr}, ${n(p.size)} addresses`}>
          <span className="vlsm-seg-name">{p.label}</span>
          <span className="vlsm-seg-cidr mono">{p.cidr}</span>
        </div>
      ))}
      <span className="visually-hidden">
        From {formatIpv4(base)} to {formatIpv4(base + total - 1)}.
      </span>
    </div>
  );
}

/** VLSM planner: one block, many subnets of different sizes. */
export default function VlsmTool() {
  const [blockText, setBlockText] = useState(EXAMPLE.block);
  const [rows, setRows] = useState<Row[]>(EXAMPLE.needs.map((r, i) => ({ ...r, key: i })));
  const [nextKey, setNextKey] = useState(EXAMPLE.needs.length);
  const [allow31, setAllow31] = useState(false);
  const blockId = useId();
  const checkId = useId();

  const block = useMemo(() => parseInput(blockText), [blockText]);
  const blockOk = block.ok && block.prefix !== undefined;
  const base = block.ok ? (block.address & maskOf(block.prefix ?? 32)) >>> 0 : 0;
  const prefix = block.ok ? (block.prefix ?? 32) : 32;
  const result = blockOk ? plan(block.address, prefix, rows, allow31) : undefined;

  const update = (key: number, patch: Partial<Need>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = () => {
    setRows((rs) => [...rs, { key: nextKey, name: `Network ${rs.length + 1}`, hosts: 10 }]);
    setNextKey((k) => k + 1);
  };

  return (
    <div className="index tool vlsm-tool">
      <h1>VLSM subnet planner</h1>
      <p className="lead">Split one address block into subnets of different sizes. Enter the block and how many hosts each network needs; the planner gives every network the smallest subnet that fits, largest first.</p>

      <div className="tool-input">
        <div className="field">
          <label htmlFor={blockId}>Address block</label>
          <input id={blockId} className="mono" value={blockText} onChange={(e) => setBlockText(e.target.value)} spellCheck={false} autoComplete="off" aria-invalid={!blockOk} />
        </div>
        <div className="field check">
          <input id={checkId} type="checkbox" checked={allow31} onChange={(e) => setAllow31(e.target.checked)} />
          <label htmlFor={checkId}>Use /31 for networks with 2 hosts (point-to-point links, RFC 3021)</label>
        </div>
      </div>
      {!block.ok && <p className="notice" role="alert">{block.error}</p>}
      {block.ok && block.prefix === undefined && (
        <p className="notice" role="alert">
          Add a prefix length to the block, for example {formatIpv4(block.address)}/24.
        </p>
      )}
      {blockOk && base !== block.address && (
        <p className="muted small">
          {formatIpv4(block.address)} is not the first address of a /{prefix}; the planner uses the block {cidr(base, prefix)}.
        </p>
      )}

      <section aria-labelledby="h-needs">
        <h2 id="h-needs">Networks</h2>
        <table className="vlsm-needs">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Hosts needed</th>
              <th scope="col">
                <span className="visually-hidden">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key}>
                <td>
                  <input aria-label={`Name of network ${i + 1}`} value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} />
                </td>
                <td>
                  <input
                    aria-label={`Hosts needed in ${r.name || `network ${i + 1}`}`}
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={Number.isNaN(r.hosts) ? '' : r.hosts}
                    onChange={(e) => update(r.key, { hosts: e.target.value === '' ? NaN : Number(e.target.value) })}
                  />
                </td>
                <td>
                  <button type="button" className="link-button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`Remove ${r.name || `network ${i + 1}`}`}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          <button type="button" onClick={add}>
            Add network
          </button>
        </p>
      </section>

      {result && !result.ok && (
        <p className="notice" role="alert">
          {result.error}
        </p>
      )}

      {result?.ok && result.allocations.length > 0 && (
        <>
          <section aria-labelledby="h-map">
            <h2 id="h-map">Block map</h2>
            <BlockMap base={base} total={result.total} allocations={result.allocations} free={result.free} />
            <p className="small muted">
              {n(result.used)} of {n(result.total)} addresses allocated, {n(result.allocations.reduce((s, a) => s + a.wasted, 0))} of them usable but not needed.{' '}
              {result.free.length > 0 ? `Free: ${result.free.map((f) => cidr(f.network, f.prefix)).join(', ')}.` : 'No free space left.'}
            </p>
          </section>

          <section aria-labelledby="h-plan">
            <h2 id="h-plan">Subnets</h2>
            <p className="small muted">In the order they were allocated: largest first.</p>
            <div className="table-scroll">
              <table className="vlsm-plan">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Needed</th>
                    <th scope="col">Subnet</th>
                    <th scope="col">Mask</th>
                    <th scope="col">Usable hosts</th>
                    <th scope="col">Broadcast</th>
                    <th scope="col">Size</th>
                    <th scope="col">Unused</th>
                  </tr>
                </thead>
                <tbody>
                  {result.allocations.map((a) => (
                    <tr key={a.index}>
                      <th scope="row">{a.need.name}</th>
                      <td>{n(a.need.hosts)}</td>
                      <td className="mono">{cidr(a.subnet.network, a.subnet.prefix)}</td>
                      <td className="mono">{formatIpv4(a.subnet.mask)}</td>
                      <td className="mono">{a.subnet.hosts === 2 && a.subnet.rule === 'point-to-point' ? `${formatIpv4(a.subnet.firstHost)}, ${formatIpv4(a.subnet.lastHost)}` : `${formatIpv4(a.subnet.firstHost)} to ${formatIpv4(a.subnet.lastHost)}`}</td>
                      <td className="mono">{a.subnet.rule === 'normal' ? formatIpv4(a.subnet.broadcast) : <span className="muted">none</span>}</td>
                      <td>
                        {n(a.subnet.total)} <span className="muted">({n(a.subnet.hosts)} usable)</span>
                      </td>
                      <td>{n(a.wasted)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="h-bits">
            <h2 id="h-bits">Boundaries in bits</h2>
            <div className="table-scroll">
              <table className="bit-table">
                <tbody>
                  <BitRow label="Block" value={base} blockPrefix={prefix} prefix={prefix} />
                  {result.allocations.map((a) => (
                    <BitRow key={a.index} label={a.need.name} value={a.subnet.network} blockPrefix={prefix} prefix={a.subnet.prefix} />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="legend small">
              <span className="bit bit-fixed">1</span> bits of the block (first {prefix}) <span className="bit net">1</span> bits that pick the subnet inside it <span className="bit host">0</span> host bits
            </p>
          </section>
        </>
      )}

      <div className="prose">
        <h2>How it works</h2>
        <p>
          With fixed-length subnetting every subnet of a block gets the same size, so a link with 2 hosts wastes as much space as a LAN with 100. <strong>Variable-length subnet masks</strong> (VLSM) give each network a prefix of its own length. CIDR (RFC 4632) made this normal: a prefix can have any length.
        </p>
        <p>
          A subnet with h host bits has 2<sup>h</sup> addresses, of which 2<sup>h</sup> - 2 can be hosts, because the first is the network address and the last the broadcast address. So 100 hosts need 7 host bits (126 usable), a /25; 2 hosts need a /30, or a /31 on a point-to-point link where RFC 3021 allows both addresses as hosts.
        </p>
        <p>
          A subnet must start at a multiple of its own size: a /26 (64 addresses) at .0, .64, .128 or .192. Allocating the <strong>largest networks first</strong> guarantees this without gaps, because each following block is the same size or smaller and therefore fits the boundary left by the one before. The unused rest is listed as the fewest aligned blocks, ready for later networks.
        </p>
        <p>
          The <strong>unused</strong> column counts usable addresses a network does not need today. Some of that is useful headroom; planning with room to grow is often wiser than the tightest fit.
        </p>
      </div>

      <section aria-labelledby="h-sources">
        <h2 id="h-sources">Sources</h2>
        <SourceList sources={SOURCES} />
      </section>
    </div>
  );
}
