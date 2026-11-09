import type { FieldValue, LayerDef, LayerInstance } from '../../shared/schema';
import { RR_FIELDS, typeInfo } from './types';
import { encodeName, encodeRecord, rdataParts, TYPE_CODES, type Record } from './wire';
import { presentRdata } from './zone';

const defs = new Map<string, LayerDef>();

/** A record as a structure for the header diagram: the fixed fields, then the RDATA fields of its type. */
function defFor(type: Record['rdata']['type']): LayerDef {
  const cached = defs.get(type);
  if (cached) return cached;
  const info = typeInfo(type);
  const def: LayerDef = {
    id: `rr-${type.toLowerCase()}`,
    name: `${type} record`,
    short: type,
    osi: [7],
    tcpip: 'application',
    about: info.purpose,
    fields: [...RR_FIELDS, ...info.fields],
    sources: [info.source, { rfc: 1035, section: '3.2.1' }],
  };
  defs.set(type, def);
  return def;
}

function duration(s: number): string {
  if (s % 86400 === 0) return `${s / 86400} day${s === 86400 ? '' : 's'}`;
  if (s % 3600 === 0) return `${s / 3600} hour${s === 3600 ? '' : 's'}`;
  if (s % 60 === 0) return `${s / 60} minutes`;
  return `${s} seconds`;
}

/** Readable value for one RDATA field. */
function fieldDisplay(rec: Record, id: string, bytes: Uint8Array): string {
  const rd = rec.rdata as unknown as globalThis.Record<string, unknown>;
  const v = rd[id];
  if (v instanceof Uint8Array) return `${v.length} octets`;
  if (id === 'strings') return (rd.strings as string[]).map((s) => `"${s}" (${s.length})`).join(' ');
  if (id === 'typeCovered') return `${TYPE_CODES[v as keyof typeof TYPE_CODES]} (${String(v)})`;
  if (id === 'typeBitmaps') return (rd.types as string[]).join(' ');
  if (id === 'params') return presentRdata(rec.rdata).split(' ').slice(2).join(' ');
  if (id === 'tagLength') return String(bytes[0]);
  if (['refresh', 'retry', 'expire', 'minimum', 'originalTtl'].includes(id)) return `${v} (${duration(v as number)})`;
  if (id === 'expiration' || id === 'inception') return new Date((v as number) * 1000).toISOString().replace('.000Z', 'Z');
  return String(v);
}

export function recordInstance(rec: Record): LayerInstance {
  const def = defFor(rec.rdata.type);
  const parts = rdataParts(rec.rdata);
  const rdLength = parts.reduce((n, [, b]) => n + b.length, 0);
  const owner = encodeName(rec.owner);
  const values: globalThis.Record<string, FieldValue> = {
    name: { display: rec.owner, bits: owner.length * 8 },
    type: { display: `${TYPE_CODES[rec.rdata.type]} (${rec.rdata.type})`, bits: 16 },
    class: { display: '1 (IN)', bits: 16 },
    ttl: { display: `${rec.ttl} (${duration(rec.ttl)})`, bits: 32 },
    rdlength: { display: String(rdLength), bits: 16 },
  };
  for (const [id, bytes] of parts) values[id] = { display: fieldDisplay(rec, id, bytes), bits: bytes.length * 8 };
  return { def, values, bytes: encodeRecord(rec), summary: `${rec.owner} ${rec.rdata.type}` };
}
