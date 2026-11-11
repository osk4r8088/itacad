import { href } from './router';
import { CATALOG } from '../protocols/catalog';
import { LESSONS } from '../learn/registry';
import { TOOLS, entryHref } from '../tools/registry';
import { TOPICS } from '../basics/catalog';
import type { Level } from '../shared/levels';
import type { EntryRef } from '../shared/refs';

/** Everything the site knows about one entry, whatever section it belongs to. */
export interface EntryInfo {
  ref: EntryRef;
  title: string;
  href: string;
  /** Which part of the site the entry belongs to. */
  kind: 'Basics' | 'Protocol' | 'Tool' | 'Explore' | 'Lesson';
  level: Level;
  prereqs: EntryRef[];
  planned: boolean;
}

/** Resolves a reference; undefined if it points nowhere (tests check that this never happens). */
export function resolveRef(ref: EntryRef): EntryInfo | undefined {
  if ('topic' in ref) {
    const t = TOPICS.find((e) => e.id === ref.topic);
    return t && { ref, title: t.title, href: href.topic(t.category, t.id), kind: 'Basics', level: t.level, prereqs: t.prereqs ?? [], planned: t.status === 'planned' };
  }
  if ('protocol' in ref) {
    const p = CATALOG.find((e) => e.id === ref.protocol);
    return p && { ref, title: p.title, href: href.exchange(p.id, ref.step), kind: 'Protocol', level: p.level, prereqs: p.prereqs ?? [], planned: false };
  }
  const tool = TOOLS.find((e) => e.id === ref.entry);
  if (tool)
    return { ref, title: tool.title, href: entryHref(tool.id), kind: tool.purpose === 'understand' ? 'Explore' : 'Tool', level: tool.level, prereqs: tool.prereqs ?? [], planned: tool.status !== 'ready' };
  const lesson = LESSONS.find((e) => e.id === ref.entry);
  if (lesson)
    return {
      ref,
      title: lesson.title,
      href: lesson.exchange ? href.lesson(lesson.id, 1) : href.lesson(lesson.id),
      kind: 'Lesson',
      level: lesson.level,
      prereqs: lesson.prereqs ?? [],
      planned: lesson.status !== 'ready',
    };
  return undefined;
}

/** Every entry of the site, for tests and overviews. */
export function allEntries(): EntryInfo[] {
  const refs: EntryRef[] = [
    ...TOPICS.map((t) => ({ topic: t.id })),
    ...CATALOG.map((p) => ({ protocol: p.id })),
    ...TOOLS.map((t) => ({ entry: t.id })),
    ...LESSONS.map((l) => ({ entry: l.id })),
  ];
  return refs.map((r) => resolveRef(r)!);
}

/** A suggested way through the site for one level, shown on the start page. */
export interface PathStep {
  ref: EntryRef;
  why: string;
}

export const PATHS: Record<Level, { about: string; steps: PathStep[] }> = {
  1: {
    about: 'New to IT: what is inside a computer and a network, and how to count in bits and bytes.',
    steps: [
      { ref: { topic: 'cpu' }, why: 'What a processor does, and what cores, threads and GHz mean.' },
      { ref: { topic: 'memory' }, why: 'Why fast memory is small, and how much a cache miss costs.' },
      { ref: { topic: 'storage' }, why: 'Hard disks and SSDs, SATA and NVMe.' },
      { ref: { topic: 'network-devices' }, why: 'Switch, router, firewall, access point: who decides what.' },
      { ref: { entry: 'layers' }, why: 'The map of networking: seven layers, and what belongs to each.' },
      { ref: { entry: 'numbers' }, why: 'Binary and hexadecimal, the way addresses and headers are written.' },
      { ref: { entry: 'bandwidth' }, why: 'Bits and bytes, and how long a download really takes.' },
    ],
  },
  2: {
    about: 'Apprentices and admins: the protocols every network runs on, and the tools to work with them.',
    steps: [
      { ref: { topic: 'nic' }, why: 'Where a computer meets the network: MAC addresses and link speed.' },
      { ref: { protocol: 'arp' }, why: 'How an IP address becomes a MAC address on the local network.' },
      { ref: { protocol: 'dhcp' }, why: 'How a new device gets its address, gateway and resolver.' },
      { ref: { entry: 'subnet' }, why: 'Network and host bits, prefix by prefix.' },
      { ref: { protocol: 'dns' }, why: 'How a name becomes an address, server by server.' },
      { ref: { protocol: 'tcp' }, why: 'Handshake, data and close, with every header field.' },
      { ref: { protocol: 'nat' }, why: 'How a whole home network shares one public address.' },
      { ref: { entry: 'url-to-page' }, why: 'Everything at once: a laptop joins a network and loads a page.' },
    ],
  },
  3: {
    about: 'Deep dive: bits, state machines, encryption and attacks.',
    steps: [
      { ref: { entry: 'decoder' }, why: 'Paste the bytes of a frame and read every field.' },
      { ref: { entry: 'tcp-states' }, why: 'Every TCP state and the segment that moves it.' },
      { ref: { protocol: 'tls' }, why: 'The TLS 1.3 handshake: keys, certificates and what is encrypted when.' },
      { ref: { protocol: 'http3' }, why: 'HTTP over QUIC: transport, encryption and streams in one protocol.' },
      { ref: { protocol: 'stp' }, why: 'How switches elect a root and block loops, BPDU by BPDU.' },
      { ref: { entry: 'syn-flood' }, why: 'An attack on TCP state, and how SYN cookies avoid keeping it.' },
      { ref: { entry: 'dns-poisoning' }, why: 'Racing the real name server, and what stops it.' },
    ],
  },
};
