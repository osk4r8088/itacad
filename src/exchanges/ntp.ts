import type { Exchange } from '../schema';
import { ntp, type Instant } from '../headers/ntp';
import { ethIpv4Udp } from '../headers/stacks';

// Addresses: IPv4 RFC 5737, MAC RFC 7042.
const CLIENT = { mac: '00:00:5e:00:53:0a', ip: '192.0.2.50' };
const ROUTER_MAC = '00:00:5e:00:53:01';
const SERVER_IP = '203.0.113.123';
const UPSTREAM = '198.51.100.7';
const CLIENT_PORT = 46233;

// The true time when the client sends its request, and the example timing in microseconds.
const T0 = Date.UTC(2026, 10, 6, 9, 15, 0) / 1000;
const CLIENT_AHEAD = 348000; // the client clock is 348 ms fast
const DELAY_OUT = 11200; // client to server
const PROCESSING = 50; // inside the server
const DELAY_BACK = 13100; // server to client, slower than the way out

const at = (us: number): Instant => ({ unix: T0 + Math.floor(us / 1e6), us: ((us % 1e6) + 1e6) % 1e6 });

// The four timestamps of RFC 5905 section 8, in microseconds after T0, each by the clock that takes it.
const t1 = CLIENT_AHEAD; // client clock, request leaves
const t2 = DELAY_OUT; // server clock, request arrives
const t3 = DELAY_OUT + PROCESSING; // server clock, response leaves
const t4 = DELAY_OUT + PROCESSING + DELAY_BACK + CLIENT_AHEAD; // client clock, response arrives

const offset = (t2 - t1 + (t3 - t4)) / 2;
const delay = t4 - t1 - (t3 - t2);
const ms = (us: number) => `${(us / 1000).toFixed(2)} ms`;

const request = ntp({
  li: 0,
  vn: 4,
  mode: 3,
  stratum: 0,
  poll: 0,
  precision: 0,
  rootDelay: 0,
  rootDisp: 0,
  refid: null,
  refTs: null,
  orgTs: null,
  recTs: null,
  xmtTs: at(t1),
  notes: { xmtTs: 'T1, by the client clock, which is 348 ms fast.' },
});

const response = ntp({
  li: 0,
  vn: 4,
  mode: 4,
  stratum: 2,
  poll: 0,
  precision: -23,
  rootDelay: 0.0105,
  rootDisp: 0.0183,
  refid: UPSTREAM,
  refTs: at(-37_412_806),
  orgTs: at(t1),
  recTs: at(t2),
  xmtTs: at(t3),
  notes: {
    orgTs: 'T1, copied from the Transmit Timestamp of the request.',
    recTs: 'T2, by the server clock.',
    xmtTs: 'T3, by the server clock.',
    refid: 'Address of the stratum 1 server this server follows.',
    poll: 'Copied from the request.',
  },
  unverified: { rootDelay: 'Example values; they depend on the server and its upstream.', rootDisp: 'Example values; they depend on the server and its upstream.' },
});

