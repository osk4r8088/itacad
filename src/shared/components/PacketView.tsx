import type { ReactNode } from 'react';
import type { Capture, Exchange, LayerInstance, OsiLayer, Step } from '../schema';
import { OSI_LAYERS, TCPIP_LAYERS, TCPIP_ORDER } from '../layers';
import { HeaderDiagram } from './HeaderDiagram';
import { FieldInfo, LayerInfo } from './FieldInfo';

/** The selected layer, and optionally one field in it. */
export interface Selection {
  layer: string;
  field?: string;
}

interface Props {
  exchange: Exchange;
  step: Step;
  capture: Capture;
  onLink: (link: string) => void;
  selection: Selection;
  onSelect: (s: Selection) => void;
}

/** Octets carried inside each layer (everything of the inner layers, including their trailers). */
export function innerLengths(layers: LayerInstance[]): number[] {
  const out = new Array<number>(layers.length).fill(0);
  for (let i = layers.length - 2; i >= 0; i--) {
    const inner = layers[i + 1];
    out[i] = inner.bytes.length + out[i + 1] + (inner.trailerBytes?.length ?? 0);
  }
  return out;
}

export function layerKind(l: LayerInstance): string {
  return l.def.osi.includes(1) && !l.def.osi.includes(2) ? 'phy' : l.def.tcpip;
}

const OSI_ROWS: OsiLayer[] = [7, 6, 5, 4, 3, 2, 1];
const row = (osi: OsiLayer) => 8 - osi;

function EncapsulationBar({ layers, selected, onSelect }: { layers: LayerInstance[]; selected: string; onSelect: (s: Selection) => void }) {
  type Part = { layer: LayerInstance; octets: number; part: 'header' | 'trailer' };
  const parts: Part[] = [
    ...layers.map((l) => ({ layer: l, octets: l.bytes.length, part: 'header' as const })),
    ...layers
      .filter((l) => l.trailerBytes && l.trailerBytes.length > 0)
      .reverse()
      .map((l) => ({ layer: l, octets: l.trailerBytes!.length, part: 'trailer' as const })),
  ];
  const total = parts.reduce((n, p) => n + p.octets, 0);
  return (
    <div className="encap">
      <div className="encap-bar" role="list" aria-label="Encapsulation, octets on the wire in order">
        {parts.map((p, i) => (
          <button
            type="button"
            role="listitem"
            key={i}
            className={`encap-part kind-${layerKind(p.layer)}${p.layer.def.id === selected ? ' selected' : ''}`}
            style={{ flexGrow: p.octets }}
            onClick={() => onSelect({ layer: p.layer.def.id })}
            title={`${p.layer.def.name}${p.part === 'trailer' ? ' trailer' : ''}: ${p.octets} octets`}
          >
            <span>{p.part === 'trailer' ? 'FCS' : p.layer.def.short}</span>
            <small>{p.octets}</small>
          </button>
        ))}
      </div>
      <p className="muted small">{total} octets on the wire, in transmission order. Widths are proportional to size.</p>
    </div>
  );
}

