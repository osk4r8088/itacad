import type { FieldDef, FieldValue, StructDef, StructInstance } from '../../shared/schema';

// Helpers shared by the decoders: cutting bytes into the fields of a header definition
// and turning the result into the instances the packet view renders.

export interface Issue {
  level: 'error' | 'warning' | 'info';
  text: string;
}

/** How a decoder reports something the reader should know about the input. */
export type Report = (level: Issue['level'], text: string) => void;

/** Removes sentences that only make sense for the generated examples of the exchanges. */
export const stripExample = (text: string) => text.replace(/[^.]*\bthis example\b[^.]*\.\s*/g, '').trim();

export function forInput<D extends StructDef>(def: D, extra: Partial<D> = {}): D {
  const field = (f: FieldDef): FieldDef => ({ ...f, about: stripExample(f.about) });
  return {
    ...def,
    about: stripExample(def.about),
    fields: def.fields.map(field),
    ...(def.trailer ? { trailer: def.trailer.map(field) } : {}),
    ...extra,
  };
}

export const hex = (n: number, digits: number) => `0x${n.toString(16).padStart(digits, '0')}`;
export const mac = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(':');
export const ip4 = (b: Uint8Array) => Array.from(b).join('.');
export const bit = (r: Raw) => String(r as number);
export const hexBytes = (b: Uint8Array, max = 32) => Array.from(b.subarray(0, max), (x) => x.toString(16).padStart(2, '0')).join(' ') + (b.length > max ? ` ... (${b.length} octets)` : '');

// ---- generic field slicer

export type Raw = number | Uint8Array;

export function readBits(bytes: Uint8Array, start: number, bits: number): number {
  let v = 0;
  for (let i = 0; i < bits; i++) {
    const pos = start + i;
    v = v * 2 + ((bytes[pos >> 3] >> (7 - (pos & 7))) & 1);
  }
  return v;
}

/**
 * Cuts a structure into its fields, following the bit widths of the definition.
 * Variable fields take the length given in `varOctets`, or all remaining octets.
 */
export function slice(fields: FieldDef[], bytes: Uint8Array, varOctets: Record<string, number> = {}): { raw: Record<string, Raw>; bin: Record<string, Uint8Array>; bits: Record<string, number>; octets: number } {
  const raw: Record<string, Raw> = {};
  const bin: Record<string, Uint8Array> = {};
  const bits: Record<string, number> = {};
  let pos = 0;
  for (const f of fields) {
    if (f.bits === 'variable') {
      const start = pos >> 3;
      const len = varOctets[f.id] ?? bytes.length - start;
      raw[f.id] = bin[f.id] = bytes.slice(start, start + len);
      bits[f.id] = len * 8;
      pos += len * 8;
    } else {
      if (pos % 8 === 0 && f.bits % 8 === 0) bin[f.id] = bytes.slice(pos >> 3, (pos + f.bits) >> 3);
      raw[f.id] = f.bits > 48 ? bin[f.id] : readBits(bytes, pos, f.bits);
      bits[f.id] = f.bits;
      pos += f.bits;
    }
  }
  return { raw, bin, bits, octets: pos >> 3 };
}

/** Length in octets of the fixed part of a definition, before its first variable field. */
export function fixedOctets(fields: FieldDef[]): number {
  let bits = 0;
  for (const f of fields) {
    if (f.bits === 'variable') break;
    bits += f.bits;
  }
  return bits / 8;
}

export type Display = Record<string, string | { display: string; note?: string; items?: StructInstance[] }>;

export function instance<D extends StructDef>(def: D, bytes: Uint8Array, sliced: ReturnType<typeof slice>, display: Display, summary?: string, trailer?: { bytes: Uint8Array; sliced: ReturnType<typeof slice> }): StructInstance<D> {
  const values: Record<string, FieldValue> = {};
  const all = [...def.fields, ...(def.trailer ?? [])];
  for (const f of all) {
    const s = def.trailer?.includes(f) && trailer ? trailer.sliced : sliced;
    const raw = s.raw[f.id];
    const given = display[f.id];
    const fallback = raw instanceof Uint8Array ? (raw.length ? hexBytes(raw) : 'none') : String(raw);
    const d = typeof given === 'string' ? { display: given } : (given ?? { display: fallback });
    values[f.id] = { bits: s.bits[f.id], ...d };
  }
  return {
    def,
    values,
    bytes: bytes.slice(0, sliced.octets),
    ...(trailer ? { trailerBytes: trailer.bytes } : {}),
    ...(summary ? { summary } : {}),
  };
}

export const num = (r: Raw) => r as number;
export const arr = (r: Raw) => r as Uint8Array;
