import { describe, expect, it } from 'vitest';
import { synFloodExchange as ex } from './exchange';
import type { Step } from '../../shared/schema';

const tcp = (s: Step) => s.captures[0].layers.find((l) => l.def.id === 'tcp')!;
const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const seq = (s: Step) => u32(tcp(s).bytes, 4);
const ack = (s: Step) => u32(tcp(s).bytes, 8);
const step = (id: string) => ex.steps.find((s) => s.id === id)!;
const value = (s: Step, layer: string, field: string) => s.captures[0].layers.find((l) => l.def.id === layer)?.values[field]?.display ?? '';

describe('SYN flood', () => {
  it('sends the flood from forged addresses outside the laptop\'s network', () => {
    for (const s of ex.steps.filter((x) => x.from === 'attacker')) expect(value(s, 'ipv4', 'src')).toMatch(/^198\.51\.100\./);
  });

  it('never gets an answer for SYN-ACKs sent to forged addresses', () => {
    for (const s of ex.steps.filter((x) => x.to === 'forged')) expect(s.lost).toBe(true);
  });

  it('packs t, MSS index and hash into the cookie, and the ACK returns cookie + 1', () => {
    const cookie = seq(step('cookie-synack'));
    expect(cookie >>> 27).toBe(19);
    expect((cookie >>> 24) & 0x7).toBe(3);
    expect(ack(step('cookie-ack'))).toBe((cookie + 1) >>> 0);
  });

  it('announces only MSS with a cookie, because the client sent no timestamps', () => {
    const opts = (s: Step) => tcp(s).bytes.length - 20;
    expect(opts(step('cookie-syn'))).toBe(12);
    expect(opts(step('cookie-synack'))).toBe(4);
  });

  it('drops the laptop\'s SYNs while the queue is full and retransmits with the same sequence number', () => {
    expect(step('victim-syn').lost && step('victim-retry').lost).toBe(true);
    expect(seq(step('victim-retry'))).toBe(seq(step('victim-syn')));
    expect(step('victim-retry').time - step('victim-syn').time).toBe(1000);
  });
});
