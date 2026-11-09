import type { Exchange, LayerInstance, Source, Step } from '../../shared/schema';
import { SSH_OSI_NOTE, ecdhInit, ecdhReply, encryptedPacket, kexinit, newkeys, packet } from '../../shared/headers/ssh';
import { textMessage } from '../../shared/headers/text';
import { randomBytes } from './common';
import { CLIENT_LAN, TcpConversation, clientServer, dir, type Side } from './conversation';

// Addresses: IPv4 RFC 5737, MAC RFC 7042. Keys, signatures and ciphertext are deterministic
// stand-ins with the correct sizes, not real values.
const CLIENT_IP = '192.0.2.50';
const SERVER_IP = '203.0.113.22';

const conn = new TcpConversation({
  client: { mac: CLIENT_LAN.mac, ip: CLIENT_IP, port: 49988, isn: 2551390177 },
  server: { mac: '', ip: SERVER_IP, port: 22, isn: 3966120804 },
  link: 'lan',
  gatewayMac: CLIENT_LAN.gatewayMac,
  hops: 9,
  ipId: { client: 0x0f30, server: 0x83c0 },
  window: { client: 502, server: 509 },
});

const SHORTENED = 'Shortened: real OpenSSH offers more algorithms here, including post-quantum hybrids such as mlkem768x25519-sha256, which it prefers. This list keeps the ones used in this example and a few alternatives.';

const version = (from: Side, text: string) =>
  textMessage({
    id: 'ssh-version',
    name: 'SSH version string',
    short: 'SSH',
    osi: [6],
    osiNote: SSH_OSI_NOTE,
    about: 'The first thing each side sends is a line of text: "SSH-2.0-" followed by the software version, ending with CR LF. Everything after it is binary packets.',
    sources: [{ rfc: 4253, section: '4.2' }],
    summary: text.replace(/\r\n$/, ''),
    parts: [
      {
        id: 'version',
        name: 'Identification string',
        text,
        about: 'protoversion 2.0 and the software version. Both strings go into the exchange hash, so a downgrade by a man in the middle would be detected.',
        source: { rfc: 4253, section: '4.2' },
        ...(from === 'client' ? {} : { note: 'The server sends its string as soon as the connection is open.' }),
      },
    ],
  });

const CIPHERS = 'chacha20-poly1305@openssh.com,aes128-gcm@openssh.com,aes256-gcm@openssh.com,aes128-ctr';
const MACS = 'hmac-sha2-256-etm@openssh.com,hmac-sha2-512-etm@openssh.com,hmac-sha2-256';

const kexC = kexinit(
  randomBytes(16, 31),
  {
    kex: 'curve25519-sha256,curve25519-sha256@libssh.org,ecdh-sha2-nistp256,ext-info-c,kex-strict-c-v00@openssh.com',
    hostKey: 'ssh-ed25519,ecdsa-sha2-nistp256,rsa-sha2-512,rsa-sha2-256',
    enc: CIPHERS,
    mac: MACS,
    comp: 'none,zlib@openssh.com',
  },
  { unverified: { kex: SHORTENED } },
);
const kexS = kexinit(
  randomBytes(16, 32),
  {
    kex: 'curve25519-sha256,curve25519-sha256@libssh.org,ecdh-sha2-nistp256,kex-strict-s-v00@openssh.com',
    hostKey: 'rsa-sha2-512,rsa-sha2-256,ecdsa-sha2-nistp256,ssh-ed25519',
    enc: CIPHERS,
    mac: MACS,
    comp: 'none,zlib@openssh.com',
  },
  { unverified: { kex: SHORTENED } },
);

const wrap = (msg: LayerInstance, seed: number): LayerInstance[] => [packet(msg, randomBytes(16, seed)), msg];

/** SERVICE_REQUEST and SERVICE_ACCEPT for "ssh-userauth": 1 octet message number + string of 12 = 17 octets. */
const SERVICE_PAYLOAD = 1 + 4 + 'ssh-userauth'.length;
const PADDING_NOTE = 'The padding rule for chacha20-poly1305@openssh.com (alignment without the length field) is taken from the OpenSSH implementation.';

