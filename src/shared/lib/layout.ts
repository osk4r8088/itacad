import type { FieldDef, FieldValue, StructInstance } from '../schema';

export interface Segment {
  kind: 'field' | 'payload';
  id: string;
  field?: FieldDef;
  value?: FieldValue;
  /** Bit offset inside the header bytes or trailer bytes. */
  start: number;
  bits: number;
  inTrailer: boolean;
  /** Drawn as one full-width row, not to scale (long opaque data). */
  compact?: boolean;
}

/** Fields of a structure in wire order, with a payload marker between header and trailer. */
export function segments(inst: StructInstance, payloadOctets: number): Segment[] {
  const out: Segment[] = [];
  let pos = 0;
  for (const field of inst.def.fields) {
    const value = inst.values[field.id];
    const compact = (field.compact && value.bits > 64) || (field.bits === 'variable' && !value.items && value.bits > 64);
    out.push({ kind: 'field', id: field.id, field, value, start: pos, bits: value.bits, inTrailer: false, ...(compact ? { compact } : {}) });
    pos += value.bits;
  }
  if (payloadOctets > 0) out.push({ kind: 'payload', id: '_payload', start: pos, bits: payloadOctets * 8, inTrailer: false });
  pos = 0;
  for (const field of inst.def.trailer ?? []) {
    const value = inst.values[field.id];
    const compact = (field.compact && value.bits > 64) || (field.bits === 'variable' && !value.items && value.bits > 64);
    out.push({ kind: 'field', id: field.id, field, value, start: pos, bits: value.bits, inTrailer: true, ...(compact ? { compact } : {}) });
    pos += value.bits;
  }
  return out;
}

export interface Cell {
  seg: Segment;
  row: number;
  col: number;
  span: number;
  /** First piece of a field that spans several rows. */
  first: boolean;
}

export const ROW_BITS = 32;

/**
 * Splits fields into rows of 32 bits, like the diagrams in RFCs. The payload is
 * drawn as a single full-width row that is not to scale, and trailer fields
 * start on a new row after it.
 */
export function rows(segs: Segment[]): Cell[][] {
  const result: Cell[][] = [];
  let row = -1;
  let col = ROW_BITS;
  const newRow = () => {
    result.push([]);
    row++;
    col = 0;
  };
  let afterPayload = false;
  for (const seg of segs) {
    if (seg.bits === 0) continue;
    if (seg.kind === 'payload' || seg.compact) {
      newRow();
      result[row].push({ seg, row, col: 0, span: ROW_BITS, first: true });
      col = ROW_BITS;
      if (seg.kind === 'payload') afterPayload = true;
      continue;
    }
    if (seg.inTrailer && !afterPayload) {
      col = ROW_BITS;
      afterPayload = true;
    }
    let remaining = seg.bits;
    let first = true;
    while (remaining > 0) {
      if (col >= ROW_BITS) newRow();
      const span = Math.min(remaining, ROW_BITS - col);
      result[row].push({ seg, row, col, span, first });
      col += span;
      remaining -= span;
      first = false;
    }
  }
  return result;
}

/** Octets of the header or trailer that contain at least one bit of the segment. */
export function byteRange(seg: Segment): [number, number] {
  return [Math.floor(seg.start / 8), Math.ceil((seg.start + seg.bits) / 8)];
}
