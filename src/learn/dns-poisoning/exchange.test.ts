import { describe, expect, it } from 'vitest';
import { dnsPoisoningExchange as ex } from './exchange';
import type { Step } from '../../shared/schema';

const value = (s: Step, layer: string, field: string) => s.captures[0].layers.find((l) => l.def.id === layer)?.values[field]?.display ?? '';
const step = (id: string) => ex.steps.find((s) => s.id === id)!;
const dnsId = (s: Step) => value(s, 'dns', 'id').split(' ')[0];
const port = (s: Step, field: 'srcPort' | 'dstPort') => value(s, 'udp', field).split(' ')[0];

describe('DNS cache poisoning', () => {
  it('accepts the forged answer whose ID and port match the query, and rejects the others', () => {
    const query = step('trigger-up');
    expect(dnsId(step('forged-hit'))).toBe(dnsId(query));
    expect(port(step('forged-hit'), 'dstPort')).toBe(port(query, 'srcPort'));
    expect(dnsId(step('forged-miss'))).not.toBe(dnsId(query));
  });

  it('forges the name server\'s address as the source', () => {
    const auth = ex.participants.find((p) => p.id === 'auth')!.addr!.ipv4;
    for (const id of ['forged-miss', 'forged-hit', 'defense-miss']) expect(value(step(id), 'ipv4', 'src')).toBe(auth);
  });

  it('sends the next query to the address planted in the glue record', () => {
    const attacker = ex.participants.find((p) => p.id === 'attacker')!.addr!.ipv4!;
    expect(value(step('forged-hit'), 'dns', 'additional')).toContain(attacker);
    expect(value(step('effect-up'), 'ipv4', 'dst')).toBe(attacker);
  });

  it('defends by port: a forged answer with the right ID still misses the random port', () => {
    const query = step('defense-up');
    expect(dnsId(step('defense-miss'))).toBe(dnsId(query));
    expect(port(step('defense-miss'), 'dstPort')).not.toBe(port(query, 'srcPort'));
    expect(port(step('defense-answer'), 'dstPort')).toBe(port(query, 'srcPort'));
  });
});
