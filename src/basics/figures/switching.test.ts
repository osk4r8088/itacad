import { describe, expect, it } from 'vitest';
import { HOSTS, PORTS, age, send, type Table } from './switching';

describe('the learning switch', () => {
  it('floods a frame for an unknown address out of all other ports and learns the sender', () => {
    const d = send({}, 'A', 'C');
    expect(d.flooded).toBe(true);
    expect(d.outPorts).toEqual([2, 3, 4]);
    expect(d.accepted).toEqual(['C']);
    expect(d.table).toEqual({ '02:00:00:00:00:0a': 1 });
    expect(d.learned.isNew).toBe(true);
  });

  it('sends the answer out of one port only, because the first frame taught it where A is', () => {
    const first = send({}, 'A', 'C');
    const reply = send(first.table, 'C', 'A');
    expect(reply.flooded).toBe(false);
    expect(reply.outPorts).toEqual([1]);
    expect(reply.accepted).toEqual(['A']);
    expect(Object.keys(reply.table)).toHaveLength(2);
  });

  it('always floods a broadcast, even when everything is known, and every other host takes it in', () => {
    let t: Table = {};
    for (const h of HOSTS) t = send(t, h.id, 'broadcast').table;
    const d = send(t, 'B', 'broadcast');
    expect(d.flooded).toBe(true);
    expect(d.outPorts).toEqual([1, 3, 4]);
    expect(d.accepted).toEqual(['A', 'C', 'D']);
  });

  it('never sends a frame back out of the port it came in on', () => {
    for (const from of HOSTS)
      for (const to of [...HOSTS.map((h) => h.id), 'broadcast']) {
        let t: Table = {};
        for (const h of HOSTS) t = send(t, h.id, 'broadcast').table;
        expect(send(t, from.id, to).outPorts).not.toContain(from.port);
        expect(send({}, from.id, to).outPorts).not.toContain(from.port);
      }
  });

  it('refreshes a known entry without counting it as new', () => {
    const t = send({}, 'A', 'B').table;
    expect(send(t, 'A', 'B').learned.isNew).toBe(false);
  });

  it('forgets everything when the entries age out, and floods again', () => {
    const t = send(send({}, 'A', 'C').table, 'C', 'A').table;
    expect(send(t, 'C', 'A').flooded).toBe(false);
    expect(send(age(), 'C', 'A').flooded).toBe(true);
  });

  it('puts each host on its own port', () => {
    expect(new Set(PORTS).size).toBe(HOSTS.length);
    expect(() => send({}, 'X', 'A')).toThrow(RangeError);
  });
});
