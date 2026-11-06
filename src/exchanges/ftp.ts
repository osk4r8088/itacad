import type { Exchange, LayerInstance, Source, Step } from '../schema';
import { textMessage } from '../headers/text';
import { CLIENT_LAN, TcpConversation, clientServer, dir, type Side } from './conversation';

// Addresses: IPv4 RFC 5737, MAC RFC 7042, names RFC 2606. The password is made up.
const CLIENT_IP = '192.0.2.50';
const SERVER_IP = '203.0.113.21';
const DATA_PORT = 195 * 256 + 149;

const common = { link: 'lan', gatewayMac: CLIENT_LAN.gatewayMac, hops: 9, window: { client: 502, server: 509 } };
const control = new TcpConversation({
  ...common,
  client: { mac: CLIENT_LAN.mac, ip: CLIENT_IP, port: 50122, isn: 3311004719 },
  server: { mac: '', ip: SERVER_IP, port: 21, isn: 1440297265 },
  ipId: { client: 0x3b00, server: 0x6610 },
});
const data = new TcpConversation({
  ...common,
  client: { mac: CLIENT_LAN.mac, ip: CLIENT_IP, port: 50124, isn: 2093158822 },
  server: { mac: '', ip: SERVER_IP, port: DATA_PORT, isn: 618402339 },
  ipId: { client: 0x3b07, server: 0x6616 },
});

const FILE = 'Welcome to ftp.example.com.\r\nThis file was sent over a separate data connection.\r\n';
const FILE_LEN = FILE.length;

const SOURCES: Source[] = [{ rfc: 959 }];
const ABOUT =
  'FTP control messages are lines of text on the control connection (port 21). Commands are four letters or fewer with arguments; replies start with a three-digit code. The first digit: 1 preliminary (wait for another reply), 2 success, 3 need more information, 4 temporary failure, 5 permanent failure.';

function line(from: Side, text: string, about: string, source: Source, summary: string): LayerInstance {
  const cmd = from === 'client';
  return textMessage({
    id: 'ftp',
    name: cmd ? 'FTP command' : 'FTP reply',
    short: 'FTP',
    about: ABOUT,
    sources: SOURCES,
    summary,
    parts: [{ id: cmd ? 'command' : 'reply', name: cmd ? 'Command' : 'Reply', text, about, source }],
  });
}

const fileData = textMessage({
  id: 'ftp-data',
  name: 'File data',
  short: 'Data',
  about:
    'The content of the file, sent raw on the data connection: no header, no framing. In ASCII mode (the default type) lines end with CR LF on the wire, whatever the convention of the systems. The end of the file is the end of the connection.',
  sources: [{ rfc: 959, section: '3.1.1.1' }, { rfc: 959, section: '3.4' }],
  summary: `readme.txt, ${FILE_LEN} octets`,
  parts: [{ id: 'data', name: 'Data', text: FILE, about: 'The file readme.txt.' }],
});

const keyCmd = [{ layer: 'ftp', field: 'command' }];
const keyReply = [{ layer: 'ftp', field: 'reply' }];

interface ControlTurn {
  from: Side;
  id: string;
  label: string;
  text: string;
  about: string;
  partSource: Source;
  time: number;
  details: Step['details'];
  sources: Source[];
}

function controlStep(t: ControlTurn): Step {
  const msg = line(t.from, t.text, t.about, t.partSource, t.label);
  return {
    id: t.id,
    ...dir(t.from),
    label: t.label,
    time: t.time,
    category: t.from === 'client' ? 'command' : 'reply',
    protocol: 'FTP',
    info: `${t.from === 'client' ? 'Request' : 'Response'}: ${t.text.replace(/\r\n$/, '')}`,
    details: t.details,
    captures: [control.segment(t.from, msg)],
    sources: t.sources,
  };
}

