import type { Source } from '../../shared/schema';

// A curated list of ports a network learner meets most often. Not the full IANA registry.
// Service names are the IANA names; transports are the ones used in practice.

export type Transport = 'TCP' | 'UDP';
export type Category = 'Web' | 'Mail' | 'Files' | 'Remote access' | 'Network services' | 'Directory and auth' | 'Routing and VPN' | 'Voice and discovery' | 'Databases';

export interface PortEntry {
  port: number;
  /** IANA service name. */
  service: string;
  title: string;
  transports: Transport[];
  category: Category;
  about: string;
  source: Source;
  /** Exchange on this site that shows the protocol. */
  exchange?: string;
  /** The encrypted variant on its own port, or the plain variant it secures. */
  related?: number;
}

const IANA: Source = { spec: 'IANA Service Name and Transport Protocol Port Number Registry', url: 'https://www.iana.org/assignments/service-names-port-numbers/' };

export const PORTS: PortEntry[] = [
  // ---- web
  { port: 80, service: 'http', title: 'HTTP', transports: ['TCP'], category: 'Web', about: 'Unencrypted web traffic. Today mostly redirects to HTTPS.', source: { rfc: 9110, section: '4.2.1' }, exchange: 'http1', related: 443 },
  { port: 443, service: 'https', title: 'HTTPS', transports: ['TCP', 'UDP'], category: 'Web', about: 'HTTP over TLS on TCP (HTTP/1.1 and HTTP/2), and HTTP/3 over QUIC on UDP.', source: { rfc: 9110, section: '4.2.2' }, exchange: 'http2', related: 80 },
  { port: 8080, service: 'http-alt', title: 'HTTP alternate', transports: ['TCP'], category: 'Web', about: 'Common for proxies and development servers that cannot or should not use port 80.', source: IANA },
  // ---- mail
  { port: 25, service: 'smtp', title: 'SMTP', transports: ['TCP'], category: 'Mail', about: 'Mail transfer between mail servers. Many providers block outgoing port 25 from home connections against spam.', source: { rfc: 5321 }, exchange: 'smtp' },
  { port: 587, service: 'submission', title: 'SMTP submission', transports: ['TCP'], category: 'Mail', about: 'Mail clients hand outgoing mail to their provider here, with authentication and STARTTLS.', source: { rfc: 6409 }, related: 465 },
  { port: 465, service: 'submissions', title: 'SMTP submission over TLS', transports: ['TCP'], category: 'Mail', about: 'Like 587, but TLS starts immediately (implicit TLS). RFC 8314 recommends it over STARTTLS.', source: { rfc: 8314 }, related: 587 },
  { port: 110, service: 'pop3', title: 'POP3', transports: ['TCP'], category: 'Mail', about: 'Downloads mail from the server, usually deleting it there.', source: { rfc: 1939 }, related: 995 },
  { port: 995, service: 'pop3s', title: 'POP3 over TLS', transports: ['TCP'], category: 'Mail', about: 'POP3 with implicit TLS.', source: { rfc: 8314 }, related: 110 },
  { port: 143, service: 'imap', title: 'IMAP', transports: ['TCP'], category: 'Mail', about: 'Access to mailboxes that stay on the server, synchronized across devices.', source: { rfc: 9051 }, exchange: 'imap', related: 993 },
  { port: 993, service: 'imaps', title: 'IMAP over TLS', transports: ['TCP'], category: 'Mail', about: 'IMAP with implicit TLS; the usual choice today.', source: { rfc: 8314 }, related: 143 },
  // ---- files
  { port: 20, service: 'ftp-data', title: 'FTP data (active mode)', transports: ['TCP'], category: 'Files', about: 'Source port of the server for data connections in active mode. Passive mode uses a dynamic port instead.', source: { rfc: 959 }, exchange: 'ftp' },
  { port: 21, service: 'ftp', title: 'FTP control', transports: ['TCP'], category: 'Files', about: 'Commands and replies of FTP; files travel in separate data connections.', source: { rfc: 959 }, exchange: 'ftp' },
  { port: 69, service: 'tftp', title: 'TFTP', transports: ['UDP'], category: 'Files', about: 'Trivial file transfer without authentication. Used for network boot (PXE) and for firmware and config files of network devices.', source: { rfc: 1350 } },
  { port: 445, service: 'microsoft-ds', title: 'SMB', transports: ['TCP'], category: 'Files', about: 'Windows file and printer sharing (SMB directly over TCP). Should never be reachable from the Internet.', source: { spec: 'Microsoft [MS-SMB2]', url: 'https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-smb2/' } },
  { port: 139, service: 'netbios-ssn', title: 'NetBIOS session', transports: ['TCP'], category: 'Files', about: 'SMB over NetBIOS, the older way before port 445.', source: { rfc: 1001 } },
  { port: 2049, service: 'nfs', title: 'NFS', transports: ['TCP', 'UDP'], category: 'Files', about: 'Network File System, common between Unix and Linux machines. NFSv4 uses TCP only.', source: { rfc: 7530 } },
  // ---- remote access
  { port: 22, service: 'ssh', title: 'SSH', transports: ['TCP'], category: 'Remote access', about: 'Encrypted remote shell, file transfer (SFTP, SCP) and tunnels.', source: { rfc: 4253, section: '4.1' }, exchange: 'ssh' },
  { port: 23, service: 'telnet', title: 'Telnet', transports: ['TCP'], category: 'Remote access', about: 'Remote shell without encryption, passwords in clear text. Replaced by SSH; still found on old network devices.', source: { rfc: 854 } },
  { port: 3389, service: 'ms-wbt-server', title: 'RDP', transports: ['TCP', 'UDP'], category: 'Remote access', about: 'Windows Remote Desktop. A frequent target of attacks when exposed to the Internet.', source: { spec: 'Microsoft [MS-RDPBCGR]', url: 'https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpbcgr/' } },
  // ---- network services
  { port: 53, service: 'domain', title: 'DNS', transports: ['UDP', 'TCP'], category: 'Network services', about: 'Name resolution. Queries use UDP; TCP is used for large answers, zone transfers and as fallback.', source: { rfc: 1035, section: '4.2' }, exchange: 'dns', related: 853 },
  { port: 853, service: 'domain-s', title: 'DNS over TLS', transports: ['TCP', 'UDP'], category: 'Network services', about: 'Encrypted DNS: over TLS on TCP (DoT), and over QUIC on UDP (DoQ).', source: { rfc: 7858 }, related: 53 },
  { port: 67, service: 'bootps', title: 'DHCP server', transports: ['UDP'], category: 'Network services', about: 'The DHCP server listens here (the name comes from BOOTP, its predecessor).', source: { rfc: 2131, section: '4.1' }, exchange: 'dhcp', related: 68 },
  { port: 68, service: 'bootpc', title: 'DHCP client', transports: ['UDP'], category: 'Network services', about: 'The DHCP client receives here. Both ports are fixed because the client has no address yet.', source: { rfc: 2131, section: '4.1' }, exchange: 'dhcp', related: 67 },
  { port: 546, service: 'dhcpv6-client', title: 'DHCPv6 client', transports: ['UDP'], category: 'Network services', about: 'DHCP for IPv6, client side.', source: { rfc: 8415, section: '7.2' }, related: 547 },
  { port: 547, service: 'dhcpv6-server', title: 'DHCPv6 server', transports: ['UDP'], category: 'Network services', about: 'DHCP for IPv6, server and relay side.', source: { rfc: 8415, section: '7.2' }, related: 546 },
  { port: 123, service: 'ntp', title: 'NTP', transports: ['UDP'], category: 'Network services', about: 'Time synchronization. Accurate clocks matter for logs, certificates and Kerberos.', source: { rfc: 5905 }, exchange: 'ntp' },
  { port: 161, service: 'snmp', title: 'SNMP', transports: ['UDP'], category: 'Network services', about: 'Monitoring and management of network devices: a manager queries agents.', source: { rfc: 3417 }, related: 162 },
  { port: 162, service: 'snmptrap', title: 'SNMP traps', transports: ['UDP'], category: 'Network services', about: 'Agents send unsolicited notifications (traps) to the manager here.', source: { rfc: 3417 }, related: 161 },
  { port: 514, service: 'syslog', title: 'Syslog', transports: ['UDP'], category: 'Network services', about: 'Log messages to a central log server. No delivery guarantee over UDP.', source: { rfc: 5426 }, exchange: 'udp' },
  { port: 137, service: 'netbios-ns', title: 'NetBIOS name service', transports: ['UDP'], category: 'Network services', about: 'Old Windows name resolution in the local network.', source: { rfc: 1002 } },
  { port: 5353, service: 'mdns', title: 'Multicast DNS', transports: ['UDP'], category: 'Voice and discovery', about: 'Name resolution in the local network without a DNS server (.local names, Bonjour, Avahi).', source: { rfc: 6762 } },
  { port: 1900, service: 'ssdp', title: 'SSDP', transports: ['UDP'], category: 'Voice and discovery', about: 'Discovery of UPnP devices such as media servers and routers in the local network.', source: { spec: 'UPnP Device Architecture 2.0', url: 'https://openconnectivity.org/developer/specifications/upnp-resources/upnp/' } },
  { port: 5060, service: 'sip', title: 'SIP', transports: ['UDP', 'TCP'], category: 'Voice and discovery', about: 'Signaling for voice over IP calls; the audio itself flows over RTP on dynamic ports.', source: { rfc: 3261 }, related: 5061 },
  { port: 5061, service: 'sips', title: 'SIP over TLS', transports: ['TCP'], category: 'Voice and discovery', about: 'SIP signaling encrypted with TLS.', source: { rfc: 3261 }, related: 5060 },
  // ---- directory and auth
  { port: 88, service: 'kerberos', title: 'Kerberos', transports: ['UDP', 'TCP'], category: 'Directory and auth', about: 'Ticket-based authentication, the core of Active Directory logons.', source: { rfc: 4120 } },
  { port: 389, service: 'ldap', title: 'LDAP', transports: ['TCP'], category: 'Directory and auth', about: 'Directory queries, for example users and groups in Active Directory.', source: { rfc: 4511 }, related: 636 },
  { port: 636, service: 'ldaps', title: 'LDAP over TLS', transports: ['TCP'], category: 'Directory and auth', about: 'LDAP with implicit TLS. Not in an RFC; the alternative is StartTLS on port 389 (RFC 4513).', source: IANA, related: 389 },
  { port: 1812, service: 'radius', title: 'RADIUS', transports: ['UDP'], category: 'Directory and auth', about: 'Central authentication for Wi-Fi (WPA2/3-Enterprise), VPN and network devices.', source: { rfc: 2865 }, related: 1813 },
  { port: 1813, service: 'radius-acct', title: 'RADIUS accounting', transports: ['UDP'], category: 'Directory and auth', about: 'Records sessions: who was connected, when and for how long.', source: { rfc: 2866 }, related: 1812 },
  // ---- routing and VPN
  { port: 179, service: 'bgp', title: 'BGP', transports: ['TCP'], category: 'Routing and VPN', about: 'Routing between networks of the Internet (autonomous systems).', source: { rfc: 4271 } },
  { port: 520, service: 'router', title: 'RIP', transports: ['UDP'], category: 'Routing and VPN', about: 'Simple distance-vector routing protocol. OSPF has no port: it runs directly on IP (protocol 89).', source: { rfc: 2453 } },
  { port: 500, service: 'isakmp', title: 'IKE', transports: ['UDP'], category: 'Routing and VPN', about: 'Key exchange for IPsec VPNs.', source: { rfc: 7296 }, related: 4500 },
  { port: 4500, service: 'ipsec-nat-t', title: 'IPsec NAT traversal', transports: ['UDP'], category: 'Routing and VPN', about: 'IKE and IPsec packets wrapped in UDP so they pass NAT devices.', source: { rfc: 3948 }, related: 500 },
  { port: 1194, service: 'openvpn', title: 'OpenVPN', transports: ['UDP', 'TCP'], category: 'Routing and VPN', about: 'Default port of OpenVPN. WireGuard has no registered port; 51820 is a convention.', source: IANA },
  // ---- databases
  { port: 1433, service: 'ms-sql-s', title: 'Microsoft SQL Server', transports: ['TCP'], category: 'Databases', about: 'Default instance of SQL Server.', source: IANA },
  { port: 3306, service: 'mysql', title: 'MySQL, MariaDB', transports: ['TCP'], category: 'Databases', about: 'Default port of MySQL and MariaDB.', source: IANA },
  { port: 5432, service: 'postgresql', title: 'PostgreSQL', transports: ['TCP'], category: 'Databases', about: 'Default port of PostgreSQL.', source: IANA },
];

