import { useState, type KeyboardEvent } from 'react';
import type { OsiLayer, TcpIpLayer } from '../../shared/schema';
import { OSI_LAYERS, TCPIP_LAYERS, TCPIP_ORDER } from '../../shared/layers';
import { CATALOG } from '../../protocols/catalog';
import { TOOLS, entryHref } from '../../tools/registry';
import { tcpExchange } from '../../protocols/exchanges/tcp';
import { href } from '../../app/router';
import { SourceList } from '../../shared/components/SourceList';
import { LAYERS, SOURCES, UNIT_NOTE, placementOf } from './data';

const OSI_ORDER: OsiLayer[] = [7, 6, 5, 4, 3, 2, 1];
const tcpipOf = (n: OsiLayer): TcpIpLayer => TCPIP_ORDER.find((t) => TCPIP_LAYERS[t].osi.includes(n))!;

// The encapsulation example: the HTTP request of the TCP exchange, as captured on the client LAN.
const EXAMPLE_STEP = tcpExchange.steps.findIndex((s) => s.id === 'request');
const EXAMPLE = tcpExchange.steps[EXAMPLE_STEP].captures[0].layers;
const sizeOf = (i: number) => EXAMPLE[i].bytes.length + (EXAMPLE[i].trailerBytes?.length ?? 0);
const WIRE = EXAMPLE.reduce((n, _l, i) => n + sizeOf(i), 0);

