import type { Exchange } from '../schema';
import { arp } from '../headers/arp';
import { icmpEcho } from '../headers/icmp';
import { ethArp, ethIpv4 } from '../headers/stacks';
import { LINUX_PING_DISPLAY, linuxPingData } from './common';

// Addresses: IPv4 RFC 5737, MAC RFC 7042.
const CLIENT = { mac: '00:00:5e:00:53:0a', ip: '192.0.2.10' };
const HOST_B = { mac: '00:00:5e:00:53:0b', ip: '192.0.2.11' };
const ROUTER = { mac: '00:00:5e:00:53:01', ip: '192.0.2.1' };
const REMOTE = '203.0.113.80';
const BROADCAST = 'ff:ff:ff:ff:ff:ff';
const ZERO_MAC = '00:00:00:00:00:00';

const request = arp({
  oper: 'request',
  sha: CLIENT.mac,
  spa: CLIENT.ip,
  tha: ZERO_MAC,
  tpa: ROUTER.ip,
  notes: { tha: 'Unknown, that is the question. Linux sends zeros.', tpa: 'The address being resolved: the default gateway.' },
});

const reply = arp({
  oper: 'reply',
  sha: ROUTER.mac,
  spa: ROUTER.ip,
  tha: CLIENT.mac,
  tpa: CLIENT.ip,
  notes: { sha: 'The answer.', tha: 'Copied from the sender fields of the request.' },
});

const echo = icmpEcho({
  kind: 'request',
  identifier: 0x2c4f,
  sequence: 1,
  data: linuxPingData(1793955600, 123456),
  dataDisplay: LINUX_PING_DISPLAY,
});

