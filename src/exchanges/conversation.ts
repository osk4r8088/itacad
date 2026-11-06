import type { Capture, LayerInstance } from '../schema';
import { ethIpv4Tcp, nestedBytes } from '../headers/stacks';
import type { TcpFlag } from '../headers/tcp';

export interface Host {
  mac: string;
  ip: string;
  port: number;
  /** Initial sequence number of this side. */
  isn: number;
}

export interface ConversationParams {
  client: Host;
  server: Host;
  /** Link on the client side where frames are captured. */
  link: string;
  /** MAC address of the client's default gateway. */
  gatewayMac: string;
  /** Routers between client and server; the TTL of frames from the server is 64 minus this. */
  hops: number;
  /** First IP identification value of each side; it increases by one per datagram. */
  ipId: { client: number; server: number };
  window: { client: number; server: number };
}

export type Side = 'client' | 'server';

/**
 * One TCP connection, captured on the client LAN. It keeps sequence and acknowledgment
 * numbers consistent: every segment acknowledges everything the peer has sent so far.
 * The connection starts established (the handshake is shown in the TCP exchange), unless
 * the first segment is a SYN.
 */
export class TcpConversation {
  private next: Record<Side, number>;
  private ipId: Record<Side, number>;

  constructor(private p: ConversationParams) {
    this.next = { client: (p.client.isn + 1) >>> 0, server: (p.server.isn + 1) >>> 0 };
    this.ipId = { ...p.ipId };
  }

  /** Octets sent so far by one side, after the SYN. */
  sent(side: Side): number {
    return (this.next[side] - this.p[side].isn - 1) >>> 0;
  }

  segment(from: Side, payload?: LayerInstance | LayerInstance[], flags: TcpFlag[] = ['PSH', 'ACK'], note?: string): Capture {
    const to: Side = from === 'client' ? 'server' : 'client';
    const me = this.p[from];
    const peer = this.p[to];
    const syn = flags.includes('SYN');
    const seq = syn ? me.isn : this.next[from];
    const len = payload ? nestedBytes(Array.isArray(payload) ? payload : [payload]).length : 0;
    if (!syn) this.next[from] = (seq + len + (flags.includes('FIN') ? 1 : 0)) >>> 0;
    const c = from === 'client';
    const ttl = c ? 64 : 64 - this.p.hops;
    const relSeq = (seq - me.isn) >>> 0;
    return ethIpv4Tcp({
      link: this.p.link,
      note: note ?? (c ? 'As sent by the client.' : `As delivered to the client, after ${this.p.hops} routers.`),
      eth: c ? { src: me.mac, dst: this.p.gatewayMac } : { src: this.p.gatewayMac, dst: peer.mac },
      ip: { src: me.ip, dst: peer.ip, ttl, id: this.ipId[from]++, df: true },
      tcp: {
        srcPort: me.port,
        dstPort: peer.port,
        seq,
        ack: flags.includes('ACK') ? this.next[to] : 0,
        flags,
        window: this.p.window[from],
        notes: {
          seq: syn ? 'Initial sequence number.' : `Relative ${relSeq}: ${relSeq - 1} octets sent before this segment.`,
          ...(flags.includes('ACK') ? { ack: `Relative ${(this.next[to] - peer.isn) >>> 0}: the next octet expected from the peer.` } : {}),
        },
      },
      ...(payload ? { payload } : {}),
    });
  }
}

// ---- the common topology of the application exchanges: client, router, Internet, server

export const CLIENT_LAN = { mac: '00:00:5e:00:53:0a', gatewayMac: '00:00:5e:00:53:01' };
export const C2S = ['client', 'router', 'internet', 'server'];
export const S2C = [...C2S].reverse();

export function clientServer(o: { client: { label: string; ip: string; note?: string; kind?: 'host' | 'server' }; server: { label: string; ip: string; note?: string } }) {
  return {
    participants: [
      { id: 'client', label: o.client.label, kind: o.client.kind ?? ('host' as const), addr: { mac: CLIENT_LAN.mac, ipv4: o.client.ip }, pos: { x: 0, y: 0 }, lifeline: true, ...(o.client.note ? { note: o.client.note } : {}) },
      { id: 'router', label: 'Router', kind: 'router' as const, addr: { mac: CLIENT_LAN.gatewayMac }, pos: { x: 2, y: 0 }, lifeline: false },
      { id: 'internet', label: 'Internet', kind: 'internet' as const, pos: { x: 4, y: 0 }, lifeline: false },
      { id: 'server', label: o.server.label, kind: 'server' as const, addr: { ipv4: o.server.ip }, pos: { x: 6, y: 0 }, lifeline: true, ...(o.server.note ? { note: o.server.note } : {}) },
    ],
    links: [
      { id: 'lan', a: 'client', b: 'router', label: 'LAN' },
      { id: 'up', a: 'router', b: 'internet', label: 'Uplink' },
      { id: 'srv', a: 'internet', b: 'server', label: 'Server LAN' },
    ],
  };
}

/** Path and endpoints of a step between client and server. */
export const dir = (from: Side) =>
  from === 'client' ? { from: 'client', to: 'server', path: C2S } : { from: 'server', to: 'client', path: S2C };
