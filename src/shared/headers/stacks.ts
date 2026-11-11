import type { Capture, LayerInstance } from '../schema';
import { concat } from '../lib/encode';
import { ethernet, physical, type EthernetParams } from './ethernet';
import { vlan, type VlanTag } from './vlan';
import { ipv4, type Ipv4Params } from './ipv4';
import { tcp, type TcpParams } from './tcp';
import { udp, type UdpParams } from './udp';
import { ipv6, type Ipv6Params } from './ipv6';
import { icmpv6, type Icmpv6Message } from './icmpv6';

/** Ethernet parameters of a capture: addresses, and optionally an 802.1Q tag. */
export type EthParams = Omit<EthernetParams, 'type'> & {
  /** Adds an 802.1Q tag. insertedBySwitch keeps the padding of the untagged original, so a minimum frame grows to 68 octets. */
  vlan?: VlanTag & { insertedBySwitch?: boolean };
};

/** The Ethernet header, and the tag if there is one, around a payload of the given EtherType. */
function frame(p: EthParams, type: number, payload: Uint8Array): LayerInstance[] {
  if (!p.vlan) return [ethernet({ ...p, type }, payload)];
  const { insertedBySwitch, ...tag } = p.vlan;
  const t = vlan(tag, type);
  const eth = ethernet({ ...p, type: 0x8100, ...(insertedBySwitch ? { minPayload: 50 } : {}) }, concat(t.bytes, payload));
  return [eth, t];
}

/** Bytes of a layer including everything inside it. */
function wire(layer: LayerInstance, inner: Uint8Array): Uint8Array {
  return concat(layer.bytes, inner, layer.trailerBytes ?? new Uint8Array(0));
}

export interface EthIpv4TcpParams {
  link: string;
  note?: string;
  eth: EthParams;
  ip: Omit<Ipv4Params, 'protocol'>;
  tcp: TcpParams;
  /** Application data: one layer, or several nested in each other (outermost first). */
  payload?: LayerInstance | LayerInstance[];
}

/** Ethernet II / IPv4 / TCP [/ application data], with all lengths and checksums computed. */
export function ethIpv4Tcp(p: EthIpv4TcpParams): Capture {
  const inner = p.payload ? (Array.isArray(p.payload) ? p.payload : [p.payload]) : [];
  const app = nestedBytes(inner);
  const t = tcp(p.tcp, { srcIp: p.ip.src, dstIp: p.ip.dst }, app);
  const tBytes = wire(t, app);
  const ip = ipv4({ ...p.ip, protocol: 6 }, tBytes);
  const ipBytes = wire(ip, tBytes);
  const layers = [physical(), ...frame(p.eth, 0x0800, ipBytes), ip, t, ...inner];
  return { link: p.link, ...(p.note ? { note: p.note } : {}), layers };
}

/** Bytes of a list of layers nested in each other (outermost first). */
export function nestedBytes(layers: LayerInstance[]): Uint8Array {
  if (layers.length === 0) return new Uint8Array(0);
  return wire(layers[0], nestedBytes(layers.slice(1)));
}

export interface EthIpv4Params {
  link: string;
  note?: string;
  eth: EthParams;
  ip: Ipv4Params;
  /** Layers inside IP, already built (transport header, data, or an ICMP message). */
  inner: LayerInstance[];
}

/** Ethernet II / IPv4 / anything, with IP length, IP checksum and FCS computed. */
export function ethIpv4(p: EthIpv4Params): Capture {
  const payload = nestedBytes(p.inner);
  const ip = ipv4(p.ip, payload);
  return { link: p.link, ...(p.note ? { note: p.note } : {}), layers: [physical(), ...frame(p.eth, 0x0800, wire(ip, payload)), ip, ...p.inner] };
}

/** Ethernet II / ARP. */
export function ethArp(p: { link: string; note?: string; eth: EthParams; arp: LayerInstance }): Capture {
  return { link: p.link, ...(p.note ? { note: p.note } : {}), layers: [physical(), ...frame(p.eth, 0x0806, p.arp.bytes), p.arp] };
}

/** The IP datagram of a capture (IP header and everything inside), as a receiver sees it. */
export function ipDatagram(c: Capture): Uint8Array {
  const i = c.layers.findIndex((l) => l.def.id === 'ipv4');
  if (i < 0) throw new Error('capture has no IPv4 layer');
  return nestedBytes(c.layers.slice(i));
}

export interface EthIpv4UdpParams {
  link: string;
  note?: string;
  eth: EthParams;
  ip: Omit<Ipv4Params, 'protocol'>;
  udp: UdpParams;
  /** Application message carried in the datagram. */
  app: LayerInstance;
}

/** Ethernet II / IPv4 / UDP / application message, with all lengths and checksums computed. */
export function ethIpv4Udp(p: EthIpv4UdpParams): Capture {
  const u = udp(p.udp, { srcIp: p.ip.src, dstIp: p.ip.dst }, p.app.bytes);
  return ethIpv4({ link: p.link, note: p.note, eth: p.eth, ip: { ...p.ip, protocol: 17 }, inner: [u, p.app] });
}

export interface EthIpv6Icmpv6Params {
  link: string;
  note?: string;
  eth: EthParams;
  ip: Omit<Ipv6Params, 'nextHeader'>;
  icmp: Icmpv6Message;
}

/** Ethernet II / IPv6 / ICMPv6, with payload length, ICMPv6 checksum and FCS computed. */
export function ethIpv6Icmpv6(p: EthIpv6Icmpv6Params): Capture {
  const msg = icmpv6(p.icmp, { src: p.ip.src, dst: p.ip.dst });
  const ip = ipv6({ ...p.ip, nextHeader: 58 }, msg.bytes);
  return { link: p.link, ...(p.note ? { note: p.note } : {}), layers: [physical(), ...frame(p.eth, 0x86dd, wire(ip, msg.bytes)), ip, msg] };
}

/** IEEE 802.3 frame with a length field, LLC header and a BPDU (Spanning Tree). */
export function ethLlc(p: { link: string; note?: string; eth: Omit<EthernetParams, 'type'>; llc: LayerInstance; payload: LayerInstance }): Capture {
  const data = concat(p.llc.bytes, p.payload.bytes);
  const eth = ethernet({ ...p.eth, type: data.length }, data);
  return { link: p.link, ...(p.note ? { note: p.note } : {}), layers: [physical(), eth, p.llc, p.payload] };
}
