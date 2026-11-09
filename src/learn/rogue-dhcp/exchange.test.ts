import { describe, expect, it } from 'vitest';
import { rogueDhcpExchange as ex } from './exchange';
import type { Step } from '../../shared/schema';

const value = (s: Step, layer: string, field: string) => s.captures[0].layers.find((l) => l.def.id === layer)?.values[field]?.display ?? '';
const step = (id: string) => ex.steps.find((s) => s.id === id)!;
const rogue = ex.participants.find((p) => p.id === 'attacker')!.addr!;

describe('Rogue DHCP server', () => {
  it('names itself as router and DNS server in its offer', () => {
    const opts = value(step('rogue-offer'), 'dhcp', 'options');
    expect(opts).toContain(`Router ${rogue.ipv4}`);
    expect(opts).toContain(rogue.ipv4);
  });

  it('answers before the real server and is the server the laptop requests', () => {
    expect(step('rogue-offer').time).toBeLessThan(step('real-offer').time);
    expect(step('request').to).toBe('attacker');
  });

  it('receives the laptop\'s DNS query afterwards', () => {
    expect(value(step('dns-query'), 'ipv4', 'dst')).toBe(rogue.ipv4);
    expect(value(step('dns-query'), 'ethernet', 'dst')).toBe(rogue.mac);
  });

  it('is blocked at its untrusted port when snooping is on', () => {
    const drop = step('snoop-drop');
    expect(drop.lost).toBe(true);
    expect(drop.captures[0].link).toBe('p-att');
    expect(ex.steps.filter((s) => s.phase === 'defense' && s.from === 'attacker' && !s.lost)).toEqual([]);
  });
});
