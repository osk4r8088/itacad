import type { FieldDef, LayerDef, LayerInstance, OsiLayer, Source } from '../schema';
import { buildStruct } from '../lib/build';
import { ascii } from '../lib/encode';

/** One part of a text protocol message, for example the request line or the header block of HTTP. */
export interface TextPart {
  id: string;
  name: string;
  about: string;
  /** Raw text of the part; CR LF must be written as \r\n. */
  text: string;
  source?: Source;
  note?: string;
}

export interface TextMessageParams {
  /** Layer id, the same for all messages of one protocol, for example 'http'. */
  id: string;
  name: string;
  short: string;
  about: string;
  sources: Source[];
  parts: TextPart[];
  summary: string;
  /** OSI layers, 7 by default. */
  osi?: OsiLayer[];
  osiNote?: string;
}

/** Makes CR LF visible but keeps the line break, so the text stays readable. */
export const showCrlf = (text: string) => text.replace(/\r\n/g, '\\r\\n\n').replace(/\n$/, '');

/**
 * A message of a text-based protocol (HTTP/1.1, SMTP, FTP, IMAP). Each part becomes one
 * variable-length field, so the header diagram and the field details can point at the
 * request line, the header block or the body separately.
 */
export function textMessage(p: TextMessageParams): LayerInstance {
  const fields: FieldDef[] = p.parts.map((part) => ({
    id: part.id,
    name: part.name,
    bits: 'variable',
    compact: true,
    about: part.about,
    ...(part.source ? { source: part.source } : {}),
  }));
  const def: LayerDef = {
    id: p.id,
    name: p.name,
    short: p.short,
    osi: p.osi ?? [7],
    ...(p.osiNote ? { osiNote: p.osiNote } : {}),
    tcpip: 'application',
    about: p.about,
    fields,
    sources: p.sources,
  };
  const inputs = Object.fromEntries(
    p.parts.map((part) => [
      part.id,
      {
        raw: ascii(part.text),
        display: part.text === '' ? '(empty)' : showCrlf(part.text),
        ...(part.note ? { note: part.note } : {}),
      },
    ]),
  );
  return buildStruct(def, inputs, {}, p.summary);
}
