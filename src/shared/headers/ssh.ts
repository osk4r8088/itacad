import type { FieldDef, LayerDef, LayerInstance, Source } from '../schema';
import { buildStruct, type Annotations } from '../lib/build';
import { ascii, concat, hexBytes } from '../lib/encode';

// SSH transport layer: RFC 4253. Key exchange with curve25519: RFC 8731 and RFC 5656 section 4.
// Data types (string, name-list, uint32): RFC 4251 section 5.

export const SSH_OSI_NOTE =
  'The SSH transport layer protocol does not map cleanly to OSI. It runs on top of TCP and provides encryption, integrity and server authentication, which OSI places in the presentation layer. Login and channels (RFC 4252, RFC 4254) run on top of it.';

const T = (section: string): Source => ({ rfc: 4253, section });

function layer(id: string, name: string, short: string, about: string, fields: FieldDef[], sources: Source[], trailer?: FieldDef[]): LayerDef {
  return { id, name, short, osi: [6], osiNote: SSH_OSI_NOTE, tcpip: 'application', about, fields, ...(trailer ? { trailer } : {}), sources };
}

export const packetDef = layer(
  'ssh-packet',
  'SSH binary packet',
  'SSH packet',
  'Every SSH message after the version strings travels in a binary packet: a length, a padding length, the message (payload) and random padding, followed by a MAC once keys are in place. The padding makes the total a multiple of the cipher block size (at least 8) and hides the exact message length.',
  [
    { id: 'packetLength', name: 'packet_length', bits: 32, about: 'Length of the packet in octets, not counting this field and the MAC.', source: T('6') },
    { id: 'paddingLength', name: 'padding_length', bits: 8, about: 'Length of the random padding, at least 4 octets.', source: T('6') },
  ],
  [T('6')],
  [
    { id: 'padding', name: 'random padding', bits: 'variable', about: 'Random octets, so that the packet length is a multiple of 8 (or the cipher block size).', source: T('6') },
    { id: 'mac', name: 'mac', bits: 'variable', about: 'Message authentication code. Empty during the first key exchange, when no keys exist yet.', source: T('6') },
  ],
);

const msgField = (n: number, name: string): FieldDef => ({ id: 'msg', name: 'message number', bits: 8, about: `${n} = ${name}.`, source: { rfc: 4250, section: '4.1' } });
const nameList = (id: string, name: string, about: string): FieldDef => ({
  id,
  name,
  bits: 'variable',
  about: `${about} A name-list: a uint32 length and comma-separated names, in order of preference.`,
  source: T('7.1'),
});

export const kexinitDef = layer(
  'ssh-kexinit',
  'SSH_MSG_KEXINIT',
  'KEXINIT',
  'Both sides send KEXINIT with their supported algorithms. For each category the chosen algorithm is the first one in the client list that the server also supports. No round trip is wasted: both send at the same time.',
  [
    msgField(20, 'SSH_MSG_KEXINIT'),
    { id: 'cookie', name: 'cookie', bits: 128, compact: true, about: '16 random octets, so the exchange hash differs even if all other values repeat.', source: T('7.1') },
    nameList('kex', 'kex_algorithms', 'Key exchange methods.'),
    nameList('hostKey', 'server_host_key_algorithms', 'Algorithms for the server host key.'),
    nameList('encCS', 'encryption_algorithms_client_to_server', 'Ciphers, client to server.'),
    nameList('encSC', 'encryption_algorithms_server_to_client', 'Ciphers, server to client.'),
    nameList('macCS', 'mac_algorithms_client_to_server', 'MAC algorithms, client to server. Not used with AEAD ciphers such as chacha20-poly1305.'),
    nameList('macSC', 'mac_algorithms_server_to_client', 'MAC algorithms, server to client.'),
    nameList('compCS', 'compression_algorithms_client_to_server', 'Compression, client to server.'),
    nameList('compSC', 'compression_algorithms_server_to_client', 'Compression, server to client.'),
    nameList('langCS', 'languages_client_to_server', 'Language tags, usually empty.'),
    nameList('langSC', 'languages_server_to_client', 'Language tags, usually empty.'),
    { id: 'firstFollows', name: 'first_kex_packet_follows', bits: 8, about: 'Whether a guessed key exchange packet follows right away. Usually 0.', source: T('7.1') },
    { id: 'reserved', name: 'reserved', bits: 32, about: 'Reserved for future extension, 0.', source: T('7.1') },
  ],
  [T('7.1')],
);

