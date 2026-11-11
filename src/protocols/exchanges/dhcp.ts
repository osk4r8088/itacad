import type { Capture, Exchange } from '../../shared/schema';
import { dhcp, type DhcpOption } from '../../shared/headers/dhcp';
import { ethIpv4Udp } from '../../shared/headers/stacks';

// Addresses: IPv4 RFC 5737, MAC RFC 9542.
const CLIENT_MAC = '00:00:5e:00:53:0a';
const SERVER = { mac: '00:00:5e:00:53:01', ip: '192.0.2.1' };
const OFFERED = '192.0.2.50';
const RESOLVER = '192.0.2.53';
const BROADCAST_MAC = 'ff:ff:ff:ff:ff:ff';
const XID = 0x5f2c9a41;
const LEASE = 86400;
const PRL = [1, 3, 6, 15];

const ZERO = '0.0.0.0';
const BCAST = '255.255.255.255';

const serverOptions = (type: number): DhcpOption[] => [
  { code: 53, type },
  { code: 54, addr: [SERVER.ip] },
  { code: 51, seconds: LEASE },
  { code: 1, addr: ['255.255.255.0'] },
  { code: 3, addr: [SERVER.ip] },
  { code: 6, addr: [RESOLVER] },
  { code: 15, text: 'example.com' },
  { code: 255 },
];

const discover = dhcp({
  op: 1,
  xid: XID,
  broadcast: false,
  ciaddr: ZERO,
  yiaddr: ZERO,
  siaddr: ZERO,
  giaddr: ZERO,
  chaddr: CLIENT_MAC,
  options: [{ code: 53, type: 1 }, { code: 55, codes: PRL }, { code: 255 }],
  notes: { xid: 'Chosen at random by the client.' },
  unverified: { options: 'Which options a client puts in its Parameter Request List depends on the implementation; this list is an example.' },
});

const offer = dhcp({
  op: 2,
  xid: XID,
  broadcast: false,
  ciaddr: ZERO,
  yiaddr: OFFERED,
  siaddr: ZERO,
  giaddr: ZERO,
  chaddr: CLIENT_MAC,
  options: serverOptions(2),
  notes: { xid: 'Copied from the Discover.', yiaddr: 'The offered address.' },
});

const request = dhcp({
  op: 1,
  xid: XID,
  broadcast: false,
  ciaddr: ZERO,
  yiaddr: ZERO,
  siaddr: ZERO,
  giaddr: ZERO,
  chaddr: CLIENT_MAC,
  options: [{ code: 53, type: 3 }, { code: 50, addr: [OFFERED] }, { code: 54, addr: [SERVER.ip] }, { code: 55, codes: PRL }, { code: 255 }],
  notes: { ciaddr: 'Still zero: the client does not own an address yet.' },
});

const ack = dhcp({
  op: 2,
  xid: XID,
  broadcast: false,
  ciaddr: ZERO,
  yiaddr: OFFERED,
  siaddr: ZERO,
  giaddr: ZERO,
  chaddr: CLIENT_MAC,
  options: serverOptions(5),
  notes: { yiaddr: 'Now assigned to the client for the lease time.' },
});

const CLIENT_TTL = 'The TTL a client uses for its DHCP messages depends on the implementation.';

function fromClient(app: typeof discover, id: number): Capture {
  return ethIpv4Udp({
    link: 'p1',
    note: 'As sent by the client. The switch floods the broadcast to all its ports.',
    eth: { src: CLIENT_MAC, dst: BROADCAST_MAC, notes: { dst: 'Broadcast: the client does not know the server yet.' } },
    ip: {
      src: ZERO,
      dst: BCAST,
      ttl: 64,
      id,
      notes: { src: '0.0.0.0: the client has no address yet.', dst: 'Limited broadcast: every host on this link, never forwarded by routers.' },
      unverified: { ttl: CLIENT_TTL },
    },
    udp: { srcPort: 68, dstPort: 67 },
    app,
  });
}

function fromServer(app: typeof offer, id: number): Capture {
  return ethIpv4Udp({
    link: 'p1',
    note: 'As delivered to the client.',
    eth: { src: SERVER.mac, dst: CLIENT_MAC, notes: { dst: 'Unicast to the client hardware address, taken from chaddr.' } },
    ip: { src: SERVER.ip, dst: OFFERED, ttl: 64, id, notes: { dst: 'The offered address, which the client does not use yet.' } },
    udp: { srcPort: 67, dstPort: 68 },
    app,
  });
}

