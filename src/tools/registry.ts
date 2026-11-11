import { lazy } from 'react';
import type { HubEntry } from '../shared/hub';
import { href } from '../app/router';

/**
 * All tools. To add one: create src/tools/<id>/ with its logic, tests and a component
 * with a default export, then set status 'ready' and
 * component: lazy(() => import('./<id>/<Component>')).
 */
export const TOOLS: HubEntry[] = [
  {
    id: 'subnet',
    purpose: 'use',
    title: 'Subnet calculator',
    summary: 'Network, broadcast, host range and mask of an IPv4 prefix, bit by bit.',
    status: 'ready',
    issue: 3,
    component: lazy(() => import('./subnet/SubnetTool')),
  },
  {
    id: 'decoder',
    purpose: 'use',
    title: 'Header decoder',
    summary: 'Paste the bytes of a frame and see every header field, layer by layer.',
    status: 'ready',
    issue: 4,
    component: lazy(() => import('./decoder/DecoderTool')),
  },
  {
    id: 'tcp-states',
    purpose: 'understand',
    title: 'TCP state machine',
    summary: 'The TCP connection states and the segments that move between them.',
    status: 'ready',
    issue: 5,
    component: lazy(() => import('./tcp-states/TcpStatesTool')),
  },
  {
    id: 'ports',
    purpose: 'understand',
    title: 'Well-known ports',
    summary: 'Common ports with their protocol and transport, and the port ranges.',
    status: 'ready',
    issue: 6,
    component: lazy(() => import('./ports/PortsTool')),
  },
  {
    id: 'numbers',
    purpose: 'use',
    title: 'Number converter',
    summary: 'Decimal, binary, hexadecimal and octal, with bit widths, two\'s complement and byte order.',
    status: 'ready',
    issue: 14,
    component: lazy(() => import('./numbers/NumbersTool')),
  },
  {
    id: 'passwords',
    purpose: 'use',
    title: 'Password generator and analyzer',
    summary: 'Random passwords and passphrases with their entropy, and why some passwords are weaker than they look.',
    status: 'ready',
    issue: 13,
    component: lazy(() => import('./passwords/PasswordsTool')),
  },
  {
    id: 'dns-records',
    purpose: 'understand',
    title: 'DNS record explorer',
    summary: 'Which record types exist, what they are for, and how records work together in a zone.',
    status: 'ready',
    issue: 21,
    component: lazy(() => import('./dns-records/DnsRecordsTool')),
  },
  {
    id: 'raid',
    purpose: 'understand',
    title: 'RAID visualizer',
    summary: 'How RAID 0, 1, 5, 6 and 10 spread data and parity, and what happens when disks fail.',
    status: 'ready',
    issue: 20,
    component: lazy(() => import('./raid/RaidTool')),
  },
  {
    id: 'vlsm',
    purpose: 'use',
    title: 'VLSM subnet planner',
    summary: 'Split one address block into subnets sized for the hosts each network needs.',
    status: 'ready',
    issue: 31,
    component: lazy(() => import('./vlsm/VlsmTool')),
  },
  {
    id: 'ipv6',
    purpose: 'use',
    title: 'IPv6 address tool',
    summary: 'Compress and expand IPv6 addresses, prefixes, address types and EUI-64.',
    status: 'ready',
    issue: 32,
    component: lazy(() => import('./ipv6/Ipv6Tool')),
  },
  {
    id: 'bandwidth',
    purpose: 'use',
    title: 'Bandwidth calculator',
    summary: 'Bits and bytes, transfer times with protocol overhead, and the bandwidth-delay product.',
    status: 'ready',
    issue: 33,
    component: lazy(() => import('./bandwidth/BandwidthTool')),
  },
];

export type Purpose = 'use' | 'understand';

/** The two sections built from this registry: everyday tools, and models to explore. */
export const SECTION_INFO: Record<Purpose, { title: string; about: string }> = {
  use: { title: 'Tools', about: 'For real tasks: calculate, decode, plan, generate.' },
  understand: { title: 'Explore and understand', about: 'Interactive models and references that show how something works inside.' },
};

/** Entries of one section, ready ones first. */
export function toolsFor(purpose: Purpose): HubEntry[] {
  const list = TOOLS.filter((t) => t.purpose === purpose);
  return [...list.filter((t) => t.status === 'ready'), ...list.filter((t) => t.status !== 'ready')];
}

/** Link to an entry of this registry, in the section its purpose puts it in. */
export function entryHref(id: string): string {
  return TOOLS.find((t) => t.id === id)?.purpose === 'understand' ? href.explorer(id) : href.tool(id);
}