export const ecdhInitDef = layer(
  'ssh-ecdh-init',
  'SSH_MSG_KEX_ECDH_INIT',
  'ECDH_INIT',
  'The client sends its ephemeral public key for the key exchange.',
  [msgField(30, 'SSH_MSG_KEX_ECDH_INIT'), { id: 'qc', name: 'Q_C', bits: 'variable', about: 'string: the client ephemeral public key, 32 octets for curve25519.', source: { rfc: 5656, section: '4' } }],
  [{ rfc: 5656, section: '4' }, { rfc: 8731, section: '3' }],
);

export const ecdhReplyDef = layer(
  'ssh-ecdh-reply',
  'SSH_MSG_KEX_ECDH_REPLY',
  'ECDH_REPLY',
  'The server sends its host key, its ephemeral public key and a signature over the exchange hash. The client now has everything to compute the shared secret and to check who it is talking to.',
  [
    msgField(31, 'SSH_MSG_KEX_ECDH_REPLY'),
    { id: 'ks', name: 'K_S', bits: 'variable', about: 'string: the server public host key, here type "ssh-ed25519" and 32 octets of key.', source: { rfc: 5656, section: '4' } },
    { id: 'qs', name: 'Q_S', bits: 'variable', about: 'string: the server ephemeral public key, 32 octets for curve25519.', source: { rfc: 5656, section: '4' } },
    {
      id: 'sig',
      name: 'signature',
      bits: 'variable',
      about: 'string: signature with the host key over the exchange hash H, a hash over both version strings, both KEXINITs, K_S, Q_C, Q_S and the shared secret.',
      source: { rfc: 5656, section: '4' },
    },
  ],
  [{ rfc: 5656, section: '4' }, { rfc: 8731, section: '3' }, { rfc: 8709 }],
);

export const newkeysDef = layer(
  'ssh-newkeys',
  'SSH_MSG_NEWKEYS',
  'NEWKEYS',
  'Says "from my next packet on, I use the new keys". Each side sends it and switches its sending direction; it switches receiving when it gets the NEWKEYS of the peer.',
  [msgField(21, 'SSH_MSG_NEWKEYS')],
  [T('7.3')],
);

export const encryptedDef = layer(
  'ssh-encrypted',
  'Encrypted SSH packet (chacha20-poly1305@openssh.com)',
  'Encrypted',
  'With chacha20-poly1305@openssh.com the packet length is encrypted with its own key, and the rest of the packet (padding length, payload, padding) with the main key. A 16-octet Poly1305 tag authenticates both. The octets shown are random stand-ins, not real ciphertext.',
  [
    { id: 'encLength', name: 'encrypted packet_length', bits: 32, about: 'The packet length, encrypted, so an observer cannot read message boundaries directly from it.', source: { spec: 'OpenSSH PROTOCOL.chacha20poly1305' } },
    { id: 'encPacket', name: 'encrypted packet', bits: 'variable', compact: true, about: 'padding_length, payload and padding, encrypted.', source: T('6') },
    { id: 'tag', name: 'Poly1305 tag', bits: 128, compact: true, about: 'Authentication tag over the encrypted length and packet.', source: { spec: 'OpenSSH PROTOCOL.chacha20poly1305' } },
  ],
  [T('6'), { spec: 'OpenSSH PROTOCOL.chacha20poly1305', url: 'https://cvsweb.openbsd.org/src/usr.bin/ssh/PROTOCOL.chacha20poly1305' }],
);

// ---- SSH data types, RFC 4251 section 5

const u32 = (n: number) => Uint8Array.of(n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff);
export const sshString = (b: Uint8Array) => concat(u32(b.length), b);

// ---- builders

