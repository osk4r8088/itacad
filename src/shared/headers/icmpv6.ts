import type { FieldDef, LayerDef, LayerInstance, Source, StructDef, StructInstance } from '../schema';
import { buildStruct, type Annotations, type FieldInput } from '../lib/build';
import { concat, hex, internetChecksum, parseMac } from '../lib/encode';
import { formatIpv6, parseIpv6 } from '../lib/ipv6';

// ICMPv6 (RFC 4443) and the Neighbor Discovery messages built on it (RFC 4861).
// As with ICMP for IPv4, each message layout is its own LayerDef.

const OSI_NOTE =
  'ICMPv6 travels inside an IPv6 packet (Next Header 58) but belongs to the network layer: it reports on IPv6 delivery and, with Neighbor Discovery, does the jobs ARP and parts of DHCP do for IPv4.';

const ABOUT =
  'ICMPv6 carries error reports and diagnostics for IPv6, like ICMP for IPv4, and more: Neighbor Discovery (address resolution, router discovery, address autoconfiguration) and multicast group management (MLD) are ICMPv6 messages too. Blocking ICMPv6 wholesale therefore breaks IPv6.';

const ND = (section: string): Source => ({ rfc: 4861, section });
const RFC4443: Source = { rfc: 4443, section: '2.1' };

const typeField = (about: string): FieldDef => ({ id: 'type', name: 'Type', bits: 8, about, source: RFC4443 });
const codeField: FieldDef = { id: 'code', name: 'Code', bits: 8, about: 'Always 0 for these messages.', source: RFC4443 };
const checksumField: FieldDef = {
  id: 'checksum',
  name: 'Checksum',
  bits: 16,
  about:
    'Internet checksum over the ICMPv6 message and an IPv6 pseudo-header: source and destination address, length and Next Header 58. Unlike ICMP for IPv4, the addresses are covered, because IPv6 has no header checksum of its own. The value shown is computed for this example.',
  source: { rfc: 4443, section: '2.3' },
};
const optionsField = (about: string, section: string): FieldDef => ({ id: 'options', name: 'Options', bits: 'variable', about, source: ND(section) });
const targetField = (about: string, section: string): FieldDef => ({ id: 'target', name: 'Target Address', bits: 128, about, source: ND(section) });
const reservedField = (bits: number, section: string): FieldDef => ({ id: 'reserved', name: 'Reserved', bits, about: 'Zero when sent, ignored when received.', source: ND(section) });

const def = (id: string, name: string, about: string, fields: FieldDef[], sources: Source[]): LayerDef => ({
  id,
  name,
  short: 'ICMPv6',
  osi: [3],
  tcpip: 'internet',
  osiNote: OSI_NOTE,
  about: `${ABOUT} ${about}`,
  fields,
  sources,
});

export const icmpv6EchoDef = def(
  'icmpv6-echo',
  'ICMPv6 Echo message',
  'Echo Request (type 128) and Echo Reply (type 129) work exactly like ping in IPv4: same identifier, sequence number and data in the reply.',
  [
    typeField('128 = Echo Request, 129 = Echo Reply.'),
    codeField,
    checksumField,
    { id: 'identifier', name: 'Identifier', bits: 16, about: 'Matches replies to the ping process that sent the request.', source: { rfc: 4443, section: '4.1' } },
    { id: 'sequence', name: 'Sequence Number', bits: 16, about: 'Counts the requests of one ping run.', source: { rfc: 4443, section: '4.1' } },
    { id: 'data', name: 'Data', bits: 'variable', compact: true, about: 'Arbitrary data, returned unchanged in the reply.', source: { rfc: 4443, section: '4.1' } },
  ],
  [{ rfc: 4443, section: '4' }],
);

