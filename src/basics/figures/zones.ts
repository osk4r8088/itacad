/**
 * Where an application runs and what survives which failure, for the figure on regions and zones.
 * It follows the text of the topic: copies in different zones behind a load balancer survive the loss
 * of a zone if the rest can carry the full load; a second region takes over only when the whole first
 * region is lost, and with asynchronous replication it lags a little behind.
 */

export const REGIONS = ['Region 1', 'Region 2'];
export const ZONES = ['a', 'b', 'c'];
export const zoneId = (region: number, zone: string) => `${region + 1}${zone}`;
export const ALL_ZONES = REGIONS.flatMap((_, r) => ZONES.map((z) => zoneId(r, z)));

export type Layout = 'one-zone' | 'two-zones' | 'three-zones' | 'two-regions';
export type Sizing = 'just-enough' | 'one-spare';

export interface Deployment {
  /** Zones that serve traffic. */
  active: string[];
  /** Zones in another region that take over when all active zones are lost. */
  standby: string[];
}

export const LAYOUTS: { id: Layout; label: string }[] = [
  { id: 'one-zone', label: 'One zone' },
  { id: 'two-zones', label: 'Two zones' },
  { id: 'three-zones', label: 'Three zones' },
  { id: 'two-regions', label: 'Two zones and a second region' },
];

export function deploy(layout: Layout): Deployment {
  switch (layout) {
    case 'one-zone':
      return { active: ['1a'], standby: [] };
    case 'two-zones':
      return { active: ['1a', '1b'], standby: [] };
    case 'three-zones':
      return { active: ['1a', '1b', '1c'], standby: [] };
    case 'two-regions':
      return { active: ['1a', '1b'], standby: ['2a', '2b'] };
  }
}

export type Status = 'up' | 'overloaded' | 'failed-over' | 'down';

export interface Outcome {
  status: Status;
  serving: string[];
  explanation: string;
}

/**
 * `failed` holds the zones that are out. With 'just-enough', the copies together carry the normal load
 * and nothing more; with 'one-spare', they can lose one zone and still carry it.
 */
export function evaluate(layout: Layout, sizing: Sizing, failed: ReadonlySet<string>): Outcome {
  const d = deploy(layout);
  const alive = d.active.filter((z) => !failed.has(z));
  const lost = d.active.length - alive.length;
  if (alive.length > 0) {
    if (lost === 0) return { status: 'up', serving: alive, explanation: d.active.length === 1 ? 'The application runs as planned, in one zone.' : `All ${d.active.length} copies run as planned, and the load balancer spreads the traffic over them.` };
    const enough = sizing === 'one-spare' ? lost <= 1 : false;
    if (enough)
      return { status: 'up', serving: alive, explanation: `The load balancer sends all traffic to ${alive.join(' and ')}. They were sized to carry the full load without one zone, so users notice nothing.` };
    return {
      status: 'overloaded',
      serving: alive,
      explanation: `The load balancer sends all traffic to ${alive.join(' and ')}, but ${alive.length === 1 ? 'it was' : 'they were'} sized only for ${alive.length} of ${d.active.length} parts of the load. The application is reachable and slow, or rejects some requests.`,
    };
  }
  const spare = d.standby.filter((z) => !failed.has(z));
  if (spare.length > 0)
    return {
      status: 'failed-over',
      serving: spare,
      explanation: `Every zone in use in region 1 is out. Traffic is switched to region 2. Its data was replicated asynchronously, so the last moments of writes before the failure may be missing.`,
    };
  return {
    status: 'down',
    serving: [],
    explanation: d.standby.length ? 'Both regions are out. Nothing is left to serve.' : `The application ran only in ${d.active.join(' and ')}, and ${d.active.length === 1 ? 'that zone is' : 'those zones are'} out. It is down until ${d.active.length === 1 ? 'the zone returns' : 'a zone returns'} or it is set up elsewhere.`,
  };
}