function LayerStack({ layers, selected, onSelect }: { layers: LayerInstance[]; selected: string; onSelect: (s: Selection) => void }) {
  // Group layer instances by the OSI rows they cover.
  const groups = new Map<string, { start: number; end: number; items: LayerInstance[] }>();
  for (const l of layers) {
    const start = row(Math.max(...l.def.osi) as OsiLayer);
    const end = row(Math.min(...l.def.osi) as OsiLayer) + 1;
    const key = `${start}-${end}`;
    if (!groups.has(key)) groups.set(key, { start, end, items: [] });
    groups.get(key)!.items.push(l);
  }
  const covered = new Set<number>();
  for (const g of groups.values()) for (let r = g.start; r < g.end; r++) covered.add(r);
  const empty: { start: number; end: number }[] = [];
  for (let r = 1; r <= 7; r++) {
    if (covered.has(r)) continue;
    const last = empty.at(-1);
    if (last && last.end === r) last.end = r + 1;
    else empty.push({ start: r, end: r + 1 });
  }

  return (
    <div className="stack" role="group" aria-label="Layers of this packet in the OSI and TCP/IP models">
      <div className="stack-head" style={{ gridColumn: 1 }}>OSI</div>
      <div className="stack-head" style={{ gridColumn: 2 }}>TCP/IP</div>
      <div className="stack-head" style={{ gridColumn: 3 }}>In this packet</div>
      {OSI_ROWS.map((osi) => (
        <div key={osi} className="stack-osi" style={{ gridRow: row(osi) + 1 }} title={OSI_LAYERS[osi].about}>
          <span className="num">{osi}</span> {OSI_LAYERS[osi].name}
        </div>
      ))}
      {TCPIP_ORDER.map((t) => {
        const osi = TCPIP_LAYERS[t].osi;
        return (
          <div
            key={t}
            className={`stack-tcpip kind-${t}`}
            style={{ gridRow: `${row(Math.max(...osi) as OsiLayer) + 1} / ${row(Math.min(...osi) as OsiLayer) + 2}` }}
            title={TCPIP_LAYERS[t].about}
          >
            {TCPIP_LAYERS[t].name}
          </div>
        );
      })}
      {[...groups.values()].map((g) => (
        <div key={`${g.start}`} className="stack-cell" style={{ gridRow: `${g.start + 1} / ${g.end + 1}` }}>
          {g.items.map((l) => (
            <button
              type="button"
              key={l.def.id}
              className={`stack-block kind-${layerKind(l)}${l.def.id === selected ? ' selected' : ''}`}
              onClick={() => onSelect({ layer: l.def.id })}
              aria-pressed={l.def.id === selected}
            >
              <strong>{l.def.name}</strong>
              {l.summary && <span>{l.summary}</span>}
            </button>
          ))}
        </div>
      ))}
      {empty.map((e) => (
        <div key={`e${e.start}`} className="stack-cell stack-empty" style={{ gridRow: `${e.start + 1} / ${e.end + 1}` }}>
          {e.start === 1 ? 'No application data in this message' : 'Nothing at this layer'}
        </div>
      ))}
    </div>
  );
}

/** Encapsulation bar, layer stack and header diagram of one frame. Used by the exchanges and the decoder. */
export function CaptureView({ layers, selection, onSelect, children }: { layers: LayerInstance[]; selection: Selection; onSelect: (s: Selection) => void; children?: ReactNode }) {
  const inner = innerLengths(layers);
  const idx = Math.max(
    0,
    layers.findIndex((l) => l.def.id === selection.layer),
  );
  const layer = layers[idx];
  const field = selection.field && layer.def.id === selection.layer ? selection.field : undefined;

  return (
    <div className="packet-view">
      <div className="packet-left">
        {children}
        <EncapsulationBar layers={layers} selected={layer.def.id} onSelect={onSelect} />
        <LayerStack layers={layers} selected={layer.def.id} onSelect={onSelect} />
      </div>

      <div className="packet-right">
        <h3 className="diagram-title">{layer.def.name}</h3>
        <HeaderDiagram inst={layer} payloadOctets={inner[idx]} payloadName={layers[idx + 1]?.def.name} selected={field} onSelect={(f) => onSelect({ layer: layer.def.id, field: f })} />
        {field ? <FieldInfo inst={layer} fieldId={field} onClose={() => onSelect({ layer: layer.def.id })} /> : <LayerInfo layer={layer} />}
      </div>
    </div>
  );
}

export function PacketView({ exchange, step, capture, onLink, selection, onSelect }: Props) {
  const linkLabel = (id: string) => exchange.links.find((l) => l.id === id)?.label ?? id;
  return (
    <CaptureView layers={capture.layers} selection={selection} onSelect={onSelect}>
      {step.captures.length > 1 && (
        <div className="capture-tabs" role="tablist" aria-label="Link where the frame is captured">
          <span className="muted small">Captured on:</span>
          {step.captures.map((c) => (
            <button
              type="button"
              role="tab"
              key={c.link}
              aria-selected={c.link === capture.link}
              className={c.link === capture.link ? 'selected' : ''}
              onClick={() => onLink(c.link)}
            >
              {linkLabel(c.link)}
            </button>
          ))}
        </div>
      )}
      {capture.note && <p className="muted small">{capture.note}</p>}
    </CaptureView>
  );
}