export const rsDef = def(
  'icmpv6-rs',
  'Router Solicitation',
  'A host sends a Router Solicitation (type 133) to all routers on the link to ask for a Router Advertisement right away, instead of waiting for the next periodic one.',
  [typeField('133 = Router Solicitation.'), codeField, checksumField, reservedField(32, '4.1'), optionsField('Usually the Source Link-Layer Address of the host, so the router can answer it directly.', '4.1')],
  [ND('4.1')],
);

export const raDef = def(
  'icmpv6-ra',
  'Router Advertisement',
  'A router announces itself with a Router Advertisement (type 134): that it can be used as default router, which prefixes are on the link, and whether hosts should configure their addresses themselves (SLAAC) or ask a DHCPv6 server.',
  [
    typeField('134 = Router Advertisement.'),
    codeField,
    checksumField,
    { id: 'curHopLimit', name: 'Cur Hop Limit', bits: 8, about: 'Hop Limit hosts should use for the packets they send. 0 means unspecified.', source: ND('4.2') },
    { id: 'managed', name: 'M (Managed)', short: 'M', bits: 1, about: 'Set: addresses are available from DHCPv6. Clear: hosts form their own with SLAAC.', source: ND('4.2') },
    { id: 'other', name: 'O (Other)', short: 'O', bits: 1, about: 'Set: other configuration, such as DNS servers, is available from DHCPv6. Clear: no DHCPv6 needed for it; the DNS server can also come in an RA option (RFC 8106).', source: ND('4.2') },
    {
      id: 'reserved',
      name: 'Reserved',
      bits: 6,
      about: 'Reserved in RFC 4861. Later RFCs use some of these bits, for example the default router preference (RFC 4191).',
      source: ND('4.2'),
    },
    {
      id: 'routerLifetime',
      name: 'Router Lifetime',
      bits: 16,
      about: 'How long, in seconds, hosts may use this router as their default router. 0 would mean: I am a router, but not a default router.',
      source: ND('4.2'),
    },
    { id: 'reachableTime', name: 'Reachable Time', bits: 32, about: 'How long, in milliseconds, a neighbor counts as reachable after a confirmation. 0: the host uses its own default (30 seconds).', source: ND('4.2') },
    { id: 'retransTimer', name: 'Retrans Timer', bits: 32, about: 'Time between Neighbor Solicitations, in milliseconds. 0: the host uses its own default (1 second).', source: ND('4.2') },
    optionsField('Source Link-Layer Address of the router, the MTU of the link, and one Prefix Information option per prefix.', '4.2'),
  ],
  [ND('4.2'), ND('6.2')],
);

export const nsDef = def(
  'icmpv6-ns',
  'Neighbor Solicitation',
  'A Neighbor Solicitation (type 135) asks the owner of an address for its link-layer address (the job of an ARP request), checks that a neighbor is still reachable, or, sent from the unspecified address, checks whether anybody already uses an address (Duplicate Address Detection).',
  [
    typeField('135 = Neighbor Solicitation.'),
    codeField,
    checksumField,
    reservedField(32, '4.3'),
    targetField('The address the question is about. It is never a multicast address.', '4.3'),
    optionsField('The Source Link-Layer Address of the sender, so the target can answer it directly. Must be left out when the source is the unspecified address (Duplicate Address Detection).', '4.3'),
  ],
  [ND('4.3'), ND('7.2')],
);

export const naDef = def(
  'icmpv6-na',
  'Neighbor Advertisement',
  'A Neighbor Advertisement (type 136) answers a Neighbor Solicitation with the link-layer address for the target, the job of an ARP reply. It can also be sent unsolicited when an address moves to another interface.',
  [
    typeField('136 = Neighbor Advertisement.'),
    codeField,
    checksumField,
    { id: 'router', name: 'R (Router)', short: 'R', bits: 1, about: 'The sender is a router.', source: ND('4.4') },
    { id: 'solicited', name: 'S (Solicited)', short: 'S', bits: 1, about: 'This advertisement answers a Neighbor Solicitation. It confirms reachability of the sender.', source: ND('4.4') },
    { id: 'override', name: 'O (Override)', short: 'O', bits: 1, about: 'The receiver should replace an existing cache entry with the link-layer address in this message.', source: ND('4.4') },
    reservedField(29, '4.4'),
    targetField('The address the advertisement is about: the target of the solicitation it answers.', '4.4'),
    optionsField('The Target Link-Layer Address: the answer itself.', '4.4'),
  ],
  [ND('4.4'), ND('7.2')],
);