export const arpExchange: Exchange = {
  id: 'arp',
  title: 'ARP',
  summary: 'Resolving the MAC address of the default gateway before the first packet can leave.',
  group: 'Link',
  scenario: 'A client wants to ping a server on the Internet. Its ARP cache is empty, so it first has to find the MAC address of its default gateway.',
  intro:
    'IP addresses identify hosts across networks, but on the local link frames are delivered by MAC address. Before the client can send any packet to another network, it needs the MAC address of its default gateway. ARP asks the whole link by broadcast and the owner of the address answers directly. The client keeps the answer in its ARP cache, so the next packets go out without asking again.',
  sources: [
    { rfc: 826, note: 'Address Resolution Protocol' },
    { rfc: 1122, section: '2.3.2', note: 'ARP requirements for hosts' },
    { rfc: 5227, note: 'IPv4 address conflict detection' },
    { rfc: 894, note: 'IPv4 over Ethernet' },
    { spec: 'IEEE 802.3-2022', note: 'Ethernet, minimum frame size' },
    { rfc: 5737, note: 'Documentation IPv4 addresses used here' },
    { rfc: 7042, note: 'Documentation MAC addresses used here' },
  ],
  participants: [
    { id: 'client', label: 'Client', kind: 'host', addr: { mac: CLIENT.mac, ipv4: CLIENT.ip }, pos: { x: 0, y: 0 }, lifeline: true },
    { id: 'switch', label: 'Switch', kind: 'switch', pos: { x: 2, y: 0 }, lifeline: false, note: 'Forwards frames by MAC address; floods broadcasts to all ports' },
    { id: 'hostB', label: 'Host B', kind: 'host', addr: { mac: HOST_B.mac, ipv4: HOST_B.ip }, pos: { x: 2, y: 1 }, lifeline: true, note: 'Another host on the same LAN' },
    { id: 'router', label: 'Router', kind: 'router', addr: { mac: ROUTER.mac, ipv4: ROUTER.ip }, pos: { x: 4, y: 0 }, lifeline: true, note: 'Default gateway of the LAN' },
  ],
  links: [
    { id: 'p1', a: 'client', b: 'switch', label: 'Port 1' },
    { id: 'p2', a: 'switch', b: 'router', label: 'Port 2' },
    { id: 'p3', a: 'switch', b: 'hostB', label: 'Port 3' },
  ],
  initialStates: { client: 'no entry' },
  categories: [
    { id: 'request', label: 'ARP request (broadcast)', color: 'blue' },
    { id: 'reply', label: 'ARP reply', color: 'green' },
    { id: 'ip', label: 'IP traffic', color: 'purple' },
  ],
  steps: [
    // ---------------------------------------------------------------- 1 request
    {
      id: 'request',
      from: 'client',
      to: 'router',
      path: ['client', 'switch', 'router'],
      extraPaths: [['client', 'switch', 'hostB']],
      label: 'Who has 192.0.2.1?',
      states: { client: 'INCOMPLETE' },
      time: 0,
      category: 'request',
      protocol: 'ARP',
      info: request.summary!,
      details: {
        what:
          'The destination 203.0.113.80 is not on the local network, so the routing table says: send it to the default gateway 192.0.2.1. The client has no MAC address for 192.0.2.1 yet, holds the packet back and broadcasts an ARP request: "Who has 192.0.2.1? Tell 192.0.2.10". The switch floods the broadcast to every port, so the router and Host B both receive it.',
        why:
          'The client cannot address a frame to a MAC address it does not know. The broadcast address reaches every interface on the link, and only the owner of the IP address will answer.',
        keyFields: [
          { layer: 'ethernet', field: 'dst' },
          { layer: 'ethernet', field: 'type' },
          { layer: 'arp', field: 'oper' },
          { layer: 'arp', field: 'tpa' },
          { layer: 'ethernet', field: 'pad' },
        ],
        typical:
          'The ARP packet is only 28 octets, less than the 46 octets Ethernet requires, so the frame is padded with 18 zero octets to the minimum of 64. Host B is not the target: it drops the request (RFC 826 lets it refresh an existing cache entry for the sender, but not create one). The cache states shown are the names Linux uses; RFC 826 itself defines no states.',
        wrong:
          'If nobody answers (wrong gateway address, router down), Linux repeats the request a few times and then reports "Destination Host Unreachable" for the queued packets. Too many broadcasts on a large flat network waste capacity on every host.',
        insight:
          'ARP never crosses a router. To reach a host on the Internet, the client only ever resolves the address of its gateway; the server MAC address is irrelevant and unreachable for it.',
      },
      captures: [
        ethArp({
          link: 'p1',
          note: 'As sent by the client. The switch forwards it unchanged to ports 2 and 3.',
          eth: { src: CLIENT.mac, dst: BROADCAST, notes: { dst: 'Broadcast: every interface on the link takes it.' } },
          arp: request,
        }),
      ],
      sources: [{ rfc: 826 }, { rfc: 1122, section: '2.3.2.2' }, { spec: 'IEEE 802.3-2022', section: '3.2.8' }],
    },
    // ---------------------------------------------------------------- 2 reply
    {
      id: 'reply',
      from: 'router',
      to: 'client',
      path: ['router', 'switch', 'client'],
      label: '192.0.2.1 is at ...:01',
      states: { client: 'REACHABLE' },
      time: 0.4,
      category: 'reply',
      protocol: 'ARP',
      info: reply.summary!,
      details: {
        what:
          'The router recognizes its own address in the request. It stores the client mapping (192.0.2.10 is at 00:00:5e:00:53:0a) from the sender fields, because it will most likely need it for the answer traffic. Then it sends a reply directly to the client, not as a broadcast. The client stores 192.0.2.1 is at 00:00:5e:00:53:01 in its cache.',
        why: 'Only the client asked, so a unicast reply is enough. Learning the sender mapping from the request saves the router its own ARP request later.',
        keyFields: [
          { layer: 'arp', field: 'oper' },
          { layer: 'arp', field: 'sha' },
          { layer: 'ethernet', field: 'dst' },
        ],
        typical:
          'On a LAN the answer arrives well below a millisecond after the request. Linux keeps a confirmed entry REACHABLE for about 15 to 45 seconds (a randomized 30-second base), then marks it STALE and verifies it again when it is used.',
        wrong:
          'ARP has no authentication. Any host can send a reply claiming to own 192.0.2.1 (ARP spoofing) and receive the client traffic. Defenses are switch features like Dynamic ARP Inspection, static entries, or encrypting traffic anyway.',
        insight: 'The reply carries the answer in the ARP packet (Sender Hardware Address) and again in the Ethernet source address. The receiver uses the ARP field.',
      },
      captures: [
        ethArp({
          link: 'p1',
          note: 'As delivered to the client.',
          eth: { src: ROUTER.mac, dst: CLIENT.mac },
          arp: reply,
        }),
      ],
      sources: [{ rfc: 826 }, { rfc: 1122, section: '2.3.2.1' }],
    },
    // ---------------------------------------------------------------- 3 first IP packet
    {
      id: 'ip',
      from: 'client',
      to: 'router',
      path: ['client', 'switch', 'router'],
      label: 'Echo request',
      time: 0.5,
      category: 'ip',
      protocol: 'ICMP',
      info: 'Echo (ping) request id=0x2c4f, seq=1, ttl=64',
      details: {
        what:
          'With the gateway MAC address known, the client sends the waiting packet: an ICMP Echo Request to 203.0.113.80. The Ethernet destination is the router MAC address, while the IP destination is the server. The switch has learned from the reply on which port the router sits and forwards the frame only there.',
        why: 'This is the whole point of ARP: the frame needs a link-layer destination on this link, and that is the next hop, not the final destination.',
        keyFields: [
          { layer: 'ethernet', field: 'dst' },
          { layer: 'ipv4', field: 'dst' },
        ],
        typical: 'Further packets to any destination behind the router reuse the same cache entry; there is no ARP per destination.',
        insight: 'Compare the two destination addresses: Ethernet says "the router", IP says "the server". Every router on the way repeats this with its own next hop.',
      },
      captures: [
        ethIpv4({
          link: 'p1',
          note: 'As sent by the client.',
          eth: { src: CLIENT.mac, dst: ROUTER.mac, notes: { dst: 'The router MAC address, learned with ARP.' } },
          ip: { src: CLIENT.ip, dst: REMOTE, ttl: 64, id: 0x7d21, protocol: 1, notes: { dst: 'The final destination, not on this link.' } },
          inner: [echo],
        }),
      ],
      sources: [{ rfc: 894 }, { rfc: 1122, section: '3.3.1' }],
    },
  ],
};