interface Turn {
  from: Side;
  id: string;
  label: string;
  layers: LayerInstance[];
  time: number;
  category: string;
  info: string;
  details: Step['details'];
  sources: Source[];
}

const turns: Turn[] = [
  {
    from: 'server',
    id: 'server-version',
    label: 'SSH-2.0 version',
    layers: [version('server', 'SSH-2.0-OpenSSH_9.9\r\n')],
    time: 0,
    category: 'version',
    info: 'Server: Protocol (SSH-2.0-OpenSSH_9.9)',
    details: {
      what: 'As soon as the TCP connection to port 22 is open, the server sends its identification string: protocol version 2.0 and its software.',
      why: 'Both sides need to agree on the protocol version before anything else. SSH-1 is long obsolete; "SSH-2.0" is the only answer you will see today.',
      keyFields: [
        { layer: 'ssh-version', field: 'version' },
        { layer: 'tcp', field: 'srcPort' },
      ],
      typical: 'The client sends its own string at the same time without waiting; neither side has to go first.',
    },
    sources: [{ rfc: 4253, section: '4.2' }],
  },
  {
    from: 'client',
    id: 'client-version',
    label: 'SSH-2.0 version',
    layers: [version('client', 'SSH-2.0-OpenSSH_9.9\r\n')],
    time: 0.2,
    category: 'version',
    info: 'Client: Protocol (SSH-2.0-OpenSSH_9.9)',
    details: {
      what: 'The client sends its identification string.',
      why: 'From now on only binary packets follow.',
      keyFields: [{ layer: 'ssh-version', field: 'version' }],
    },
    sources: [{ rfc: 4253, section: '4.2' }],
  },
  {
    from: 'client',
    id: 'client-kexinit',
    label: 'KEXINIT',
    layers: wrap(kexC, 41),
    time: 15.5,
    category: 'kex',
    info: 'Client: Key Exchange Init',
    details: {
      what: 'The client lists the algorithms it supports for each purpose: key exchange, host key type, ciphers, MACs and compression, each in its order of preference.',
      why: 'SSH negotiates every algorithm separately. For each category the result is the first algorithm in the client list that the server also has, so the client preference wins.',
      keyFields: [
        { layer: 'ssh-kexinit', field: 'kex' },
        { layer: 'ssh-kexinit', field: 'hostKey' },
        { layer: 'ssh-kexinit', field: 'encCS' },
        { layer: 'ssh-packet', field: 'paddingLength' },
        { layer: 'ssh-packet', field: 'padding' },
      ],
      typical:
        'ext-info-c and kex-strict-c-v00@openssh.com are not real algorithms but signals: the client supports extension negotiation (RFC 8308) and the strict key exchange that OpenSSH added in 2023 against the Terrapin attack.',
    },
    sources: [{ rfc: 4253, section: '7.1' }, { rfc: 4253, section: '6' }, { rfc: 8308 }],
  },
  {
    from: 'server',
    id: 'server-kexinit',
    label: 'KEXINIT',
    layers: wrap(kexS, 42),
    time: 15.6,
    category: 'kex',
    info: 'Server: Key Exchange Init',
    details: {
      what: 'The server sends its own lists. Both sides now compute the same choice: curve25519-sha256 for the key exchange, ssh-ed25519 for the host key, chacha20-poly1305@openssh.com as cipher in both directions, no compression.',
      why: 'The server prefers RSA host keys in its list, but that does not matter: the client list decides, and ssh-ed25519 is first there.',
      keyFields: [
        { layer: 'ssh-kexinit', field: 'kex' },
        { layer: 'ssh-kexinit', field: 'hostKey' },
        { layer: 'ssh-kexinit', field: 'cookie' },
      ],
      typical: 'MAC lists are still exchanged, but chacha20-poly1305 brings its own authentication, so no separate MAC is used.',
    },
    sources: [{ rfc: 4253, section: '7.1' }],
  },
  {
    from: 'client',
    id: 'ecdh-init',
    label: 'KEX_ECDH_INIT',
    layers: wrap(ecdhInit(randomBytes(32, 51)), 43),
    time: 31,
    category: 'kex',
    info: 'Client: Elliptic Curve Diffie-Hellman Key Exchange Init',
    details: {
      what: 'The client generates a fresh curve25519 key pair and sends the public key Q_C.',
      why: 'As in TLS 1.3, both sides combine their private key with the public key of the other side and get the same shared secret, which an observer cannot compute.',
      keyFields: [{ layer: 'ssh-ecdh-init', field: 'qc' }],
    },
    sources: [{ rfc: 5656, section: '4' }, { rfc: 8731, section: '3' }],
  },
  {
    from: 'server',
    id: 'ecdh-reply',
    label: 'KEX_ECDH_REPLY',
    layers: wrap(ecdhReply(randomBytes(32, 52), randomBytes(32, 53), randomBytes(64, 54)), 44),
    time: 46,
    category: 'kex',
    info: 'Server: Elliptic Curve Diffie-Hellman Key Exchange Reply',
    details: {
      what:
        'The server sends its host key K_S, its ephemeral public key Q_S, and a signature with the host key over the exchange hash H. The client computes the shared secret and H, checks the signature, and looks up the host key in ~/.ssh/known_hosts.',
      why: 'The signature proves that the server owns the private host key and that it saw the same version strings and KEXINITs as the client. There are no certificates by default: trust comes from the host key the client remembers.',
      keyFields: [
        { layer: 'ssh-ecdh-reply', field: 'ks' },
        { layer: 'ssh-ecdh-reply', field: 'qs' },
        { layer: 'ssh-ecdh-reply', field: 'sig' },
      ],
      wrong:
        'On the first connection the client does not know the key and asks the user to confirm its fingerprint (trust on first use). If a known server suddenly presents a different key, OpenSSH refuses with "REMOTE HOST IDENTIFICATION HAS CHANGED": either the server was reinstalled, or someone is in the middle.',
      insight: 'H of the first key exchange also becomes the session identifier, which later binds the user login to this very connection.',
    },
    sources: [{ rfc: 5656, section: '4' }, { rfc: 4253, section: '8' }, { rfc: 4251, section: '4.1' }, { rfc: 8709 }],
  },
  {
    from: 'server',
    id: 'server-newkeys',
    label: 'NEWKEYS',
    layers: wrap(newkeys(), 45),
    time: 46,
    category: 'kex',
    info: 'Server: New Keys',
    details: {
      what: 'The server announces that its next packets use the new keys.',
      why: 'Both sides derive six values from the shared secret and H with the hash: an IV, a cipher key and an integrity key for each direction.',
      keyFields: [{ layer: 'ssh-newkeys', field: 'msg' }],
      typical: 'With ext-info-c in the client list, the server also sends SSH_MSG_EXT_INFO (RFC 8308) right after NEWKEYS, encrypted. It is left out here.',
    },
    sources: [{ rfc: 4253, section: '7.2' }, { rfc: 4253, section: '7.3' }],
  },
  {
    from: 'client',
    id: 'client-newkeys',
    label: 'NEWKEYS',
    layers: wrap(newkeys(), 46),
    time: 61.5,
    category: 'kex',
    info: 'Client: New Keys',
    details: {
      what: 'The client also switches to the new keys. The key exchange is complete.',
      why: 'Each direction switches on its own NEWKEYS, so no packet is ever ambiguous about which keys protect it.',
      keyFields: [{ layer: 'ssh-newkeys', field: 'msg' }],
      insight: 'Strict key exchange (kex-strict) also resets the packet sequence numbers here, which closes the Terrapin attack on the sequence numbers of the unencrypted phase.',
    },
    sources: [{ rfc: 4253, section: '7.3' }],
  },
  {
    from: 'client',
    id: 'service-request',
    label: 'SERVICE_REQUEST',
    layers: [encryptedPacket(SERVICE_PAYLOAD, randomBytes(64, 61), 'SERVICE_REQUEST "ssh-userauth" (encrypted)', { unverified: { encPacket: PADDING_NOTE } })],
    time: 61.6,
    category: 'encrypted',
    info: 'Client: Encrypted packet (len=44)',
    details: {
      what: 'The first encrypted packet: the client asks for the service "ssh-userauth", to log in next.',
      why: 'SSH is layered: the transport layer (this exchange) provides a secure channel, the authentication protocol (RFC 4252) logs the user in on top of it, and the connection protocol (RFC 4254) then opens shells, file transfers and port forwardings as channels.',
      keyFields: [
        { layer: 'ssh-encrypted', field: 'encLength' },
        { layer: 'ssh-encrypted', field: 'encPacket' },
        { layer: 'ssh-encrypted', field: 'tag' },
      ],
      typical: 'From here on an observer sees only the sizes and timing of packets. Interactive sessions still leak typing rhythm, which is why OpenSSH adds dummy packets while you type (since version 9.5).',
    },
    sources: [{ rfc: 4253, section: '10' }, { rfc: 4252 }, { rfc: 4254 }],
  },
  {
    from: 'server',
    id: 'service-accept',
    label: 'SERVICE_ACCEPT',
    layers: [encryptedPacket(SERVICE_PAYLOAD, randomBytes(64, 62), 'SERVICE_ACCEPT "ssh-userauth" (encrypted)', { unverified: { encPacket: PADDING_NOTE } })],
    time: 76.7,
    category: 'encrypted',
    info: 'Server: Encrypted packet (len=44)',
    details: {
      what: 'The server accepts. Next the client authenticates the user, typically with a public key from ~/.ssh, and opens a session channel for the shell.',
      why: 'User authentication happens inside the encrypted channel, so passwords and key signatures are never exposed.',
      keyFields: [
        { layer: 'ssh-encrypted', field: 'encPacket' },
        { layer: 'ssh-encrypted', field: 'tag' },
      ],
      insight: 'SFTP and scp run as subsystems over such a channel. That is why SFTP, despite the name, has nothing to do with FTP.',
    },
    sources: [{ rfc: 4253, section: '10' }, { rfc: 4252, section: '7' }],
  },
];