// ---- options

const optType = (about: string): FieldDef => ({ id: 'type', name: 'Type', bits: 8, about });
const optLength: FieldDef = { id: 'length', name: 'Length', bits: 8, about: 'Length of the whole option in units of 8 octets.' };

const option = (id: string, name: string, about: string, section: string, fields: FieldDef[]): StructDef => ({ id, name, about, fields: [...fields], sources: [ND(section)] });

export const optSllaDef = option('nd-opt-slla', 'Source Link-Layer Address', 'The MAC address of the sender of this message.', '4.6.1', [
  optType('1 = Source Link-Layer Address.'),
  optLength,
  { id: 'address', name: 'Link-Layer Address', bits: 48, about: 'The Ethernet address of the sender.' },
]);

export const optTllaDef = option('nd-opt-tlla', 'Target Link-Layer Address', 'The MAC address that belongs to the target address.', '4.6.1', [
  optType('2 = Target Link-Layer Address.'),
  optLength,
  { id: 'address', name: 'Link-Layer Address', bits: 48, about: 'The Ethernet address of the target.' },
]);

export const optPrefixDef = option(
  'nd-opt-prefix',
  'Prefix Information',
  'A prefix of this link: which addresses are on-link, and whether hosts may build their own addresses from it.',
  '4.6.2',
  [
    optType('3 = Prefix Information.'),
    optLength,
    { id: 'prefixLength', name: 'Prefix Length', bits: 8, about: 'Number of leading bits of the prefix that are valid. SLAAC needs 64, so the interface identifier fills the other 64.' },
    { id: 'onLink', name: 'L (On-Link)', short: 'L', bits: 1, about: 'Addresses with this prefix are on this link and can be reached directly, without the router.' },
    { id: 'autonomous', name: 'A (Autonomous)', short: 'A', bits: 1, about: 'Hosts may form addresses from this prefix themselves (SLAAC).' },
    { id: 'reserved1', name: 'Reserved1', bits: 6, about: 'Zero.' },
    { id: 'validLifetime', name: 'Valid Lifetime', bits: 32, about: 'How long, in seconds, addresses from this prefix remain valid.' },
    { id: 'preferredLifetime', name: 'Preferred Lifetime', bits: 32, about: 'How long, in seconds, addresses from this prefix are preferred for new connections. After that they are deprecated but still work.' },
    { id: 'reserved2', name: 'Reserved2', bits: 32, about: 'Zero.' },
    { id: 'prefix', name: 'Prefix', bits: 128, about: 'The prefix itself; bits after the prefix length are zero.' },
  ],
);

export const optMtuDef = option('nd-opt-mtu', 'MTU', 'The MTU of the link, so all hosts use the same value.', '4.6.4', [
  optType('5 = MTU.'),
  optLength,
  { id: 'reserved', name: 'Reserved', bits: 16, about: 'Zero.' },
  { id: 'mtu', name: 'MTU', bits: 32, about: 'The recommended MTU for the link, in octets.' },
]);

export type NdOption =
  | { kind: 'slla' | 'tlla'; mac: string }
  | { kind: 'prefix'; prefix: string; length: number; onLink: boolean; autonomous: boolean; validLifetime: number; preferredLifetime: number }
  | { kind: 'mtu'; mtu: number };

