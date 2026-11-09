import { describe, expect, it } from 'vitest';
import { urlToPageExchange as ex } from './exchange';
import { tlsExchange } from '../../protocols/exchanges/tls';
import { CATALOG } from '../../protocols/catalog';
import { nestedBytes } from '../../shared/headers/stacks';
import type { Step } from '../../shared/schema';

const layer = (s: Step, id: string) => s.captures[0].layers.find((l) => l.def.id === id);
const display = (s: Step, l: string, f: string) => layer(s, l)?.values[f]?.display ?? '';
const frame = (s: Step) => nestedBytes(s.captures[0].layers.filter((l) => l.def.id !== 'phy'));

describe('From URL to page', () => {
  it('assigns every step to a known phase, phases in order and without gaps', () => {
    const ids = ex.phases!.map((p) => p.id);
    const seen: string[] = [];
    for (const s of ex.steps) {
      expect(ids, s.id).toContain(s.phase);
      if (seen.at(-1) !== s.phase) {
        expect(seen, `phase ${s.phase} appears twice`).not.toContain(s.phase);
        seen.push(s.phase!);
      }
    }
    expect(seen).toEqual(ids);
  });

  it('links every phase to an existing exchange', () => {
    const catalog = new Set(CATALOG.map((e) => e.id));
    for (const p of ex.phases!) expect(catalog, p.id).toContain(p.deepDive);
  });

  it('learns every fact once', () => {
    const labels = ex.steps.flatMap((s) => s.learned ?? []).map((l) => l.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('learns the server address from the DNS answer', () => {
    const answer = ex.steps.find((s) => s.id === 'dns-answer')!;
    const learned = answer.learned!.find((l) => l.label === 'Server IP')!.value;
    expect(display(answer, 'dns', 'answer')).toContain(learned);
    for (const s of ex.steps.filter((x) => x.phase === 'tcp' || x.phase === 'tls' || x.phase === 'http')) {
      expect([display(s, 'ipv4', 'src'), display(s, 'ipv4', 'dst')], s.id).toContain(learned);
    }
  });

  it('sends frames for the resolver directly to it, and frames for the web server to the gateway', () => {
    const resolverMac = ex.participants.find((p) => p.id === 'resolver')!.addr!.mac!;
    const routerMac = ex.participants.find((p) => p.id === 'router')!.addr!.mac!;
    for (const s of ex.steps.filter((x) => x.from === 'client')) {
      const dst = display(s, 'ethernet', 'dst');
      if (s.to === 'resolver' && s.phase === 'dns') expect(dst, s.id).toBe(resolverMac);
      if (s.to === 'server') expect(dst, s.id).toBe(routerMac);
    }
  });

  it('opens the connection the TLS exchange uses, with every segment of it', () => {
    const tlsSteps = ex.steps.filter((s) => s.phase === 'tls' || s.phase === 'http');
    expect(tlsSteps.map(frame)).toEqual(tlsExchange.steps.map(frame));
    const synAck = ex.steps.find((s) => s.id === 'tcp-synack')!;
    expect(display(synAck, 'tcp', 'srcPort')).toBe('443');
  });

  it('keeps send times causal: an answer is sent after its question', () => {
    const t = (id: string) => ex.steps.find((s) => s.id === id)!.time;
    // One way to the web server takes 15 ms: the ACK can only follow when the SYN-ACK arrived.
    expect(t('tcp-ack') - t('tcp-synack')).toBeGreaterThanOrEqual(15);
    expect(t('tls-client-hello')).toBeGreaterThan(t('tcp-ack'));
  });
});
