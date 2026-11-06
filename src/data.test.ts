import { describe, expect, it } from 'vitest';
import { exchanges } from './exchanges';
import type { Capture, LayerInstance } from './schema';
import { concat, crc32, internetChecksum } from './lib/encode';
import { innerLengths } from './components/PacketView';
import { ipv4Fragments } from './exchanges/ipv4';
import { ntpTiming } from './exchanges/ntp';

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
      for (const extra of s.extraPaths ?? []) {
        expect(extra[0], `${s.id} extra path starts at sender`).toBe(s.from);
        for (let i = 1; i < extra.length; i++) expect(linkBetween(extra[i - 1], extra[i]), `${s.id} extra hop ${i}`).toBeDefined();
      }
      const pathLinks = [s.path, ...(s.extraPaths ?? [])].flatMap((path) => path.slice(1).map((id, i) => linkBetween(path[i], id)!.id));
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
          if (l.def.id === 'udp') {
            const ip = c.layers[i - 1];
            const fragmented = (ip.bytes[6] & 0x20) !== 0 || ((ip.bytes[6] & 0x1f) << 8 | ip.bytes[7]) !== 0;
            if (!fragmented) {
              const dgram = wire(c.layers, i);
              expect(u16(l.bytes, 4), `${s.id} UDP Length`).toBe(dgram.length);
              const pseudo = concat(ip.bytes.subarray(12, 20), Uint8Array.of(0, 17, dgram.length >> 8, dgram.length & 0xff));
              expect(internetChecksum(concat(pseudo, dgram)), `${s.id} UDP checksum`).toBe(0);
            }
          }
          if (l.def.id.startsWith('icmp-')) {
            expect(c.layers[i - 1].bytes[9], `${s.id} IPv4 protocol 1`).toBe(1);
            expect(internetChecksum(wire(c.layers, i)), `${s.id} ICMP checksum`).toBe(0);
            if (l.values.original) expect(c.layers[i - 1].bytes.length + wire(c.layers, i).length, `${s.id} ICMP error at most 576 octets`).toBeLessThanOrEqual(576);
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

describe.each(exchanges.filter((e) => e.steps.some((s) => layer(s.captures[0], 'tcp'))).map((e) => [e.id, e] as const))('TCP sequence numbers in %s', (_id, ex) => {
  it('every segment continues its stream and acknowledges what the peer has sent so far', () => {
    // Per connection (address and port pair) and direction: the next sequence number expected.
    const next: Record<string, number> = {};
    for (const s of ex.steps) {
      const c = s.captures[0];
      const t = layer(c, 'tcp');
      if (!t) continue;
      const ip = layer(c, 'ipv4')!.bytes;
      const end = (o: number, p: number) => `${[...ip.subarray(o, o + 4)].join('.')}:${u16(t.bytes, p)}`;
      const [me, peer] = [end(12, 0), end(16, 2)];
      const flags = t.bytes[13];
      const syn = !!(flags & 0x02);
      const fin = !!(flags & 0x01);
      const ackFlag = !!(flags & 0x10);
      const seq = u32(t.bytes, 4);
      const ack = u32(t.bytes, 8);
      const dataLen = c.layers.slice(c.layers.indexOf(t) + 1).reduce((n, l) => n + l.bytes.length, 0);
      // Exchanges may start on an open connection; the first segment seen from a side sets its stream.
      if (!syn && next[me] !== undefined) expect(seq, `${s.id} seq continues the stream`).toBe(next[me]);
      if (ackFlag && next[peer] !== undefined) expect(ack, `${s.id} ack`).toBe(next[peer]);
      if (ackFlag && next[peer] === undefined) next[peer] = ack;
      next[me] = (seq + (syn ? 1 : 0) + dataLen + (fin ? 1 : 0)) >>> 0;
    }
  });
});

describe('TCP exchange', () => {
  const ex = exchanges.find((e) => e.id === 'tcp')!;

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

describe('IPv4 fragmentation', () => {
  it('the fragments reassemble into the original datagram', () => {
    const { original, fragments } = ipv4Fragments;
    const ipOf = (c: Capture) => c.layers.find((l) => l.def.id === 'ipv4')!;
    const payloadOf = (c: Capture) => wire(c.layers, c.layers.indexOf(ipOf(c)) + 1);
    const whole = payloadOf(original);
    const rebuilt = new Uint8Array(whole.length);
    let covered = 0;
    let sawLast = false;
    for (const f of fragments) {
      const h = ipOf(f).bytes;
      expect(u16(h, 4), 'same Identification').toBe(u16(ipOf(original).bytes, 4));
      const offset = ((h[6] & 0x1f) << 8 | h[7]) * 8;
      const mf = (h[6] & 0x20) !== 0;
      const data = payloadOf(f);
      if (mf) expect(data.length % 8, 'non-last fragments carry multiples of 8 octets').toBe(0);
      else sawLast = true;
      expect(20 + data.length, 'fragment fits the MTU of 1000').toBeLessThanOrEqual(1000);
      rebuilt.set(data, offset);
      covered += data.length;
    }
    expect(sawLast).toBe(true);
    expect(covered).toBe(whole.length);
    expect(rebuilt).toEqual(whole);
  });
});

describe('ICMP errors quote the original packet', () => {
  it('each quote is a prefix of the packet that caused it', () => {
    const icmp = exchanges.find((e) => e.id === 'icmp')!;
    const quote = (stepId: string) => {
      const c = icmp.steps.find((s) => s.id === stepId)!.captures[0];
      const l = c.layers.find((x) => x.def.id === 'icmp-time-exceeded')!;
      return l.bytes.subarray(8);
    };
    const probe1 = icmp.steps.find((s) => s.id === 'probe-1')!.captures[0];
    const ipIdx = probe1.layers.findIndex((l) => l.def.id === 'ipv4');
    expect(quote('te-1')).toEqual(wire(probe1.layers, ipIdx));
    // The probe for hop 8 arrives at Router B with TTL 1.
    expect(quote('te-8')[8]).toBe(1);
  });

  it('an Echo Reply checksum differs from the request by 0x0800 when only Type changes', () => {
    const icmp = exchanges.find((e) => e.id === 'icmp')!;
    const sum = (id: string) => u16(icmp.steps.find((s) => s.id === id)!.captures[0].layers.find((l) => l.def.id === 'icmp-echo')!.bytes, 2);
    let expected = sum('ping-request') + 0x0800;
    expected = (expected & 0xffff) + (expected >>> 16);
    expect(sum('ping-reply')).toBe(expected);
  });
});

// ---- application protocols over UDP

const appLayer = (c: Capture, id: string) => {
  const l = layer(c, id);
  if (!l) throw new Error(`no ${id} layer`);
  return l;
};

/** Reads a DNS name at `offset`, following compression pointers (RFC 1035 section 4.1.4). */
function readName(msg: Uint8Array, offset: number): { name: string; end: number } {
  const labels: string[] = [];
  let pos = offset;
  let end = -1;
  for (let jumps = 0; jumps < 20; jumps++) {
    const len = msg[pos];
    if (len === 0) return { name: labels.join('.'), end: end < 0 ? pos + 1 : end };
    if ((len & 0xc0) === 0xc0) {
      if (end < 0) end = pos + 2;
      const target = ((len & 0x3f) << 8) | msg[pos + 1];
      expect(target, 'pointer points backwards').toBeLessThan(pos);
      pos = target;
      continue;
    }
    labels.push(new TextDecoder().decode(msg.subarray(pos + 1, pos + 1 + len)));
    pos += 1 + len;
  }
  throw new Error('pointer loop');
}

describe('DHCP messages', () => {
  const ex = exchanges.find((e) => e.id === 'dhcp')!;
  const types = [1, 2, 3, 5];
  it('have a 236-octet fixed part, the magic cookie, the right message type and End', () => {
    ex.steps.forEach((s, i) => {
      const m = appLayer(s.captures[0], 'dhcp').bytes;
      expect(u32(m, 236), `${s.id} cookie`).toBe(0x63825363);
      // Walk the options: code, length, value; stop at End.
      let pos = 240;
      const seen = new Map<number, Uint8Array>();
      while (m[pos] !== 255) {
        seen.set(m[pos], m.subarray(pos + 2, pos + 2 + m[pos + 1]));
        pos += 2 + m[pos + 1];
        expect(pos, `${s.id} options inside the message`).toBeLessThan(m.length);
      }
      expect(pos, `${s.id} End is the last octet`).toBe(m.length - 1);
      expect(seen.get(53)?.[0], `${s.id} message type`).toBe(types[i]);
      expect(u32(m, 4), `${s.id} same xid`).toBe(u32(appLayer(ex.steps[0].captures[0], 'dhcp').bytes, 4));
      // Offer and Ack must carry Server Identifier and Lease Time (RFC 2131 Table 3).
      if (types[i] === 2 || types[i] === 5) expect(seen.has(54) && seen.has(51), s.id).toBe(true);
      // A Request in SELECTING state must carry Requested IP Address and Server Identifier (RFC 2131 4.3.2).
      if (types[i] === 3) expect(seen.has(50) && seen.has(54), s.id).toBe(true);
      // Discover must not carry a Server Identifier (RFC 2131 Table 5).
      if (types[i] === 1) expect(seen.has(54), s.id).toBe(false);
    });
  });
});

describe('DNS messages', () => {
  const ex = exchanges.find((e) => e.id === 'dns')!;
  it('decode to the names and counts shown, with valid compression pointers', () => {
    for (const s of ex.steps) {
      const l = appLayer(s.captures[0], 'dns');
      const m = l.bytes;
      const counts = [u16(m, 4), u16(m, 6), u16(m, 8), u16(m, 10)];
      expect(counts, s.id).toEqual(['question', 'answer', 'authority', 'additional'].map((f) => l.values[f].items?.length ?? 0));
      const q = readName(m, 12);
      expect(q.name, `${s.id} QNAME`).toBe('www.example.com');
      let pos = q.end + 4;
      for (const section of ['answer', 'authority', 'additional'])
        for (const rr of l.values[section].items ?? []) {
          const n = readName(m, pos);
          expect(rr.values.name.display.startsWith(n.name), `${s.id} ${section} name ${n.name}`).toBe(true);
          const type = u16(m, n.end);
          const rdlen = u16(m, n.end + 8);
          const rdata = n.end + 10;
          if (type === 2) expect(rr.values.rdata.display.startsWith(readName(m, rdata).name), `${s.id} NS target`).toBe(true);
          if (type === 1) expect([...m.subarray(rdata, rdata + 4)].join('.'), `${s.id} A`).toBe(rr.values.rdata.display);
          pos = rdata + rdlen;
        }
      expect(pos, `${s.id} message fully parsed`).toBe(m.length);
    }
  });

  it('every response carries the ID of the query it answers', () => {
    const ids = ex.steps.map((s) => u16(appLayer(s.captures[0], 'dns').bytes, 0));
    expect(ids[0]).toBe(ids[7]);
    for (const i of [1, 3, 5]) expect(ids[i]).toBe(ids[i + 1]);
  });
});

describe('NTP timestamps', () => {
  const ex = exchanges.find((e) => e.id === 'ntp')!;
  const ts = (m: Uint8Array, o: number) => (BigInt(u32(m, o)) << 32n) | BigInt(u32(m, o + 4));
  it('the response echoes T1 and the offset and delay follow from the packets', () => {
    const req = appLayer(ex.steps[0].captures[0], 'ntp').bytes;
    const res = appLayer(ex.steps[1].captures[0], 'ntp').bytes;
    expect(req.length).toBe(48);
    expect(ts(res, 24), 'Origin = request Transmit').toBe(ts(req, 40));
    // Convert to microseconds since T0 and recompute the RFC 5905 section 8 formulas.
    const T0 = BigInt(ntpTiming.T0) + 2208988800n;
    const us = (t: bigint) => Number(((t >> 32n) - T0) * 1000000n + (((t & 0xffffffffn) * 1000000n + (1n << 31n)) >> 32n));
    const [t1, t2, t3] = [us(ts(res, 24)), us(ts(res, 32)), us(ts(res, 40))];
    const t4 = ntpTiming.t4;
    expect([t1, t2, t3]).toEqual([ntpTiming.t1, ntpTiming.t2, ntpTiming.t3]);
    expect((t2 - t1 + (t3 - t4)) / 2).toBe(ntpTiming.offset);
    expect(t4 - t1 - (t3 - t2)).toBe(ntpTiming.delay);
  });
});

describe('Text protocols over TCP', () => {
  const text = (b: Uint8Array) => new TextDecoder().decode(b);
  it('HTTP Content-Length matches the body, and responses without one have no body', () => {
    for (const s of exchanges.find((e) => e.id === 'http1')!.steps) {
      const h = appLayer(s.captures[0], 'http');
      const headers = h.values.headers.display;
      const body = h.values.body.bits / 8;
      const m = /Content-Length: (\d+)/.exec(headers);
      if (m) expect(Number(m[1]), s.id).toBe(body);
      else expect(body, s.id).toBe(0);
      expect(text(h.bytes).endsWith('\r\n\r\n') || body > 0, `${s.id} header section ends with an empty line`).toBe(true);
    }
  });

  it('every SMTP, FTP and IMAP line ends with CR LF', () => {
    for (const id of ['smtp', 'ftp', 'imap'])
      for (const s of exchanges.find((e) => e.id === id)!.steps) {
        const l = layer(s.captures[0], id);
        if (l) expect(text(l.bytes).endsWith('\r\n'), `${id} ${s.id}`).toBe(true);
      }
  });

  it('the IMAP literal has exactly the announced length', () => {
    const s = exchanges.find((e) => e.id === 'imap')!.steps.find((x) => x.id === 'fetched')!;
    const l = appLayer(s.captures[0], 'imap');
    const n = Number(/\{(\d+)\}\r\n$/.exec(text(l.bytes.subarray(0, l.values.untagged.bits / 8)))![1]);
    expect(l.values.literal.bits / 8).toBe(n);
  });

  it('the FTP 227 reply encodes the port of the data connection', () => {
    const steps = exchanges.find((e) => e.id === 'ftp')!.steps;
    const reply = text(appLayer(steps.find((x) => x.id === 'passive')!.captures[0], 'ftp').bytes);
    const [, , , , p1, p2] = /\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/.exec(reply)!.slice(1).map(Number);
    const syn = layer(steps.find((x) => x.id === 'data-syn')!.captures[0], 'tcp')!;
    expect(u16(syn.bytes, 2)).toBe(p1 * 256 + p2);
  });
});