/** Wraps a message in a binary packet with padding to a multiple of 8 (no MAC: before NEWKEYS). */
export function packet(message: LayerInstance, padding: Uint8Array): LayerInstance {
  const len = message.bytes.length;
  let pad = 8 - ((4 + 1 + len) % 8);
  if (pad < 4) pad += 8;
  const packetLength = 1 + len + pad;
  return buildStruct(
    packetDef,
    {
      packetLength: { raw: packetLength, display: `${packetLength} (1 + ${len} payload + ${pad} padding)` },
      paddingLength: { raw: pad, display: String(pad) },
      padding: { raw: padding.subarray(0, pad), display: `${pad} random octets` },
      mac: { raw: new Uint8Array(0), display: 'none (no keys yet)' },
    },
    {},
    `${packetLength + 4} octets`,
  );
}

const strDisplay = (s: string) => `"${s}"`;

export interface KexinitLists {
  kex: string;
  hostKey: string;
  enc: string;
  mac: string;
  comp: string;
}

export function kexinit(cookie: Uint8Array, l: KexinitLists, ann: Annotations = {}): LayerInstance {
  const list = (s: string) => ({ raw: sshString(ascii(s)), display: s === '' ? '(empty)' : s.split(',').join(', ') });
  return buildStruct(
    kexinitDef,
    {
      msg: { raw: 20, display: '20 (KEXINIT)' },
      cookie: { raw: cookie, display: `${hexBytes(cookie.subarray(0, 6))} ... (16 random octets)` },
      kex: list(l.kex),
      hostKey: list(l.hostKey),
      encCS: list(l.enc),
      encSC: list(l.enc),
      macCS: list(l.mac),
      macSC: list(l.mac),
      compCS: list(l.comp),
      compSC: list(l.comp),
      langCS: list(''),
      langSC: list(''),
      firstFollows: { raw: 0, display: '0 (false)' },
      reserved: { raw: 0, display: '0' },
    },
    ann,
    'KEXINIT',
  );
}

export function ecdhInit(qc: Uint8Array): LayerInstance {
  return buildStruct(
    ecdhInitDef,
    { msg: { raw: 30, display: '30 (KEX_ECDH_INIT)' }, qc: { raw: sshString(qc), display: `length 32, ${hexBytes(qc.subarray(0, 4))} ...` } },
    {},
    'KEX_ECDH_INIT',
  );
}

export function ecdhReply(hostKey: Uint8Array, qs: Uint8Array, signature: Uint8Array): LayerInstance {
  const ks = sshString(concat(sshString(ascii('ssh-ed25519')), sshString(hostKey)));
  const sig = sshString(concat(sshString(ascii('ssh-ed25519')), sshString(signature)));
  return buildStruct(
    ecdhReplyDef,
    {
      msg: { raw: 31, display: '31 (KEX_ECDH_REPLY)' },
      ks: { raw: ks, display: `${strDisplay('ssh-ed25519')} + 32-octet key ${hexBytes(hostKey.subarray(0, 4))} ... (${ks.length} octets)` },
      qs: { raw: sshString(qs), display: `length 32, ${hexBytes(qs.subarray(0, 4))} ...` },
      sig: { raw: sig, display: `${strDisplay('ssh-ed25519')} + 64-octet signature (${sig.length} octets)` },
    },
    {},
    'KEX_ECDH_REPLY',
  );
}

export function newkeys(): LayerInstance {
  return buildStruct(newkeysDef, { msg: { raw: 21, display: '21 (NEWKEYS)' } }, {}, 'NEWKEYS');
}

/**
 * An encrypted packet. With chacha20-poly1305@openssh.com the padding aligns
 * padding_length + payload + padding to 8 octets, without the length field.
 */
export function encryptedPacket(payloadLength: number, random: Uint8Array, summary: string, ann: Annotations = {}): LayerInstance {
  let pad = 8 - ((1 + payloadLength) % 8);
  if (pad < 4) pad += 8;
  const body = 1 + payloadLength + pad;
  return buildStruct(
    encryptedDef,
    {
      encLength: { raw: random.subarray(0, 4), display: `${hexBytes(random.subarray(0, 4))} (encrypted value ${body})` },
      encPacket: { raw: random.subarray(4, 4 + body), display: `${body} octets: padding_length, ${payloadLength} octets of payload, ${pad} of padding` },
      tag: { raw: random.subarray(4 + body, 20 + body), display: `${hexBytes(random.subarray(4 + body, 8 + body))} ... (16 octets)` },
    },
    ann,
    summary,
  );
}