export const CATEGORIES: Category[] = ['Web', 'Mail', 'Files', 'Remote access', 'Network services', 'Directory and auth', 'Routing and VPN', 'Voice and discovery', 'Databases'];

export type Range = 'system' | 'user' | 'dynamic';

/** Port ranges of RFC 6335, section 6. */
export function rangeOf(port: number): Range {
  if (port <= 1023) return 'system';
  if (port <= 49151) return 'user';
  return 'dynamic';
}

export const RANGES: Record<Range, { name: string; span: string; about: string }> = {
  system: { name: 'System ports (well-known)', span: '0 to 1023', about: 'Assigned by IANA through IETF review. On Unix-like systems only privileged processes may listen on them.' },
  user: { name: 'User ports (registered)', span: '1024 to 49151', about: 'Assigned by IANA on request, for example to applications and databases.' },
  dynamic: { name: 'Dynamic ports (private, ephemeral)', span: '49152 to 65535', about: 'Never assigned. Operating systems pick client source ports from a dynamic range: Windows uses 49152 to 65535, Linux 32768 to 60999 by default.' },
};

export interface Query {
  text: string;
  transport: 'all' | Transport;
  category: 'all' | Category;
}

export function search(q: Query): PortEntry[] {
  const t = q.text.trim().toLowerCase();
  return PORTS.filter((p) => {
    if (q.transport !== 'all' && !p.transports.includes(q.transport)) return false;
    if (q.category !== 'all' && p.category !== q.category) return false;
    if (!t) return true;
    if (/^\d+$/.test(t)) return String(p.port).startsWith(t);
    return [p.service, p.title, p.about, p.category].some((s) => s.toLowerCase().includes(t));
  }).sort((a, b) => a.port - b.port);
}

export const SOURCES: Source[] = [
  { rfc: 6335, note: 'port ranges and how IANA assigns ports' },
  IANA,
];
