import type { LayerDef, LayerInstance, OsiLayer, Source, TcpIpLayer } from '../schema';
import { buildStruct } from '../lib/build';
import { ascii } from '../lib/encode';

export interface PayloadParams {
  id: string;
  name: string;
  short: string;
  about: string;
  /** Text payload; CR LF must be written as \r\n. */
  text: string;
  osi: OsiLayer[];
  tcpip: TcpIpLayer;
  osiNote?: string;
  sources: Source[];
  summary?: string;
}

/** Application data carried as opaque text, for exchanges where the application protocol is not the topic. */
export function textPayload(p: PayloadParams): LayerInstance {
  const def: LayerDef = {
    id: p.id,
    name: p.name,
    short: p.short,
    osi: p.osi,
    tcpip: p.tcpip,
    ...(p.osiNote ? { osiNote: p.osiNote } : {}),
    about: p.about,
    fields: [{ id: 'data', name: 'Data', bits: 'variable', about: 'Application data, shown as text. Line breaks are CR LF (\\r\\n).' }],
    sources: p.sources,
  };
  const bytes = ascii(p.text);
  // Make CR LF visible, but keep the line break for readability.
  const display = p.text.replace(/\r\n/g, '\\r\\n\n');
  return buildStruct(def, { data: { raw: bytes, display } }, {}, p.summary ?? `${bytes.length} octets`);
}
