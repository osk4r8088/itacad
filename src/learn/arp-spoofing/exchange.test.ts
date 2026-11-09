import { describe, expect, it } from 'vitest';
import { arpSpoofingExchange as ex } from './exchange';
import type { Step } from '../../shared/schema';

const value = (s: Step, layer: string, field: string) => s.captures[0].layers.find((l) => l.def.id === layer)?.values[field]?.display ?? '';
const step = (id: string) => ex.steps.find((s) => s.id === id)!;
const attacker = ex.participants.find((p) => p.id === 'attacker')!.addr!;
const router = ex.participants.find((p) => p.id === 'router')!.addr!;
const laptop = ex.participants.find((p) => p.id === 'client')!.addr!;

describe('ARP spoofing', () => {
  it('forges replies that pair other hosts\' IP addresses with the attacker\'s MAC', () => {
    for (const s of ex.steps.filter((x) => x.category === 'attack' || x.id === 'dai-drop')) {
      expect(value(s, 'arp', 'oper')).toContain('reply');
      expect(value(s, 'arp', 'sha')).toBe(attacker.mac);
      expect([router.ipv4, laptop.ipv4]).toContain(value(s, 'arp', 'spa'));
    }
  });

  it('sends traffic to the attacker\'s MAC while the IP destination stays the server', () => {
    const s = step('mitm-request-in');
    expect(value(s, 'ethernet', 'dst')).toBe(attacker.mac);
    expect(value(s, 'ipv4', 'dst')).toBe('203.0.113.80');
  });

  it('leaves a trace in the TTL: one lower after the attacker forwarded', () => {
    expect(Number(value(step('mitm-request-out'), 'ipv4', 'ttl'))).toBe(Number(value(step('normal-request'), 'ipv4', 'ttl')) - 1);
    expect(Number(value(step('mitm-reply-out'), 'ipv4', 'ttl'))).toBe(Number(value(step('normal-reply'), 'ipv4', 'ttl')) - 1);
  });

  it('shows the poisoned cache entries change and recover', () => {
    const entries = ex.steps.flatMap((s) => (s.learned ?? []).filter((l) => l.label.startsWith('Laptop')).map((l) => l.value));
    expect(entries).toEqual([`${router.mac} (router)`, `${attacker.mac} (attacker)`, `${router.mac} (router)`]);
  });

  it('drops the forged reply at the switch when Dynamic ARP Inspection is on', () => {
    expect(step('dai-drop').lost).toBe(true);
    expect(value(step('dai-ping'), 'ethernet', 'dst')).toBe(router.mac);
  });
});
