import { useEffect, useId, useMemo, useState } from 'react';
import type { LayerInstance } from '../../shared/schema';
import { CaptureView, layerKind, type Selection } from '../../shared/components/PacketView';
import { segments } from '../../shared/lib/layout';
import { decode, type Decoded, type Start } from './decode';
import { parseHex, toHex } from './input';
import { EXAMPLES } from './examples';

const START_OPTIONS: { id: Start; label: string }[] = [
  { id: 'auto', label: 'Detect' },
  { id: 'ethernet', label: 'Ethernet' },
  { id: 'ipv4', label: 'IPv4' },
];

interface ByteOwner {
  layer: number;
  field?: string;
}

/** Which layer and field every octet of the input belongs to, in wire order. */
function owners(layers: LayerInstance[], total: number): ByteOwner[] {
  const out: ByteOwner[] = new Array(total);
  const mark = (layer: number, inst: LayerInstance, offset: number, inTrailer: boolean) => {
    for (const seg of segments(inst, 0)) {
      if (seg.kind !== 'field' || seg.inTrailer !== inTrailer) continue;
      const from = offset + Math.floor(seg.start / 8);
      const to = offset + Math.ceil((seg.start + seg.bits) / 8);
      for (let i = from; i < to && i < total; i++) if (!out[i]) out[i] = { layer, field: seg.id };
    }
  };
  let offset = 0;
  layers.forEach((l, i) => {
    mark(i, l, offset, false);
    offset += l.bytes.length;
  });
  for (let i = layers.length - 1; i >= 0; i--) {
    const t = layers[i].trailerBytes;
    if (!t?.length) continue;
    mark(i, layers[i], offset, true);
    offset += t.length;
  }
  for (let i = 0; i < total; i++) if (!out[i]) out[i] = { layer: -1 };
  return out;
}

function HexView({ bytes, decoded, selection, onSelect }: { bytes: Uint8Array; decoded: Decoded; selection: Selection; onSelect: (s: Selection) => void }) {
  const own = useMemo(() => owners(decoded.layers, bytes.length), [decoded, bytes.length]);
  const selectedLayer = decoded.layers.findIndex((l) => l.def.id === selection.layer);
  const rows: number[] = [];
  for (let i = 0; i < bytes.length; i += 16) rows.push(i);
  return (
    <figure className="hex-view">
      <figcaption className="muted small">All octets of the input. Colors show the layer; click an octet to select its field.</figcaption>
      <pre
        onClick={(e) => {
          const at = (e.target as HTMLElement).dataset.at;
          if (at === undefined) return;
          const o = own[Number(at)];
          if (o.layer >= 0) onSelect({ layer: decoded.layers[o.layer].def.id, ...(o.field ? { field: o.field } : {}) });
        }}
      >
        {rows.map((start) => (
          <div key={start}>
            <span className="hex-offset">{start.toString(16).padStart(4, '0')}</span>
            {Array.from(bytes.subarray(start, start + 16), (b, i) => {
              const at = start + i;
              const o = own[at];
              const layer = o.layer >= 0 ? decoded.layers[o.layer] : undefined;
              const cls = [
                'hex-byte',
                layer ? `kind-${layerKind(layer)}` : 'kind-none',
                o.layer === selectedLayer ? 'in-layer' : '',
                o.layer === selectedLayer && o.field && o.field === selection.field ? 'on' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <span key={i} className={cls} data-at={at} title={layer ? `${layer.def.short}${o.field ? `: ${layer.def.fields.concat(layer.def.trailer ?? []).find((f) => f.id === o.field)?.name ?? ''}` : ''}` : undefined}>
                  {b.toString(16).padStart(2, '0')}
                </span>
              );
            })}
          </div>
        ))}
      </pre>
    </figure>
  );
}

/** The header that is most interesting to start with: the innermost decoded header. */
function defaultSelection(d: Decoded): Selection {
  const headers = d.layers.filter((l) => l.def.id !== 'data');
  const l = headers.at(-1) ?? d.layers[0];
  return { layer: l?.def.id ?? '' };
}