const steps: Step[] = [
  controlStep({
    from: 'server',
    id: 'greeting',
    label: '220 ready',
    text: '220 ftp.example.com FTP server ready.\r\n',
    about: '220: service ready for a new user.',
    partSource: { rfc: 959, section: '4.2' },
    time: 0,
    details: {
      what: 'The control connection to port 21 is open. The server speaks first and announces that it is ready.',
      why: 'Like SMTP, FTP is a dialogue of text lines, and the server starts it.',
      keyFields: [...keyReply, { layer: 'tcp', field: 'srcPort' }],
    },
    sources: [{ rfc: 959, section: '5.4' }],
  }),
  controlStep({
    from: 'client',
    id: 'user',
    label: 'USER',
    text: 'USER alice\r\n',
    about: 'USER: the user name for the login.',
    partSource: { rfc: 959, section: '4.1.1' },
    time: 1,
    details: {
      what: 'The client sends the user name.',
      why: 'Login is a two-step dialogue: user name first, then the server decides whether it needs a password.',
      keyFields: keyCmd,
      typical: 'Public archives used the user name "anonymous" with an e-mail address as password.',
    },
    sources: [{ rfc: 959, section: '4.1.1' }],
  }),
  controlStep({
    from: 'server',
    id: 'need-pass',
    label: '331 need password',
    text: '331 Please specify the password.\r\n',
    about: '331: user name okay, password needed.',
    partSource: { rfc: 959, section: '4.2' },
    time: 31,
    details: {
      what: 'The server accepts the name and asks for the password.',
      why: 'Replies starting with 3 mean "send more": the login is not finished.',
      keyFields: keyReply,
    },
    sources: [{ rfc: 959, section: '4.2' }],
  }),
  controlStep({
    from: 'client',
    id: 'pass',
    label: 'PASS',
    text: 'PASS s3cret\r\n',
    about: 'PASS: the password, in plain text.',
    partSource: { rfc: 959, section: '4.1.1' },
    time: 32,
    details: {
      what: 'The client sends the password. Look at the packet: it is right there in plain text.',
      why: 'FTP was designed in the 1970s and 1980s for trusted networks. It has no encryption of its own.',
      keyFields: keyCmd,
      wrong:
        'Anybody who can see the traffic, on the same Wi-Fi or anywhere on the path, can read user name and password. Use FTPS (FTP over TLS, RFC 4217) or, more commonly, SFTP, which is a different protocol on top of SSH.',
    },
    sources: [{ rfc: 959, section: '4.1.1' }, { rfc: 4217 }],
  }),
  controlStep({
    from: 'server',
    id: 'logged-in',
    label: '230 logged in',
    text: '230 Login successful.\r\n',
    about: '230: user logged in, proceed.',
    partSource: { rfc: 959, section: '4.2' },
    time: 62,
    details: {
      what: 'The login succeeded.',
      why: 'From now on the session acts with the rights of user alice on the server.',
      keyFields: keyReply,
    },
    sources: [{ rfc: 959, section: '4.2' }],
  }),
  controlStep({
    from: 'client',
    id: 'pasv',
    label: 'PASV',
    text: 'PASV\r\n',
    about: 'PASV: asks the server to listen on a data port and wait for the client to connect.',
    partSource: { rfc: 959, section: '4.1.2' },
    time: 63,
    details: {
      what: 'Before transferring a file, the client asks for passive mode: the server should open a port for the data connection, and the client will connect to it.',
      why: 'FTP sends file data over a second TCP connection. In the original active mode (PORT command) the server connects back to the client, which fails behind NAT and firewalls. In passive mode both connections go from client to server.',
      keyFields: keyCmd,
      typical: 'Modern clients prefer EPSV (RFC 2428), which also works with IPv6 and returns only a port number.',
    },
    sources: [{ rfc: 959, section: '4.1.2' }, { rfc: 2428 }, { rfc: 1579 }],
  }),
  controlStep({
    from: 'server',
    id: 'passive',
    label: '227 passive',
    text: '227 Entering Passive Mode (203,0,113,21,195,149).\r\n',
    about: '227: the server listens; the six numbers are the IPv4 address and the port, port = 195 x 256 + 149.',
    partSource: { rfc: 959, section: '4.1.2' },
    time: 93,
    details: {
      what: `The server listens on a new port and tells the client where: (203,0,113,21,195,149) means address 203.0.113.21 and port 195 x 256 + 149 = ${DATA_PORT}.`,
      why: 'The address and port travel inside the application data. That is unusual: most protocols leave addresses to the IP and TCP headers.',
      keyFields: keyReply,
      wrong:
        'Because the address is inside the text, a NAT router that rewrites addresses in IP headers breaks FTP unless it also rewrites this line (an FTP helper or ALG). A server behind NAT that reports its private address sends clients to a place they cannot reach.',
    },
    sources: [{ rfc: 959, section: '4.1.2' }, { rfc: 959, section: '4.2' }],
  }),
  {
    id: 'data-syn',
    ...dir('client'),
    label: 'SYN to data port',
    time: 94,
    category: 'data',
    protocol: 'TCP',
    info: `50124 → ${DATA_PORT} [SYN] Seq=0`,
    details: {
      what: `The client opens the data connection: a new TCP connection from a new local port (50124) to port ${DATA_PORT}. The SYN-ACK and ACK that complete the handshake are not shown.`,
      why: 'Control and data are separate connections, so commands can still be sent while a long transfer runs (for example ABOR to cancel it).',
      keyFields: [
        { layer: 'tcp', field: 'dstPort' },
        { layer: 'tcp', field: 'srcPort' },
        { layer: 'tcp', field: 'flagSYN' },
      ],
      typical: 'A real SYN carries options such as MSS and Window Scale; they are left out here.',
    },
    captures: [data.segment('client', undefined, ['SYN'], 'As sent by the client: the first segment of the data connection.')],
    sources: [{ rfc: 959, section: '3.2' }, { rfc: 9293, section: '3.5' }],
  },
  controlStep({
    from: 'client',
    id: 'retr',
    label: 'RETR',
    text: 'RETR readme.txt\r\n',
    about: 'RETR: send me a copy of this file over the data connection.',
    partSource: { rfc: 959, section: '4.1.3' },
    time: 125,
    details: {
      what: 'With the data connection open, the client asks for the file readme.txt on the control connection.',
      why: 'The command travels on the control connection; only the file itself goes over the data connection.',
      keyFields: keyCmd,
      typical: 'The transfer type is ASCII, the FTP default. For binary files a client sends TYPE I first, otherwise line endings would be converted and the file damaged.',
    },
    sources: [{ rfc: 959, section: '4.1.3' }, { rfc: 959, section: '3.1.1' }],
  }),
  controlStep({
    from: 'server',
    id: 'opening',
    label: '150 opening',
    text: `150 Opening ASCII mode data connection for readme.txt (${FILE_LEN} bytes).\r\n`,
    about: '150: preliminary reply, the transfer starts. Another reply will follow when it is done.',
    partSource: { rfc: 959, section: '4.2' },
    time: 155,
    details: {
      what: 'The server confirms that the transfer begins.',
      why: 'Codes starting with 1 are preliminary: the command is accepted but not finished, so the client waits for a second reply.',
      keyFields: keyReply,
    },
    sources: [{ rfc: 959, section: '4.2' }, { rfc: 959, section: '5.4' }],
  }),
  {
    id: 'file',
    ...dir('server'),
    label: 'File data + FIN',
    time: 156,
    category: 'data',
    protocol: 'FTP-DATA',
    info: `FTP Data: ${FILE_LEN} bytes (PASV) (RETR readme.txt)`,
    details: {
      what: 'The server sends the file content on the data connection and closes it right away: this segment carries the data and the FIN flag.',
      why: 'In stream mode, the default, the end of the file is marked by closing the data connection. There is no length field.',
      keyFields: [
        { layer: 'ftp-data', field: 'data' },
        { layer: 'tcp', field: 'flagFIN' },
        { layer: 'tcp', field: 'srcPort' },
      ],
      typical: 'The client acknowledges and closes its side too; those segments are not shown. A new transfer needs a new data connection.',
      insight: 'A small file fits in one segment. A large one would be many segments on the data connection, while the control connection stays silent until the end.',
    },
    captures: [data.segment('server', fileData, ['FIN', 'PSH', 'ACK'], 'As delivered to the client, on the data connection.')],
    sources: [{ rfc: 959, section: '3.4.1' }, { rfc: 959, section: '3.3' }],
  },
  controlStep({
    from: 'server',
    id: 'complete',
    label: '226 complete',
    text: '226 Transfer complete.\r\n',
    about: '226: the data connection is closed, the transfer succeeded.',
    partSource: { rfc: 959, section: '4.2' },
    time: 157,
    details: {
      what: 'On the control connection the server reports that the transfer is complete.',
      why: 'The closed data connection alone could also mean a failure; this reply confirms success.',
      keyFields: keyReply,
      insight: 'Two connections, addresses inside the payload, passwords in plain text: FTP shows many of the problems later protocols were designed to avoid. HTTP downloads use one connection and a Content-Length instead.',
    },
    sources: [{ rfc: 959, section: '4.2' }, { rfc: 959, section: '5.4' }],
  }),
];