export const dhcpExchange: Exchange = {
  id: 'dhcp',
  title: 'DHCP',
  summary: 'A new client gets an IPv4 address, gateway and DNS resolver: Discover, Offer, Request, Ack.',
  group: 'Application',
  scenario:
    'A laptop joins a LAN. It has a MAC address but no IP address, no gateway and no DNS resolver. The router of the LAN also runs the DHCP server.',
  intro:
    'Before a host can take part in IP at all, it needs an address. DHCP hands out addresses for a limited time (a lease) together with the rest of the configuration: subnet mask, default gateway, DNS resolvers. The exchange is called DORA after its four messages. The client starts without any address, so it broadcasts; the server answers with an offer; the client requests that offer, again by broadcast so every server on the link hears which one it chose; the server acknowledges. After the Ack the client configures its interface and is ready for ARP, DNS and everything else. The times in this example are illustrative.',
  sources: [
    { rfc: 2131, note: 'Dynamic Host Configuration Protocol' },
    { rfc: 2132, note: 'DHCP options' },
    { rfc: 951, note: 'BOOTP, the message format DHCP extends' },
    { rfc: 5227, note: 'IPv4 address conflict detection' },
    { rfc: 5737, note: 'Documentation IPv4 addresses used here' },
    { rfc: 9542, section: '2.1.4', note: 'Documentation MAC addresses used here' },
  ],
  participants: [
    { id: 'client', label: 'Client', kind: 'host', addr: { mac: CLIENT_MAC }, pos: { x: 0, y: 0 }, lifeline: true, note: 'No IP address yet' },
    { id: 'switch', label: 'Switch', kind: 'switch', pos: { x: 2, y: 0 }, lifeline: false },
    { id: 'server', label: 'Router', kind: 'router', addr: { mac: SERVER.mac, ipv4: SERVER.ip }, pos: { x: 4, y: 0 }, lifeline: true, note: 'Default gateway and DHCP server' },
  ],
  links: [
    { id: 'p1', a: 'client', b: 'switch', label: 'Port 1' },
    { id: 'p2', a: 'switch', b: 'server', label: 'Port 2' },
  ],
  initialStates: { client: 'INIT' },
  categories: [
    { id: 'client', label: 'From the client (broadcast)', color: 'blue' },
    { id: 'server', label: 'From the server', color: 'green' },
  ],
  steps: [
    // ---------------------------------------------------------------- 1 Discover
    {
      id: 'discover',
      from: 'client',
      to: 'server',
      path: ['client', 'switch', 'server'],
      label: 'DHCPDISCOVER',
      states: { client: 'SELECTING' },
      time: 0,
      category: 'client',
      protocol: 'DHCP',
      info: `DHCP Discover - Transaction ID ${'0x' + XID.toString(16)}`,
      details: {
        what:
          'The client broadcasts a Discover: "I am 00:00:5e:00:53:0a and need an address". It sends from 0.0.0.0, port 68, to 255.255.255.255, port 67, in an Ethernet broadcast frame. It also lists the options it would like to get.',
        why: 'The client knows nothing about the network yet: no address of its own, no server address. A broadcast on the link is the only way to reach a server it does not know.',
        keyFields: [
          { layer: 'dhcp', field: 'options' },
          { layer: 'dhcp', field: 'xid' },
          { layer: 'dhcp', field: 'chaddr' },
          { layer: 'ipv4', field: 'src' },
          { layer: 'ipv4', field: 'dst' },
        ],
        typical:
          'Option 53 = 1 marks the Discover. The fixed BOOTP part is 236 octets, so even a short DHCP message is around 250 octets. Some clients pad their messages to 300 octets, the size of a BOOTP message (RFC 951), for old relay agents.',
        wrong:
          'If no server answers, the client retransmits with increasing delays (RFC 2131 suggests about 4, 8, 16 seconds with random jitter). Many clients finally give themselves a link-local address from 169.254.0.0/16 (RFC 3927), which only works for talking to neighbours.',
        insight: 'DHCP runs over UDP and IP even though the client has no IP address. That works because 0.0.0.0 as source and 255.255.255.255 as destination need no configuration at all.',
      },
      captures: [fromClient(discover, 0x0000)],
      sources: [{ rfc: 2131, section: '3.1' }, { rfc: 2131, section: '4.4.1' }, { rfc: 2132, section: '9.6' }],
    },
    // ---------------------------------------------------------------- 2 Offer
    {
      id: 'offer',
      from: 'server',
      to: 'client',
      path: ['server', 'switch', 'client'],
      label: 'DHCPOFFER',
      time: 4,
      category: 'server',
      protocol: 'DHCP',
      info: `DHCP Offer - Transaction ID ${'0x' + XID.toString(16)}`,
      details: {
        what:
          'The server picks a free address from its pool, 192.0.2.50, and offers it in yiaddr together with the lease time and the network configuration. Because the client did not set the broadcast flag, the server sends the Offer to the client MAC address and the offered IP address.',
        why:
          'An offer is only a proposal. Several servers may answer one Discover, and the client chooses one of them. The server reserves the address for a short time but does not commit to it before the Request.',
        keyFields: [
          { layer: 'dhcp', field: 'yiaddr' },
          { layer: 'dhcp', field: 'options' },
          { layer: 'dhcp', field: 'flagB' },
          { layer: 'ethernet', field: 'dst' },
        ],
        typical:
          'Option 54 (Server Identifier) carries the address of the server. Lease times range from an hour on busy guest networks to days at home; this server offers 24 hours. Some servers first ping the address and wait for a reply before they offer it, which delays the Offer by around a second.',
        wrong:
          'If two DHCP servers run on the same LAN by mistake (for example a second home router), clients take whichever offer comes first and may end up with a wrong gateway. Switches can block this with DHCP snooping, which only lets offers through from trusted ports.',
        insight:
          'The client cannot answer ARP requests for 192.0.2.50 yet, so a server that wants to unicast must write the client MAC address directly into the Ethernet frame instead of resolving it with ARP.',
      },
      captures: [fromServer(offer, 0x4a11)],
      sources: [{ rfc: 2131, section: '4.3.1' }, { rfc: 2131, section: '4.1' }],
    },
    // ---------------------------------------------------------------- 3 Request
    {
      id: 'request',
      from: 'client',
      to: 'server',
      path: ['client', 'switch', 'server'],
      label: 'DHCPREQUEST',
      states: { client: 'REQUESTING' },
      time: 5,
      category: 'client',
      protocol: 'DHCP',
      info: `DHCP Request - Transaction ID ${'0x' + XID.toString(16)}`,
      details: {
        what:
          'The client accepts the offer. It broadcasts a Request with the offered address in option 50 (Requested IP Address) and the server it chose in option 54 (Server Identifier). ciaddr stays zero, the client still has no address.',
        why:
          'The Request is broadcast although the client now knows the server: every server that made an offer has to learn which one was chosen. A server that finds a foreign Server Identifier in the Request withdraws its offer and frees the address.',
        keyFields: [
          { layer: 'dhcp', field: 'options' },
          { layer: 'dhcp', field: 'ciaddr' },
          { layer: 'ipv4', field: 'dst' },
        ],
        typical: 'Option 53 = 3 marks the Request. The transaction ID is the same as in the Discover, so the whole DORA exchange belongs together.',
        wrong: 'If the server can no longer give out the address (for example it was taken in the meantime), it answers with a Nak and the client starts over with a Discover.',
      },
      captures: [fromClient(request, 0x0000)],
      sources: [{ rfc: 2131, section: '3.1' }, { rfc: 2131, section: '4.3.2' }, { rfc: 2132, section: '9.1' }, { rfc: 2132, section: '9.7' }],
    },
    // ---------------------------------------------------------------- 4 Ack
    {
      id: 'ack',
      from: 'server',
      to: 'client',
      path: ['server', 'switch', 'client'],
      label: 'DHCPACK',
      states: { client: 'BOUND' },
      time: 9,
      category: 'server',
      protocol: 'DHCP',
      info: `DHCP ACK - Transaction ID ${'0x' + XID.toString(16)}`,
      details: {
        what:
          'The server commits the lease and confirms it with an Ack. The client configures 192.0.2.50/24 on its interface, sets 192.0.2.1 as its default gateway and 192.0.2.53 as its DNS resolver.',
        why: 'Only the Ack makes the lease binding for both sides. The server records it, so it will not give the address to anybody else until the lease expires.',
        keyFields: [
          { layer: 'dhcp', field: 'yiaddr' },
          { layer: 'dhcp', field: 'options' },
        ],
        typical:
          'The client renews the lease at half the lease time (T1, here after 12 hours) by unicast to the server, and if that fails, by broadcast at 87.5 % (T2). RFC 2131 also says the client should check that nobody else uses the address, for example with an ARP probe (RFC 5227), before it uses it.',
        wrong:
          'If the client finds the address in use, it sends a Decline and starts over. If the lease runs out without renewal, the client must stop using the address immediately.',
        insight:
          'DORA has four messages where two would carry the information. The extra round makes the choice explicit when several servers answer, and lets servers hand out offers without committing to them.',
      },
      captures: [fromServer(ack, 0x4a12)],
      sources: [{ rfc: 2131, section: '3.1' }, { rfc: 2131, section: '4.4.1' }, { rfc: 2131, section: '4.4.5' }, { rfc: 5227 }],
    },
  ],
};