export const ntpExchange: Exchange = {
  id: 'ntp',
  title: 'NTP',
  summary: 'One request, one response, four timestamps: how a client measures its clock offset and the round-trip delay.',
  group: 'Application',
  scenario:
    'A laptop whose clock is 348 ms fast asks an NTP server on the Internet for the time. The way to the server takes 11.2 ms, the way back 13.1 ms.',
  intro:
    'Sending the current time is easy; knowing how old it is when it arrives is the hard part. NTP solves this with four timestamps: T1 when the request leaves the client, T2 when it arrives at the server, T3 when the response leaves the server, T4 when it arrives back at the client. T1 and T4 come from the client clock, T2 and T3 from the server clock. From them the client computes the round-trip delay and its clock offset without knowing the one-way delays, under the assumption that both directions take equally long. This example uses the minimal client request of SNTP. A full NTP client such as chrony or ntpd sends more fields filled in and polls several servers continuously, but the timestamps work the same way. Times are measured against a perfect reference clock.',
  sources: [
    { rfc: 5905, note: 'Network Time Protocol version 4' },
    { rfc: 4330, note: 'Simple NTP (SNTP) version 4, now part of RFC 5905' },
    { rfc: 9109, note: 'NTPv4 port randomization' },
    { rfc: 5737, note: 'Documentation IPv4 addresses used here' },
    { rfc: 7042, note: 'Documentation MAC addresses used here' },
  ],
  participants: [
    { id: 'client', label: 'Client', kind: 'host', addr: { mac: CLIENT.mac, ipv4: CLIENT.ip }, pos: { x: 0, y: 0 }, lifeline: true, note: 'Clock 348 ms fast' },
    { id: 'router', label: 'Router', kind: 'router', addr: { mac: ROUTER_MAC }, pos: { x: 2, y: 0 }, lifeline: false },
    { id: 'internet', label: 'Internet', kind: 'internet', pos: { x: 4, y: 0 }, lifeline: false },
    { id: 'server', label: 'NTP server', kind: 'server', addr: { ipv4: SERVER_IP }, pos: { x: 6, y: 0 }, lifeline: true, note: 'Stratum 2' },
  ],
  links: [
    { id: 'lan', a: 'client', b: 'router', label: 'LAN' },
    { id: 'up', a: 'router', b: 'internet', label: 'Uplink' },
    { id: 'srv', a: 'internet', b: 'server', label: 'Server LAN' },
  ],
  categories: [
    { id: 'request', label: 'Client request', color: 'blue' },
    { id: 'response', label: 'Server response', color: 'green' },
  ],
  steps: [
    {
      id: 'request',
      from: 'client',
      to: 'server',
      path: ['client', 'router', 'internet', 'server'],
      label: 'Request (T1)',
      time: 0,
      category: 'request',
      protocol: 'NTP',
      info: 'NTP Version 4, client',
      details: {
        what:
          'The client sends a 48-octet request in mode 3 (client). The only thing that matters in it is the Transmit Timestamp: the time by the client clock when the request leaves, T1. As a minimal SNTP request, all other fields are zero.',
        why: 'The client needs to know when its request left, by its own clock, to later measure the round trip. Putting T1 into the packet lets the server echo it back, so the client does not have to remember it and can recognise the matching response.',
        keyFields: [
          { layer: 'ntp', field: 'mode' },
          { layer: 'ntp', field: 'vn' },
          { layer: 'ntp', field: 'xmtTs' },
          { layer: 'udp', field: 'dstPort' },
          { layer: 'udp', field: 'srcPort' },
        ],
        typical:
          'NTP uses UDP port 123 on the server. Clients should send from a random source port (RFC 9109), which makes it harder for an off-path attacker to inject a fake response. Full clients poll every 64 to 1024 seconds.',
        insight: `The client clock is 348 ms fast, so T1 already carries that error. It does not matter: the error cancels out in the calculation, as long as the client clock runs at a steady rate during the round trip.`,
      },
      captures: [
        ethIpv4Udp({
          link: 'lan',
          note: 'As sent by the client.',
          eth: { src: CLIENT.mac, dst: ROUTER_MAC },
          ip: { src: CLIENT.ip, dst: SERVER_IP, ttl: 64, id: 0x63b1, df: true },
          udp: { srcPort: CLIENT_PORT, dstPort: 123 },
          app: request,
        }),
      ],
      sources: [{ rfc: 5905, section: '7.3' }, { rfc: 4330, section: '5' }, { rfc: 9109 }],
    },
    {
      id: 'response',
      from: 'server',
      to: 'client',
      path: ['server', 'internet', 'router', 'client'],
      label: 'Response (T1 T2 T3)',
      time: (DELAY_OUT + PROCESSING) / 1000,
      category: 'response',
      protocol: 'NTP',
      info: 'NTP Version 4, server',
      details: {
        what: `The server notes the arrival time T2, builds the response in mode 4 (server), copies T1 into the Origin Timestamp, and puts the send time T3 into the Transmit Timestamp just before it goes out. When the response arrives, the client notes T4 by its own clock and computes: delay = (T4 - T1) - (T3 - T2) = ${ms(delay)}, offset = ((T2 - T1) + (T3 - T4)) / 2 = ${ms(offset)}. It corrects its clock by about 349 ms backwards.`,
        why: 'With T1 to T4 the client can subtract the time the server spent and split the remaining round trip in half. It never needs to know the one-way delays, which no clock pair that is not yet synchronized could measure.',
        keyFields: [
          { layer: 'ntp', field: 'orgTs' },
          { layer: 'ntp', field: 'recTs' },
          { layer: 'ntp', field: 'xmtTs' },
          { layer: 'ntp', field: 'stratum' },
          { layer: 'ntp', field: 'refid' },
        ],
        typical: `The true offset is -348.00 ms; the computed one is ${ms(offset)}. The difference of ${ms(offset + CLIENT_AHEAD)} is half the asymmetry between the two directions (11.2 ms out, 13.1 ms back). The error can never be larger than half the round-trip delay, here ${ms(delay / 2)}. Stratum 2 means the server follows a stratum 1 server, which has a reference clock.`,
        wrong:
          'A response whose Origin Timestamp does not match the T1 of an outstanding request is discarded; that protects against old or forged responses. An overloaded server may answer with a Kiss-o\'-Death packet (stratum 0, a code such as "RATE" in Reference ID), telling the client to poll less often.',
        insight:
          'Small offsets are not applied in one jump: NTP clients slew the clock, running it slightly faster or slower until the offset is gone, so time never goes backwards for running programs. Only offsets above the step threshold (128 ms in RFC 5905) are corrected in one step, as this one of 349 ms would be.',
      },
      captures: [
        ethIpv4Udp({
          link: 'lan',
          note: 'As delivered to the client.',
          eth: { src: ROUTER_MAC, dst: CLIENT.mac },
          ip: { src: SERVER_IP, dst: CLIENT.ip, ttl: 54, id: 0x0d2e, df: true, notes: { ttl: 'Sent with 64, ten routers on the way. The hop count is illustrative.' } },
          udp: { srcPort: 123, dstPort: CLIENT_PORT },
          app: response,
        }),
      ],
      sources: [{ rfc: 5905, section: '8' }, { rfc: 5905, section: '7.3' }, { rfc: 5905, section: '7.4' }, { rfc: 4330, section: '6' }],
    },
  ],
};

/** The four timestamps and the results, for the tests. */
export const ntpTiming = { t1, t2, t3, t4, offset, delay, request, response, T0 };