/** Header decoder: paste the bytes of a frame and see every field, layer by layer. */
export default function DecoderTool() {
  const [text, setText] = useState(toHex(parseHexOrEmpty(EXAMPLES[0].hex)));
  const [start, setStart] = useState<Start>('auto');
  const inputId = useId();
  const errorId = useId();

  const parsed = useMemo(() => parseHex(text), [text]);
  const decoded = useMemo(() => (parsed.ok && parsed.bytes.length ? decode(parsed.bytes, start) : undefined), [parsed, start]);
  const [selection, setSelection] = useState<Selection>(() => (decoded ? defaultSelection(decoded) : { layer: '' }));

  // Keep the selection when the same layer still exists, otherwise pick a sensible one.
  useEffect(() => {
    if (decoded && !decoded.layers.some((l) => l.def.id === selection.layer)) setSelection(defaultSelection(decoded));
  }, [decoded, selection.layer]);

  return (
    <div className="index tool decoder-tool">
      <h1>Header decoder</h1>
      <p className="lead">
        Paste the bytes of a frame, for example copied from Wireshark (Copy as Hex Stream or Hex Dump). The decoder reads Ethernet, ARP, IPv4, TCP, UDP and ICMP, checks the checksums, and shows every field with its meaning.
      </p>

      <div className="tool-input decoder-input">
        <div className="field wide">
          <label htmlFor={inputId}>Bytes (hex)</label>
          <textarea
            id={inputId}
            className="mono"
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={!parsed.ok}
            aria-describedby={parsed.ok ? undefined : errorId}
          />
        </div>
        <fieldset className="field segmented">
          <legend>Input starts with</legend>
          {START_OPTIONS.map((o) => (
            <label key={o.id}>
              <input type="radio" name="start" value={o.id} checked={start === o.id} onChange={() => setStart(o.id)} />
              {o.label}
            </label>
          ))}
        </fieldset>
        <p className="examples small">
          Examples:{' '}
          {EXAMPLES.map((ex) => (
            <button key={ex.id} type="button" className="link-button" title={ex.about} onClick={() => setText(toHex(parseHexOrEmpty(ex.hex)))}>
              {ex.label}
            </button>
          ))}
        </p>
      </div>

      {!parsed.ok && (
        <p id={errorId} className="notice" role="alert">
          {parsed.error}
        </p>
      )}

      {decoded && parsed.ok && (
        <>
          <section aria-labelledby="h-summary" className="decoder-summary">
            <h2 id="h-summary" className="visually-hidden">
              Summary
            </h2>
            <p>
              {decoded.octets} octets, read as {decoded.start === 'ipv4' ? 'an IPv4 packet' : 'an Ethernet frame'}: {decoded.layers.map((l) => l.def.short).join(', ')}.
            </p>
            {decoded.checks.length > 0 && (
              <ul className="checks">
                {decoded.checks.map((c) => (
                  <li key={c.label} className={c.ok ? 'ok' : 'bad'}>
                    {c.label}: {c.ok ? 'valid' : 'wrong'}
                  </li>
                ))}
              </ul>
            )}
            {decoded.issues.length > 0 && (
              <ul className="issues">
                {decoded.issues.map((i, n) => (
                  <li key={n} className={`issue-${i.level}`}>
                    <strong>{i.level === 'error' ? 'Error' : i.level === 'warning' ? 'Warning' : 'Note'}:</strong> {i.text}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {decoded.layers.length > 0 && (
            <section aria-label="Decoded layers" className="decoder-capture">
              <CaptureView layers={decoded.layers} selection={selection} onSelect={setSelection}>
                <HexView bytes={parsed.bytes} decoded={decoded} selection={selection} onSelect={setSelection} />
              </CaptureView>
            </section>
          )}
        </>
      )}

      <section aria-labelledby="h-how">
        <h2 id="h-how">How it works</h2>
        <div className="prose">
          <p>
            Every header starts with fields of fixed size, so the decoder cuts the bytes at the bit positions the specifications define and reads the next protocol from a field of the current one: EtherType in Ethernet, Protocol in IPv4. Lengths come from the headers too: IHL and Total Length in IPv4, Data Offset in TCP, Length in UDP. Anything after the IPv4 packet inside an Ethernet frame is padding.
          </p>
          <p>
            Checksums are recomputed from the content. The IPv4 checksum covers only the IPv4 header; TCP and UDP checksums cover a pseudo-header with both IP addresses, their header and the data; the Ethernet FCS is a CRC-32 over the whole frame. Captures from the sending host often show wrong TCP or UDP checksums because the network card fills them in later (checksum offloading).
          </p>
          <p>Field names, explanations and sources are the same as in the protocol pages. Nothing you paste leaves your browser.</p>
        </div>
      </section>
    </div>
  );
}

function parseHexOrEmpty(hex: string): Uint8Array {
  const r = parseHex(hex);
  return r.ok ? r.bytes : new Uint8Array(0);
}
