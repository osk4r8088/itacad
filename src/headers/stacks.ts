import type { Capture, LayerInstance } from '../schema';
import { concat } from '../lib/encode';
import { ethernet, physical, type EthernetParams } from './ethernet';
import { ipv4, type Ipv4Params } from './ipv4';
import { tcp, type TcpParams } from './tcp';

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
  payload?: LayerInstance;
}

/** Ethernet II / IPv4 / TCP [/ application data], with all lengths and checksums computed. */
export function ethIpv4Tcp(p: EthIpv4TcpParams): Capture {
  const app = p.payload ? p.payload.bytes : new Uint8Array(0);
  const t = tcp(p.tcp, { srcIp: p.ip.src, dstIp: p.ip.dst }, app);
  const tBytes = wire(t, app);
  const ip = ipv4({ ...p.ip, protocol: 6 }, tBytes);
  const ipBytes = wire(ip, tBytes);
  const eth = ethernet({ ...p.eth, type: 0x0800 }, ipBytes);
  const layers = [physical(), eth, ip, t, ...(p.payload ? [p.payload] : [])];
  return { link: p.link, ...(p.note ? { note: p.note } : {}), layers };
}
