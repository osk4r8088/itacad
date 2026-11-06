import type { Capture, LayerInstance } from '../schema';
import { concat } from '../lib/encode';
import { ethernet, physical, type EthernetParams } from './ethernet';
import { ipv4, type Ipv4Params } from './ipv4';
import { tcp, type TcpParams } from './tcp';
import { udp, type UdpParams } from './udp';

/** Bytes of a layer including everything inside it. */
function wire(layer: LayerInstance, inner: Uint8Array): Uint8Array {
  return concat(layer.bytes, inner, layer.trailerBytes ?? new Uint8Array(0));
}

export interface EthIpv4TcpParams {
  link: string;
  note?: string;
  eth: Omit<EthernetParams, 'type'>;
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
  const eth = ethernet({ ...p.eth, type: 0x0800 }, ipBytes);
  const layers = [physical(), eth, ip, t, ...inner];
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
  eth: Omit<EthernetParams, 'type'>;
  ip: Ipv4Params;
  /** Layers inside IP, already built (transport header, data, or an ICMP message). */
  inner: LayerInstance[];
}

/** Ethernet II / IPv4 / anything, with IP length, IP checksum and FCS computed. */
export function ethIpv4(p: EthIpv4Params): Capture {
  const payload = nestedBytes(p.inner);
  const ip = ipv4(p.ip, payload);
  const eth = ethernet({ ...p.eth, type: 0x0800 }, wire(ip, payload));
  return { link: p.link, ...(p.note ? { note: p.note } : {}), layers: [physical(), eth, ip, ...p.inner] };
}

/** Ethernet II / ARP. */
export function ethArp(p: { link: string; note?: string; eth: Omit<EthernetParams, 'type'>; arp: LayerInstance }): Capture {
  const eth = ethernet({ ...p.eth, type: 0x0806 }, p.arp.bytes);
  return { link: p.link, ...(p.note ? { note: p.note } : {}), layers: [physical(), eth, p.arp] };
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
  eth: Omit<EthernetParams, 'type'>;
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
