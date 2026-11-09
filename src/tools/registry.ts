import type { HubEntry } from '../shared/hub';

/**
 * All tools. To add one: create src/tools/<id>/ with its logic, tests and a component
 * with a default export, then set status 'ready' and
 * component: lazy(() => import('./<id>/<Component>')).
 */
export const TOOLS: HubEntry[] = [
  {
    id: 'subnet',
    title: 'Subnet calculator',
    summary: 'Network, broadcast, host range and mask of an IPv4 prefix, bit by bit.',
    status: 'planned',
    issue: 3,
  },
  {
    id: 'decoder',
    title: 'Header decoder',
    summary: 'Paste the bytes of a frame and see every header field, layer by layer.',
    status: 'planned',
    issue: 4,
  },
  {
    id: 'tcp-states',
    title: 'TCP state machine',
    summary: 'The TCP connection states and the segments that move between them.',
    status: 'planned',
    issue: 5,
  },
  {
    id: 'ports',
    title: 'Well-known ports',
    summary: 'Common ports with their protocol and transport.',
    status: 'planned',
    issue: 6,
  },
];