/** OSI and TCP/IP side by side; every layer with what belongs to it on this site. */
export default function LayersPage() {
  const [layer, setLayer] = useState<OsiLayer>(7);
  const [protocol, setProtocol] = useState<string | null>(null);
  const placed = protocol ? placementOf(protocol) : null;

  const select = (n: OsiLayer) => {
    setLayer(n);
    if (placed && !placed.osi.includes(n)) setProtocol(null);
  };
  const onKey = (e: KeyboardEvent) => {
    const i = OSI_ORDER.indexOf(layer);
    const next = e.key === 'ArrowDown' ? OSI_ORDER[i + 1] : e.key === 'ArrowUp' ? OSI_ORDER[i - 1] : undefined;
    if (!next) return;
    e.preventDefault();
    select(next);
    document.getElementById(`osi-${next}`)?.focus();
  };

  const facts = LAYERS[layer];
  const tcpip = tcpipOf(layer);
  const protocols = CATALOG.filter((p) => placementOf(p.id).osi.includes(layer));
  const tools = facts.tools.map((id) => TOOLS.find((t) => t.id === id)!).filter(Boolean);
  const protocolEntry = protocol ? CATALOG.find((p) => p.id === protocol) : undefined;

  return (
    <div className="index layers">
      <h1>OSI and TCP/IP</h1>
      <p className="lead">
        Two ways to cut networking into layers: the seven layers of the OSI reference model, and the four layers the Internet protocols are actually built on. Pick a layer to see its job, its addresses, and the protocols and tools of this site that belong to it.
      </p>

      <section aria-label="Find a protocol" className="layers-find">
        <h2>Where does a protocol sit?</h2>
        <div className="chips">
          {CATALOG.map((p) => (
            <button
              key={p.id}
              type="button"
              className="chip"
              aria-pressed={protocol === p.id}
              onClick={() => {
                if (protocol === p.id) return setProtocol(null);
                setProtocol(p.id);
                setLayer(placementOf(p.id).osi[0]);
              }}
            >
              {p.title}
            </button>
          ))}
        </div>
        {protocolEntry && placed && (
          <div className="layers-placed" role="status">
            <p>
              <strong>{protocolEntry.title}</strong>: OSI layer {placed.osi.map((n) => `${n} (${OSI_LAYERS[n].name})`).join(' and ')}, TCP/IP {[...new Set(placed.osi.map((n) => TCPIP_LAYERS[tcpipOf(n)].name))].join(' and ')} layer.{' '}
              <a href={href.exchange(protocolEntry.id)}>Open the exchange</a>
            </p>
            {placed.note && <p className="muted">{placed.note}</p>}
          </div>
        )}
      </section>

      <div className="layers-main">
        <div className="layers-model" role="group" aria-label="Layer models" onKeyDown={onKey}>
          <div className="layers-head">OSI</div>
          <div className="layers-head">TCP/IP</div>
          {OSI_ORDER.map((n, row) => (
            <button
              key={n}
              id={`osi-${n}`}
              type="button"
              className={`layers-osi kind-${tcpipOf(n)}${layer === n ? ' is-selected' : ''}${placed?.osi.includes(n) ? ' is-protocol' : ''}`}
              style={{ gridRow: row + 2 }}
              aria-pressed={layer === n}
              onClick={() => select(n)}
            >
              <span className="layers-n">{n}</span> {OSI_LAYERS[n].name}
              <span className="layers-unit">{LAYERS[n].unit.split(' (')[0]}</span>
            </button>
          ))}
          {TCPIP_ORDER.map((t) => {
            const rows = TCPIP_LAYERS[t].osi.map((n) => OSI_ORDER.indexOf(n) + 2);
            return (
              <button
                key={t}
                type="button"
                className={`layers-tcpip kind-${t}${tcpip === t ? ' is-selected' : ''}`}
                style={{ gridRow: `${Math.min(...rows)} / ${Math.max(...rows) + 1}` }}
                onClick={() => select(OSI_ORDER.find((n) => TCPIP_LAYERS[t].osi.includes(n))!)}
              >
                {TCPIP_LAYERS[t].name}
              </button>
            );
          })}
        </div>

        <section className="layers-detail" aria-live="polite" aria-label={`Layer ${layer}`}>
          <h2>
            Layer {layer}: {OSI_LAYERS[layer].name}
          </h2>
          <p>{facts.job}</p>
          <dl className="layers-facts">
            <dt>Unit of data</dt>
            <dd>{facts.unit}</dd>
            <dt>Addresses</dt>
            <dd>{facts.addresses}</dd>
            <dt>Devices</dt>
            <dd>{facts.devices}</dd>
            <dt>In TCP/IP</dt>
            <dd>
              {TCPIP_LAYERS[tcpip].name} layer. {TCPIP_LAYERS[tcpip].about}
            </dd>
            <dt>Protocols here</dt>
            <dd>
              {protocols.length === 0
                ? 'None of the protocols on this site sits only here.'
                : protocols.map((p, i) => (
                    <span key={p.id}>
                      {i > 0 && ', '}
                      <a href={href.exchange(p.id)}>{p.title}</a>
                    </span>
                  ))}
            </dd>
            <dt>Tools</dt>
            <dd>
              {tools.length === 0
                ? 'None.'
                : tools.map((t, i) => (
                    <span key={t.id}>
                      {i > 0 && ', '}
                      {t.status === 'ready' ? <a href={entryHref(t.id)}>{t.title}</a> : <span className="muted">{t.title} (planned)</span>}
                    </span>
                  ))}
            </dd>
          </dl>
          <h3>Typical problems</h3>
          <ul className="layers-problems">
            {facts.problems.map((p) => (
              <li key={p.symptom}>
                {p.symptom}
                {p.check.map((c) => (
                  <code key={c}>{c}</code>
                ))}
              </li>
            ))}
          </ul>
          <p className="muted small">Commands as on Linux. {UNIT_NOTE}</p>
        </section>
      </div>

      <section className="layers-encap" aria-label="Encapsulation">
        <h2>One packet on its way down</h2>
        <p>
          The HTTP request from <a href={href.exchange('tcp', EXAMPLE_STEP + 1)}>step {EXAMPLE_STEP + 1} of the TCP exchange</a>: every layer wraps what it gets from above in its own header, and Ethernet adds a checksum at the end. {sizeOf(EXAMPLE.length - 1)} octets of HTTP become {WIRE} octets on the wire.
        </p>
        <ol className="encap-rows">
          {EXAMPLE.map((_, k) => {
            const from = EXAMPLE.length - 1 - k;
            const added = EXAMPLE[from];
            const total = EXAMPLE.slice(from).reduce((n, _l, i) => n + sizeOf(from + i), 0);
            const n = added.def.osi[0];
            return (
              <li key={added.def.id} className={layer === n || (n === 7 && layer >= 5) ? 'is-selected' : ''}>
                <button type="button" className="encap-label" onClick={() => select(n)}>
                  {added.def.short} <span className="muted">layer {n}</span>
                </button>
                <div className="encap-bar" style={{ width: `${(total / WIRE) * 100}%` }}>
                  {EXAMPLE.slice(from).map((l, i) => (
                    <span key={l.def.id} className={`encap-seg kind-${l.def.tcpip}`} style={{ flexGrow: l.bytes.length }} title={`${l.def.name}: ${l.bytes.length} octets`}>
                      {i === 0 ? l.def.short : ''}
                    </span>
                  ))}
                  {EXAMPLE.slice(from).some((l) => l.trailerBytes?.length) && (
                    <span className="encap-seg kind-link" style={{ flexGrow: 4 }} title="Ethernet FCS: 4 octets">
                      FCS
                    </span>
                  )}
                </div>
                <span className="encap-size">{total} octets</span>
              </li>
            );
          })}
        </ol>
        <p className="muted small">The receiver does the reverse: each layer reads and removes its own header and hands the rest up.</p>
      </section>

      <h2>Sources</h2>
      <SourceList sources={SOURCES} />
    </div>
  );
}