const bit = (b: boolean) => ({ raw: b ? 1 : 0, display: b ? '1' : '0' });
export const seconds = (s: number) => {
  const days = s / 86400;
  return `${s} s${Number.isInteger(days) && days >= 1 ? ` (${days} ${days === 1 ? 'day' : 'days'})` : s >= 60 && s % 60 === 0 ? ` (${s / 60} min)` : ''}`;
};

function buildOption(o: NdOption): StructInstance {
  switch (o.kind) {
    case 'slla':
    case 'tlla': {
      const slla = o.kind === 'slla';
      return buildStruct(
        slla ? optSllaDef : optTllaDef,
        { type: { raw: slla ? 1 : 2, display: slla ? '1' : '2' }, length: { raw: 1, display: '1 (8 octets)' }, address: { raw: parseMac(o.mac), display: o.mac } },
        {},
        `${slla ? 'Source' : 'Target'} link-layer address ${o.mac}`,
      );
    }
    case 'prefix':
      return buildStruct(
        optPrefixDef,
        {
          type: { raw: 3, display: '3' },
          length: { raw: 4, display: '4 (32 octets)' },
          prefixLength: { raw: o.length, display: String(o.length) },
          onLink: bit(o.onLink),
          autonomous: bit(o.autonomous),
          reserved1: { raw: 0, display: '0' },
          validLifetime: { raw: o.validLifetime, display: seconds(o.validLifetime) },
          preferredLifetime: { raw: o.preferredLifetime, display: seconds(o.preferredLifetime) },
          reserved2: { raw: 0, display: '0' },
          prefix: { raw: parseIpv6(o.prefix), display: formatIpv6(parseIpv6(o.prefix)) },
        },
        {},
        `Prefix ${formatIpv6(parseIpv6(o.prefix))}/${o.length}${o.autonomous ? ', SLAAC' : ''}`,
      );
    case 'mtu':
      return buildStruct(
        optMtuDef,
        { type: { raw: 5, display: '5' }, length: { raw: 1, display: '1 (8 octets)' }, reserved: { raw: 0, display: '0' }, mtu: { raw: o.mtu, display: String(o.mtu) } },
        {},
        `MTU ${o.mtu}`,
      );
  }
}

function optionsInput(options: NdOption[]): FieldInput {
  const items = options.map(buildOption);
  return { raw: concat(...items.map((i) => i.bytes)), display: items.length ? items.map((i) => i.summary).join(', ') : 'none', ...(items.length ? { items } : {}) };
}

// ---- messages

export type Icmpv6Message = Annotations &
  (
    | { kind: 'echo-request' | 'echo-reply'; identifier: number; sequence: number; data: Uint8Array; dataDisplay: string }
    | { kind: 'rs'; options: NdOption[] }
    | { kind: 'ra'; curHopLimit: number; managed: boolean; other: boolean; routerLifetime: number; reachableTime: number; retransTimer: number; options: NdOption[] }
    | { kind: 'ns'; target: string; options: NdOption[] }
    | { kind: 'na'; router: boolean; solicited: boolean; override: boolean; target: string; options: NdOption[] }
  );

const TYPES = { 'echo-request': 128, 'echo-reply': 129, rs: 133, ra: 134, ns: 135, na: 136 } as const;
const NAMES = { 'echo-request': 'Echo Request', 'echo-reply': 'Echo Reply', rs: 'Router Solicitation', ra: 'Router Advertisement', ns: 'Neighbor Solicitation', na: 'Neighbor Advertisement' };

