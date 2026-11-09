import { describe, expect, it } from 'vitest';
import { available, run, SCENARIOS, STATES, TRANSITIONS, type State } from './logic';
import { tcpExchange } from '../../protocols/exchanges/tcp';

describe('TCP state machine', () => {
  it('has the 20 transitions of RFC 9293 Figure 5', () => {
    expect(TRANSITIONS.filter((t) => t.inFigure)).toHaveLength(20);
  });

  it('has unique transition ids', () => {
    const ids = TRANSITIONS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reaches every state from CLOSED and can always get back to CLOSED', () => {
    const reach = (from: State, edges: (s: State) => State[]) => {
      const seen = new Set<State>([from]);
      const queue = [from];
      while (queue.length) for (const n of edges(queue.shift()!)) if (!seen.has(n)) seen.add(n), queue.push(n);
      return seen;
    };
    const forward = reach('CLOSED', (s) => TRANSITIONS.filter((t) => t.from === s).map((t) => t.to));
    expect([...forward].sort()).toEqual([...STATES].sort());
    const backward = reach('CLOSED', (s) => TRANSITIONS.filter((t) => t.to === s).map((t) => t.from));
    expect([...backward].sort()).toEqual([...STATES].sort());
  });

  it('offers exactly one way out of LISTEN on RST from SYN-RECEIVED, depending on how it was reached', () => {
    const passive = run(['passive-open', 'listen-syn']);
    expect(available('SYN-RECEIVED', passive.ctx).filter((t) => t.event === 'rcv RST').map((t) => t.to)).toEqual(['LISTEN']);
    const active = run(['active-open', 'synsent-syn']);
    expect(available('SYN-RECEIVED', active.ctx).filter((t) => t.event === 'rcv RST').map((t) => t.to)).toEqual(['CLOSED']);
  });

  it.each(SCENARIOS.map((s) => [s.id, s] as const))('scenario %s is a valid path', (_id, s) => {
    expect(() => run(s.path)).not.toThrow();
  });

  it('client and server scenarios end in CLOSED', () => {
    expect(run(SCENARIOS.find((s) => s.id === 'client')!.path).states.at(-1)).toBe('CLOSED');
    expect(run(SCENARIOS.find((s) => s.id === 'server')!.path).states).toEqual(['CLOSED', 'LISTEN', 'SYN-RECEIVED', 'ESTABLISHED', 'CLOSE-WAIT', 'LAST-ACK', 'CLOSED']);
  });

  it('rejects impossible transitions', () => {
    expect(() => run(['estab-close'])).toThrow();
  });
});

describe('links to the TCP exchange', () => {
  const steps = tcpExchange.steps;
  it.each(TRANSITIONS.filter((t) => t.exchange).map((t) => [t.id, t] as const))('%s matches the state shown in the exchange', (_id, t) => {
    const index = steps.findIndex((s) => s.id === t.exchange!.step);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(steps[index].states?.[t.exchange!.participant]).toBe(t.to);
    // The state before this step matches the start of the transition.
    let before: string | undefined = tcpExchange.initialStates?.[t.exchange!.participant];
    for (const s of steps.slice(0, index)) before = s.states?.[t.exchange!.participant] ?? before;
    expect(before).toBe(t.from);
  });
});

describe('step list and diagram', () => {
  it('lists the steps of the TCP exchange in order', async () => {
    const { TCP_STEP_IDS } = await import('./steps');
    expect(TCP_STEP_IDS).toEqual(tcpExchange.steps.map((s) => s.id));
  });

  it('draws every transition of the figure plus the FIN-WAIT-1 shortcut, and nothing else', async () => {
    const { EDGES, NODES } = await import('./diagram');
    const drawn = EDGES.map((e) => e.id).sort();
    const expected = TRANSITIONS.filter((t) => t.inFigure || t.id === 'fw1-finack').map((t) => t.id).sort();
    expect(drawn).toEqual(expected);
    expect(new Set(NODES.map((n) => n.state))).toEqual(new Set(STATES));
  });
});
