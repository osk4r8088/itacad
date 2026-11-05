import type { OsiLayer, Source, TcpIpLayer } from './schema';

export const OSI_SOURCE: Source = { spec: 'ISO/IEC 7498-1:1994', note: 'OSI Basic Reference Model' };
export const TCPIP_SOURCE: Source = { rfc: 1122, section: '1.1.3' };

export const OSI_LAYERS: Record<OsiLayer, { name: string; about: string }> = {
  7: {
    name: 'Application',
    about: 'Protocols that applications use directly: HTTP, SMTP, DNS, SSH.',
  },
  6: {
    name: 'Presentation',
    about: 'Representation of data: encoding, compression, encryption. In the Internet protocols there is no separate layer for this; it is part of the application protocol or of TLS.',
  },
  5: {
    name: 'Session',
    about: 'Managing dialogs between applications. Again there is no separate Internet protocol for it; TLS sessions and HTTP connections cover parts of the idea.',
  },
  4: {
    name: 'Transport',
    about: 'End-to-end communication between processes on two hosts, identified by ports: TCP, UDP, QUIC.',
  },
  3: {
    name: 'Network',
    about: 'Addressing hosts and routing packets across networks: IPv4, IPv6, ICMP.',
  },
  2: {
    name: 'Data Link',
    about: 'Delivery of frames between interfaces on the same link, with link-layer addresses: Ethernet, Wi-Fi (IEEE 802.11).',
  },
  1: {
    name: 'Physical',
    about: 'Bits as signals on a medium: voltages, light, radio, timing, connectors.',
  },
};

export const TCPIP_LAYERS: Record<TcpIpLayer, { name: string; osi: OsiLayer[]; about: string }> = {
  application: {
    name: 'Application',
    osi: [5, 6, 7],
    about: 'RFC 1122 has a single application layer for everything above transport. OSI layers 5 to 7 map to it.',
  },
  transport: {
    name: 'Transport',
    osi: [4],
    about: 'End-to-end transport between applications: TCP and UDP.',
  },
  internet: {
    name: 'Internet',
    osi: [3],
    about: 'IP and its helpers such as ICMP: one packet format and one address space across all networks.',
  },
  link: {
    name: 'Link',
    osi: [1, 2],
    about: 'RFC 1122 treats everything below IP as the link layer and does not split it into data link and physical.',
  },
};

export const TCPIP_ORDER: TcpIpLayer[] = ['application', 'transport', 'internet', 'link'];