/** One ICMPv6 message; the checksum covers the IPv6 pseudo-header, so the addresses are needed. */
export function icmpv6(m: Icmpv6Message, ctx: { src: string; dst: string }): LayerInstance {
  const type = TYPES[m.kind];
  const target = (t: string) => ({ raw: parseIpv6(t), display: formatIpv6(parseIpv6(t)) });
  let layerDef: LayerDef;
  let body: Record<string, FieldInput>;
  let summary: string;
  switch (m.kind) {
    case 'echo-request':
    case 'echo-reply':
      layerDef = icmpv6EchoDef;
      body = {
        identifier: { raw: m.identifier, display: hex(m.identifier, 4) },
        sequence: { raw: m.sequence, display: String(m.sequence) },
        data: { raw: m.data, display: m.dataDisplay },
      };
      summary = `${NAMES[m.kind]}, id ${hex(m.identifier, 4)}, seq ${m.sequence}`;
      break;
    case 'rs':
      layerDef = rsDef;
      body = { reserved: { raw: 0, display: '0' }, options: optionsInput(m.options) };
      summary = NAMES.rs;
      break;
    case 'ra':
      layerDef = raDef;
      body = {
        curHopLimit: { raw: m.curHopLimit, display: String(m.curHopLimit) },
        managed: bit(m.managed),
        other: bit(m.other),
        reserved: { raw: 0, display: '0' },
        routerLifetime: { raw: m.routerLifetime, display: seconds(m.routerLifetime) },
        reachableTime: { raw: m.reachableTime, display: m.reachableTime ? `${m.reachableTime} ms` : '0 (unspecified)' },
        retransTimer: { raw: m.retransTimer, display: m.retransTimer ? `${m.retransTimer} ms` : '0 (unspecified)' },
        options: optionsInput(m.options),
      };
      summary = NAMES.ra;
      break;
    case 'ns':
      layerDef = nsDef;
      body = { reserved: { raw: 0, display: '0' }, target: target(m.target), options: optionsInput(m.options) };
      summary = `${NAMES.ns} for ${formatIpv6(parseIpv6(m.target))}`;
      break;
    case 'na':
      layerDef = naDef;
      body = { router: bit(m.router), solicited: bit(m.solicited), override: bit(m.override), reserved: { raw: 0, display: '0' }, target: target(m.target), options: optionsInput(m.options) };
      summary = `${NAMES.na} for ${formatIpv6(parseIpv6(m.target))}`;
      break;
  }
  const fields = (checksum: number) => ({
    type: { raw: type, display: `${type} (${NAMES[m.kind]})` },
    code: { raw: 0, display: '0' },
    checksum: { raw: checksum, display: hex(checksum, 4) },
    ...body,
  });
  const draft = buildStruct(layerDef, fields(0));
  const len = draft.bytes.length;
  const pseudo = concat(parseIpv6(ctx.src), parseIpv6(ctx.dst), Uint8Array.of(len >>> 24, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff, 0, 0, 0, 58));
  const checksum = internetChecksum(concat(pseudo, draft.bytes));
  return buildStruct(layerDef, fields(checksum), m, summary);
}

/** Short text of a message for the flow table, in the style of a packet analyzer. */
export function icmpv6Info(m: Icmpv6Message): string {
  switch (m.kind) {
    case 'echo-request':
    case 'echo-reply':
      return `${NAMES[m.kind]} id=${hex(m.identifier, 4)}, seq=${m.sequence}`;
    case 'rs':
      return 'Router Solicitation';
    case 'ra': {
      const prefixes = m.options.flatMap((o) => (o.kind === 'prefix' ? [`${formatIpv6(parseIpv6(o.prefix))}/${o.length}`] : []));
      return `Router Advertisement${prefixes.length ? `, prefix ${prefixes.join(', ')}` : ''}`;
    }
    case 'ns':
      return `Neighbor Solicitation for ${formatIpv6(parseIpv6(m.target))}`;
    case 'na': {
      const flags = [m.router && 'rtr', m.solicited && 'sol', m.override && 'ovr'].filter(Boolean).join(', ');
      const tlla = m.options.flatMap((o) => (o.kind === 'tlla' ? [o.mac] : []))[0];
      return `Neighbor Advertisement ${formatIpv6(parseIpv6(m.target))} (${flags})${tlla ? ` is at ${tlla}` : ''}`;
    }
  }
}
