import { describe, expect, it } from 'vitest';
import { exchanges } from './exchanges';
import type { Capture, LayerInstance } from './schema';
import { concat, crc32, internetChecksum } from './lib/encode';
import { innerLengths } from './components/PacketView';

const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];

function wire(layers: LayerInstance[], from: number): Uint8Array {
  if (from >= layers.length) return new Uint8Array(0);
  const l = layers[from];
  return concat(l.bytes, wire(layers, from + 1), l.trailerBytes ?? new Uint8Array(0));
}

const layer = (c: Capture, id: string) => c.layers.find((l) => l.def.id === id);

describe.each(exchanges.map((e) => [e.id, e] as const))('exchange %s', (_id, ex) => {
  const pIds = new Set(ex.participants.map((p) => p.id));
  const linkIds = new Set(ex.links.map((l) => l.id));
  const lifelines = new Set(ex.participants.filter((p) => p.lifeline).map((p) => p.id));
  const linkBetween = (a: string, b: string) => ex.links.find((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));

  it('has unique ids', () => {
    expect(pIds.size).toBe(ex.participants.length);
    expect(linkIds.size).toBe(ex.links.length);
    expect(new Set(ex.steps.map((s) => s.id)).size).toBe(ex.steps.length);
  });

  it('references only existing participants and links', () => {
    for (const l of ex.links) expect(pIds.has(l.a) && pIds.has(l.b), l.id).toBe(true);
    for (const id of Object.keys(ex.initialStates ?? {})) expect(lifelines.has(id), id).toBe(true);
    for (const s of ex.steps) {
      expect(lifelines.has(s.from), `${s.id} from`).toBe(true);
      expect(lifelines.has(s.to), `${s.id} to`).toBe(true);
      expect(s.path[0]).toBe(s.from);
      expect(s.path.at(-1)).toBe(s.to);
      for (let i = 1; i < s.path.length; i++) expect(linkBetween(s.path[i - 1], s.path[i]), `${s.id} hop ${i}`).toBeDefined();
      for (const id of Object.keys(s.states ?? {})) expect(lifelines.has(id), `${s.id} state ${id}`).toBe(true);
      const pathLinks = s.path.slice(1).map((id, i) => linkBetween(s.path[i], id)!.id);
      for (const c of s.captures) expect(pathLinks, `${s.id} capture ${c.link}`).toContain(c.link);
    }
  });

  it('flow table data is consistent', () => {
    const cats = new Set(ex.categories.map((c) => c.id));
    let last = -Infinity;
    for (const s of ex.steps) {
      expect(cats.has(s.category), `${s.id} category ${s.category}`).toBe(true);
      expect(s.time, `${s.id} time is not before the previous step`).toBeGreaterThanOrEqual(last);
      last = s.time;
      expect(s.info.length).toBeGreaterThan(0);
    }
  });

  it('key fields exist in the default capture', () => {
    for (const s of ex.steps) {
      expect(s.captures.length, s.id).toBeGreaterThan(0);
      for (const k of s.details.keyFields) {
        const l = layer(s.captures[0], k.layer);
        expect(l, `${s.id}: layer ${k.layer}`).toBeDefined();
        expect(l!.values[k.field], `${s.id}: field ${k.layer}.${k.field}`).toBeDefined();
      }
    }
  });

  it('every field of every layer has a value with the declared size', () => {
    for (const s of ex.steps)
      for (const c of s.captures)
        for (const l of c.layers) {
          const ids = [...l.def.fields, ...(l.def.trailer ?? [])].map((f) => f.id);
          expect(new Set(ids).size, `${l.def.id} field ids unique`).toBe(ids.length);
          for (const f of [...l.def.fields, ...(l.def.trailer ?? [])]) {
            const v = l.values[f.id];
            expect(v, `${s.id} ${l.def.id}.${f.id}`).toBeDefined();
            if (f.bits !== 'variable') expect(v.bits).toBe(f.bits);
          }
        }
  });

  it('encodes consistent lengths and checksums', () => {
    for (const s of ex.steps)
      for (const c of s.captures) {
        const inner = innerLengths(c.layers);
        c.layers.forEach((l, i) => {
          const sum = l.def.fields.reduce((n, f) => n + l.values[f.id].bits, 0);
          expect(sum, `${s.id} ${l.def.id} header bits`).toBe(l.bytes.length * 8);
          if (l.def.id === 'ipv4') {
            expect(internetChecksum(l.bytes), `${s.id} IPv4 checksum`).toBe(0);
            expect(u16(l.bytes, 2), `${s.id} IPv4 Total Length`).toBe(l.bytes.length + inner[i]);
            expect((l.bytes[0] & 0x0f) * 4).toBe(l.bytes.length);
          }
          if (l.def.id === 'tcp') {
            const ip = c.layers[i - 1];
            expect(ip.def.id).toBe('ipv4');
            const segment = wire(c.layers, i);
            const pseudo = concat(ip.bytes.subarray(12, 20), Uint8Array.of(0, 6, segment.length >> 8, segment.length & 0xff));
            expect(internetChecksum(concat(pseudo, segment)), `${s.id} TCP checksum`).toBe(0);
            expect((l.bytes[12] >> 4) * 4, `${s.id} Data Offset`).toBe(l.bytes.length);
          }
          if (l.def.id === 'ethernet') {
            const frame = wire(c.layers, i);
            expect(frame.length, `${s.id} minimum frame size`).toBeGreaterThanOrEqual(64);
            // CRC-32 over a frame including a correct FCS leaves the constant residue 0x2144DF1C.
            expect(crc32(frame), `${s.id} FCS`).toBe(0x2144df1c);
          }
        });
      }
  });

  it('lists unverified statements', () => {
    const found: string[] = [];
    for (const s of ex.steps)
      for (const c of s.captures)
        for (const l of c.layers)
          for (const [id, v] of Object.entries(l.values)) if (v.unverified) found.push(`${s.id} ${c.link} ${l.def.id}.${id}: ${v.unverified}`);
    if (found.length) console.info(`[${ex.id}] unverified:\n  ${[...new Set(found)].join('\n  ')}`);
    expect(Array.isArray(found)).toBe(true);
  });
});

