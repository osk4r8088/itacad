import type { FieldDef, FieldValue, StructDef, StructInstance } from '../schema';
import { pack, type Raw } from './encode';

export interface FieldInput {
  raw: Raw;
  display: string;
  note?: string;
  unverified?: string;
  items?: StructInstance[];
}

export type FieldInputs = Record<string, FieldInput>;

/** Per-step annotations an exchange file can add to builder output. */
export interface Annotations {
  notes?: Record<string, string>;
  unverified?: Record<string, string>;
}

function bitsOf(field: FieldDef, input: FieldInput): number {
  if (field.bits !== 'variable') return field.bits;
  if (!(input.raw instanceof Uint8Array)) throw new Error(`variable field ${field.id} needs bytes`);
  return input.raw.length * 8;
}

function encodeFields(fields: FieldDef[], inputs: FieldInputs, values: Record<string, FieldValue>): Uint8Array {
  const items = fields.map((f) => {
    const input = inputs[f.id];
    if (!input) throw new Error(`missing value for field ${f.id}`);
    const bits = bitsOf(f, input);
    values[f.id] = {
      display: input.display,
      bits,
      ...(input.note ? { note: input.note } : {}),
      ...(input.unverified ? { unverified: input.unverified } : {}),
      ...(input.items ? { items: input.items } : {}),
    };
    return { bits, raw: input.raw };
  });
  return pack(items);
}

/** Encodes a structure and records display values for every field. */
export function buildStruct<D extends StructDef>(
  def: D,
  inputs: FieldInputs,
  ann: Annotations = {},
  summary?: string,
): StructInstance<D> {
  const values: Record<string, FieldValue> = {};
  const bytes = encodeFields(def.fields, inputs, values);
  const trailerBytes = def.trailer ? encodeFields(def.trailer, inputs, values) : undefined;
  for (const [id, note] of Object.entries(ann.notes ?? {})) {
    if (!values[id]) throw new Error(`note for unknown field ${def.id}.${id}`);
    values[id].note = values[id].note ? `${values[id].note} ${note}` : note;
  }
  for (const [id, why] of Object.entries(ann.unverified ?? {})) {
    if (!values[id]) throw new Error(`unverified marker for unknown field ${def.id}.${id}`);
    values[id].unverified = why;
  }
  return { def, values, bytes, ...(trailerBytes ? { trailerBytes } : {}), ...(summary ? { summary } : {}) };
}

/** Total encoded length of a layer: its header, the inner payload and its trailer. */
export function encodedLength(inst: StructInstance, payloadLength: number): number {
  return inst.bytes.length + payloadLength + (inst.trailerBytes?.length ?? 0);
}