const steps: Step[] = turns.map((t) => ({
  id: t.id,
  ...dir(t.from),
  label: t.label,
  time: t.time,
  category: t.category,
  protocol: t.category === 'version' ? 'SSH' : 'SSHv2',
  info: t.info,
  details: t.details,
  captures: [conn.segment(t.from, t.layers)],
  sources: t.sources,
}));

export const sshExchange: Exchange = {
  id: 'ssh',
  title: 'SSH',
  summary: 'Version strings, algorithm negotiation, curve25519 key exchange with host key signature, and the switch to encryption.',
  group: 'Security',
  scenario: 'A user runs ssh to a server at 203.0.113.22. The TCP connection to port 22 is open (see the TCP exchange). Client and server set up the encrypted transport before the user logs in.',
  intro:
    'SSH builds a secure channel in three phases: both sides exchange version strings in clear text, negotiate algorithms with KEXINIT, and run a key exchange in which the server proves its identity with its host key. After NEWKEYS everything is encrypted, including the user login that follows. Unlike TLS, SSH does not normally use certificates: the client remembers the host key from the first connection. The algorithm lists are shortened, and keys, signatures and ciphertext are stand-ins with the correct sizes. Times are illustrative, with a round trip of 30 ms.',
  sources: [
    { rfc: 4251, note: 'SSH protocol architecture' },
    { rfc: 4253, note: 'SSH transport layer protocol' },
    { rfc: 4250, note: 'SSH assigned numbers' },
    { rfc: 4252, note: 'SSH authentication protocol' },
    { rfc: 4254, note: 'SSH connection protocol' },
    { rfc: 5656, note: 'Elliptic curve key exchange in SSH' },
    { rfc: 8731, note: 'curve25519-sha256' },
    { rfc: 8709, note: 'Ed25519 host keys' },
    { rfc: 8308, note: 'Extension negotiation' },
    { spec: 'OpenSSH PROTOCOL.chacha20poly1305', url: 'https://cvsweb.openbsd.org/src/usr.bin/ssh/PROTOCOL.chacha20poly1305' },
    { rfc: 5737, note: 'Documentation IPv4 addresses used here' },
  ],
  ...clientServer({ client: { label: 'Client', ip: CLIENT_IP }, server: { label: 'SSH server', ip: SERVER_IP, note: 'Port 22' } }),
  categories: [
    { id: 'version', label: 'Version exchange', color: 'blue' },
    { id: 'kex', label: 'Key exchange', color: 'yellow' },
    { id: 'encrypted', label: 'Encrypted', color: 'purple' },
  ],
  steps,
};