describe('TCP sequence numbers', () => {
  const ex = exchanges.find((e) => e.id === 'tcp')!;

  it('every ACK acknowledges exactly what the peer has sent so far', () => {
    const next: Record<string, number> = {};
    for (const s of ex.steps) {
      const c = s.captures[0];
      const t = layer(c, 'tcp')!;
      const flags = t.bytes[13];
      const syn = !!(flags & 0x02);
      const fin = !!(flags & 0x01);
      const ackFlag = !!(flags & 0x10);
      const seq = u32(t.bytes, 4);
      const ack = u32(t.bytes, 8);
      const dataLen = c.layers.slice(c.layers.indexOf(t) + 1).reduce((n, l) => n + l.bytes.length, 0);
      if (!syn) expect(seq, `${s.id} seq continues the stream`).toBe(next[s.from]);
      if (ackFlag) expect(ack, `${s.id} ack`).toBe(next[s.to]);
      next[s.from] = (seq + (syn ? 1 : 0) + dataLen + (fin ? 1 : 0)) >>> 0;
    }
  });

  it('the same segment looks the same on both links apart from TTL and checksum', () => {
    for (const s of ex.steps) {
      const [a, b] = s.captures;
      expect(layer(a, 'tcp')!.bytes).toEqual(layer(b, 'tcp')!.bytes);
      const ipA = layer(a, 'ipv4')!.bytes;
      const ipB = layer(b, 'ipv4')!.bytes;
      expect(Math.abs(ipA[8] - ipB[8]), `${s.id} TTL difference`).toBe(8);
      expect(ipA.subarray(12)).toEqual(ipB.subarray(12));
    }
  });
});
