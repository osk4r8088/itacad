import type { LayerDef, LayerInstance } from '../schema';
import { buildStruct, type Annotations } from '../lib/build';
import { concat, hex, internetChecksum, parseIpv4 } from '../lib/encode';

export const udpDef: LayerDef = {
  id: 'udp',
  name: 'UDP header',
  short: 'UDP',
  osi: [4],
  tcpip: 'transport',
  about:
    'UDP adds exactly two things to IP: port numbers, so a datagram reaches the right application, and an optional checksum. There is no connection, no acknowledgment, no retransmission, no ordering and no flow control. A datagram arrives once, or not at all, and the sender is not told which. Applications that need more build it themselves (DNS retries, QUIC builds a full transport on top of UDP).',
  fields: [
    {
      id: 'srcPort',
      name: 'Source Port',
      bits: 16,
      about: 'Port of the sending application, where replies should go. Optional: 0 means "no port", because UDP does not require replies.',
      source: { rfc: 768 },
    },
    { id: 'dstPort', name: 'Destination Port', bits: 16, about: 'Port of the receiving application, for example 53 for DNS, 123 for NTP, 514 for syslog.', source: { rfc: 768 } },
    {
      id: 'length',
      name: 'Length',
      bits: 16,
      about: 'Length of the UDP header plus data in octets. The minimum is 8 (header only).',
      source: { rfc: 768 },
    },
    {
      id: 'checksum',
      name: 'Checksum',
      bits: 16,
      about:
        'Internet checksum over a pseudo-header (source and destination IP address, protocol 17, UDP length), the UDP header and the data, like TCP. Over IPv4 it is optional: 0 means "not computed", and a computed value of 0 is sent as 0xFFFF. Over IPv6 it is mandatory. The value shown is computed for this example.',
      source: { rfc: 768 },
    },
  ],
  sources: [{ rfc: 768 }, { rfc: 8085, note: 'UDP usage guidelines' }],
};

export interface UdpParams extends Annotations {
  srcPort: number;
  dstPort: number;
}

export function udp(p: UdpParams, ctx: { srcIp: string; dstIp: string }, payload: Uint8Array): LayerInstance {
  const length = 8 + payload.length;
  const fields = (checksum: number) => ({
    srcPort: { raw: p.srcPort, display: String(p.srcPort) },
    dstPort: { raw: p.dstPort, display: String(p.dstPort) },
    length: { raw: length, display: `${length} (8 header + ${payload.length} data)` },
    checksum: { raw: checksum, display: hex(checksum, 4) },
  });
  const draft = buildStruct(udpDef, fields(0));
  const pseudo = concat(parseIpv4(ctx.srcIp), parseIpv4(ctx.dstIp), Uint8Array.of(0, 17, length >> 8, length & 0xff));
  let checksum = internetChecksum(concat(pseudo, draft.bytes, payload));
  if (checksum === 0) checksum = 0xffff;
  return buildStruct(udpDef, fields(checksum), p, `${p.srcPort} to ${p.dstPort}, length ${length}`);
}