export const ftpExchange: Exchange = {
  id: 'ftp',
  title: 'FTP',
  summary: 'Login, passive mode and a file download over a second connection.',
  group: 'Application',
  scenario:
    'A user downloads readme.txt from ftp.example.com with an FTP client. The control connection to port 21 is already open (see the TCP exchange for the handshake).',
  intro:
    'FTP separates control from data. Commands and replies travel as text lines on a control connection to port 21; each file transfer gets its own data connection. In passive mode, shown here, the server tells the client which port to connect to for the data. FTP has no encryption: user name, password and files cross the network readable. It is mostly replaced by SFTP (over SSH) and HTTPS today, but its design still explains many NAT and firewall rules. Times are illustrative, with a round trip of 30 ms.',
  sources: [
    { rfc: 959, note: 'File Transfer Protocol' },
    { rfc: 1579, note: 'Firewall-friendly FTP (passive mode)' },
    { rfc: 2428, note: 'EPSV and EPRT for IPv6 and NAT' },
    { rfc: 4217, note: 'FTP over TLS' },
    { rfc: 9293, note: 'TCP' },
    { rfc: 5737, note: 'Documentation IPv4 addresses used here' },
  ],
  ...clientServer({ client: { label: 'Client', ip: CLIENT_IP }, server: { label: 'FTP server', ip: SERVER_IP, note: 'ftp.example.com, port 21' } }),
  categories: [
    { id: 'command', label: 'Command (control)', color: 'blue' },
    { id: 'reply', label: 'Reply (control)', color: 'green' },
    { id: 'data', label: 'Data connection', color: 'purple' },
  ],
  steps,
};
