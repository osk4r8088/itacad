import type { LayerInstance, StructInstance } from '../schema';
import { OSI_LAYERS, TCPIP_LAYERS } from '../layers';
import { byteRange, segments } from '../lib/layout';
import { Prose } from './Prose';
import { SourceLink, SourceList } from './SourceList';

function HexDump({ bytes, highlight, label }: { bytes: Uint8Array; highlight?: [number, number]; label: string }) {
  if (bytes.length === 0) return null;
  const lines: number[] = [];
  for (let i = 0; i < bytes.length; i += 16) lines.push(i);
  return (
    <figure className="hex">
      <figcaption className="muted small">{label}</figcaption>
      <pre>
        {lines.map((start) => (
          <div key={start}>
            <span className="hex-offset">{start.toString(16).padStart(4, '0')}</span>
            {Array.from(bytes.subarray(start, start + 16), (b, i) => {
              const at = start + i;
              const on = highlight && at >= highlight[0] && at < highlight[1];
              return (
                <span key={i} className={on ? 'hex-on' : undefined}>
                  {' '}
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

function OptionCard({ item }: { item: StructInstance }) {
  return (
    <li className="option">
      <strong>{item.def.name}</strong>
      <Prose text={item.def.about} />
      <table>
        <tbody>
          {item.def.fields.map((f) => (
            <tr key={f.id}>
              <th scope="row">{f.name}</th>
              <td className="mono">{item.values[f.id].display}</td>
              <td className="muted">{f.about}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">
        Source:{' '}
        {item.def.sources.map((s, i) => (
          <SourceLink key={i} source={s} />
        ))}
      </p>
    </li>
  );
}

export function FieldInfo({ inst, fieldId, onClose }: { inst: LayerInstance; fieldId: string; onClose: () => void }) {
  const seg = segments(inst, 0).find((s) => s.id === fieldId);
  if (!seg || !seg.field || !seg.value) return null;
  const { field, value } = seg;
  const size = value.bits % 8 === 0 ? `${value.bits} bits (${value.bits / 8} octets)` : `${value.bits} bits`;

  return (
    <div className="info">
      <div className="info-head">
        <h3>{field.name}</h3>
        <button type="button" className="link-button" onClick={onClose}>
          About the {inst.def.short} layer
        </button>
      </div>
      <dl className="facts">
        <dt>Value</dt>
        <dd className="mono value">{value.display}</dd>
        <dt>Size</dt>
        <dd>
          {size}
          {field.bits === 'variable' && ' in this packet (variable)'}
        </dd>
        <dt>Position</dt>
        <dd>
          {seg.inTrailer ? 'trailer, ' : ''}bit {seg.start} (octet {Math.floor(seg.start / 8)}
          {seg.start % 8 ? `, bit ${seg.start % 8} within it` : ''})
        </dd>
      </dl>
      {value.note && <p className="note">{value.note}</p>}
      {value.unverified && (
        <p className="unverified-note">
          <strong>Not verified:</strong> {value.unverified}
        </p>
      )}
      <Prose text={field.about} />
      {field.source && (
        <p className="small muted">
          Source: <SourceLink source={field.source} />
        </p>
      )}
      {value.items && (
        <>
          <h4>Contents</h4>
          <ol className="options">
            {value.items.map((it, i) => (
              <OptionCard key={i} item={it} />
            ))}
          </ol>
        </>
      )}
      <HexDump
        bytes={seg.inTrailer ? inst.trailerBytes! : inst.bytes}
        highlight={byteRange(seg)}
        label={`${seg.inTrailer ? 'Trailer' : 'Header'} octets, highlighted: octets containing this field`}
      />
    </div>
  );
}

export function LayerInfo({ layer }: { layer: LayerInstance }) {
  const def = layer.def;
  const osi = [...def.osi].sort((a, b) => b - a);
  return (
    <div className="info">
      <h3>{def.name}</h3>
      <p className="muted small">
        OSI layer {osi.join(' and ')} ({osi.map((o) => OSI_LAYERS[o].name).join(', ')}) &middot; TCP/IP: {TCPIP_LAYERS[def.tcpip].name} layer
      </p>
      <Prose text={def.about} />
      {def.osiNote && (
        <p className="note">
          <strong>Layer mapping:</strong> {def.osiNote}
        </p>
      )}
      <p className="muted small">Click a field in the diagram for details.</p>
      <SourceList sources={def.sources} />
      <HexDump bytes={layer.bytes} label={`Header octets (${layer.bytes.length})`} />
      {layer.trailerBytes && layer.trailerBytes.length > 0 && <HexDump bytes={layer.trailerBytes} label={`Trailer octets (${layer.trailerBytes.length})`} />}
    </div>
  );
}
