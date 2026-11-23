/**
 * A learning switch for the figure on network devices: it notes the source address of every frame
 * with the port it came in on, sends a frame to a known destination out of that one port, and floods
 * a frame for an unknown destination or the broadcast address out of all other ports. Entries that
 * see no traffic age out. This is the bridge behavior of IEEE 802.1Q, clause 8, reduced to one VLAN.
 */

export interface Host {
  id: string;
  mac: string;
  port: number;
}

/** Four hosts on ports 1 to 4. The addresses are locally administered, as used for examples. */
export const HOSTS: Host[] = [
  { id: 'A', mac: '02:00:00:00:00:0a', port: 1 },
  { id: 'B', mac: '02:00:00:00:00:0b', port: 2 },
  { id: 'C', mac: '02:00:00:00:00:0c', port: 3 },
  { id: 'D', mac: '02:00:00:00:00:0d', port: 4 },
];
export const PORTS = HOSTS.map((h) => h.port);
export const BROADCAST = 'ff:ff:ff:ff:ff:ff';

/** MAC address to port. */
export type Table = Record<string, number>;

export interface Delivery {
  /** Port the frame came in on. */
  inPort: number;
  /** Ports the frame was sent out of. */
  outPorts: number[];
  flooded: boolean;
  /** Entry learned or refreshed from the source address. */
  learned: { mac: string; port: number; isNew: boolean };
  /** Hosts that take the frame in; the others see a destination that is not theirs and drop it. */
  accepted: string[];
  table: Table;
}

export const hostById = (id: string) => {
  const h = HOSTS.find((x) => x.id === id);
  if (!h) throw new RangeError(`no host ${id}`);
  return h;
};

/** Sends one frame from host `from` to host `to`, or to everyone when `to` is 'broadcast'. */
export function send(table: Table, from: string, to: string): Delivery {
  const src = hostById(from);
  const dst = to === 'broadcast' ? BROADCAST : hostById(to).mac;
  const next: Table = { ...table, [src.mac]: src.port };
  const learned = { mac: src.mac, port: src.port, isNew: table[src.mac] !== src.port };
  const known = dst !== BROADCAST ? table[dst] : undefined;
  let outPorts: number[];
  let flooded: boolean;
  if (known === undefined) {
    outPorts = PORTS.filter((p) => p !== src.port);
    flooded = true;
  } else {
    // A frame is never sent back out of the port it came in on.
    outPorts = known === src.port ? [] : [known];
    flooded = false;
  }
  const accepted = HOSTS.filter((h) => outPorts.includes(h.port) && (dst === BROADCAST || h.mac === dst)).map((h) => h.id);
  return { inPort: src.port, outPorts, flooded, learned, accepted, table: next };
}

/** Time passes without traffic: every entry ages out. */
export const age = (): Table => ({});
