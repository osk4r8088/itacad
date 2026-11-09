import type { FieldDef, LayerDef, LayerInstance, Source, StructDef, StructInstance } from '../schema';
import { buildStruct, type Annotations } from '../lib/build';
import { ascii, concat, hex, hexBytes } from '../lib/encode';

// TLS 1.3: RFC 8446. Record layer section 5, handshake messages section 4, extensions 4.2.

const OSI_NOTE =
  'TLS does not fit the OSI model cleanly. It runs on top of TCP and below the application, and it provides encryption and integrity, which OSI places in the presentation layer. In the TCP/IP model it is part of the application layer.';

const R = (section: string): Source => ({ rfc: 8446, section });

export const tlsRecordDef: LayerDef = {
  id: 'tls-record',
  name: 'TLS record header',
  short: 'TLS',
  osi: [6],
  osiNote: OSI_NOTE,
  tcpip: 'application',
  about:
    'TLS cuts its data into records, each with a 5-octet header: content type, a legacy version and the length of what follows. Handshake messages, alerts and application data all travel in records. Once keys are in place, every record is encrypted and looks like application data from the outside.',
  fields: [
    {
      id: 'type',
      name: 'ContentType',
      bits: 8,
      about: '22 = handshake, 20 = change_cipher_spec, 21 = alert, 23 = application_data. Encrypted records always show 23; the real type is inside the encryption.',
      source: R('5.1'),
    },
    {
      id: 'version',
      name: 'legacy_record_version',
      bits: 16,
      about: 'Fixed values kept for old middleboxes: 0x0303 (the number of TLS 1.2), or 0x0301 in the first ClientHello. The real version is negotiated in the supported_versions extension.',
      source: R('5.1'),
    },
    { id: 'length', name: 'length', bits: 16, about: 'Length of the record content in octets, at most 2^14 for plaintext and 2^14 + 256 for encrypted records.', source: R('5.1') },
  ],
  sources: [R('5.1'), R('5.2')],
};

// ---- extensions

const extDefs = new Map<number, StructDef>();
function extDef(type: number, name: string, about: string, source: Source): StructDef {
  const def: StructDef = {
    id: `tls-ext-${type}`,
    name: `${name} (${type})`,
    about,
    fields: [
      { id: 'type', name: 'extension_type', bits: 16, about: `${type} = ${name}.` },
      { id: 'length', name: 'extension_data length', bits: 16, about: 'Length of the extension data in octets.' },
      { id: 'data', name: 'extension_data', bits: 'variable', about },
    ],
    sources: [source],
  };
  extDefs.set(type, def);
  return def;
}

extDef(0, 'server_name', 'Server Name Indication: the host name the client wants. One server address can host many sites, and the server needs the name to pick the right certificate. Sent in clear text.', { rfc: 6066, section: '3' });
extDef(10, 'supported_groups', 'The key exchange groups the client supports, in order of preference.', R('4.2.7'));
extDef(13, 'signature_algorithms', 'Signature algorithms the client accepts in CertificateVerify.', R('4.2.3'));
extDef(16, 'application_layer_protocol_negotiation', 'ALPN: the application protocols the client can speak over this connection; the server picks one.', { rfc: 7301, section: '3.1' });
extDef(43, 'supported_versions', 'The TLS versions the client supports. In the ServerHello: the version the server chose. This is where TLS 1.3 is really negotiated.', R('4.2.1'));
extDef(45, 'psk_key_exchange_modes', 'How a pre-shared key from an earlier session may be used: 1 = psk_dhe_ke, together with a fresh key exchange.', R('4.2.9'));
extDef(51, 'key_share', 'Ephemeral public keys for the key exchange. The client sends one per group it guesses the server will accept; the server answers with its own share for one group.', R('4.2.8'));

export type TlsExt = { type: number; data: Uint8Array; display: string; summary: string };

function buildExt(e: TlsExt): StructInstance {
  const def = extDefs.get(e.type)!;
  return buildStruct(
    def,
    {
      type: { raw: e.type, display: String(e.type) },
      length: { raw: e.data.length, display: String(e.data.length) },
      data: { raw: e.data, display: e.display },
    },
    {},
    e.summary,
  );
}

const u16 = (n: number) => Uint8Array.of(n >> 8, n & 0xff);
const u8 = (n: number) => Uint8Array.of(n);
/** A vector with a length prefix of 1 or 2 octets, RFC 8446 section 3.4. */
const vec = (prefix: 1 | 2, body: Uint8Array) => concat(prefix === 1 ? u8(body.length) : u16(body.length), body);

export const GROUPS: Record<number, string> = { 0x001d: 'x25519', 0x0017: 'secp256r1', 0x11ec: 'X25519MLKEM768' };
export const SUITES: Record<number, string> = { 0x1301: 'TLS_AES_128_GCM_SHA256', 0x1302: 'TLS_AES_256_GCM_SHA384', 0x1303: 'TLS_CHACHA20_POLY1305_SHA256' };
const SIGS: Record<number, string> = { 0x0403: 'ecdsa_secp256r1_sha256', 0x0804: 'rsa_pss_rsae_sha256', 0x0401: 'rsa_pkcs1_sha256', 0x0807: 'ed25519' };

export const ext = {
  serverName: (name: string): TlsExt => ({
    type: 0,
    data: vec(2, concat(u8(0), vec(2, ascii(name)))),
    display: `host_name "${name}"`,
    summary: `server_name ${name}`,
  }),
  supportedGroups: (groups: number[]): TlsExt => ({
    type: 10,
    data: vec(2, concat(...groups.map(u16))),
    display: groups.map((g) => `${GROUPS[g]} (${hex(g, 4)})`).join(', '),
    summary: `supported_groups ${groups.map((g) => GROUPS[g]).join(', ')}`,
  }),
  signatureAlgorithms: (algs: number[]): TlsExt => ({
    type: 13,
    data: vec(2, concat(...algs.map(u16))),
    display: algs.map((a) => `${SIGS[a]} (${hex(a, 4)})`).join(', '),
    summary: 'signature_algorithms',
  }),
  alpn: (protocols: string[]): TlsExt => ({
    type: 16,
    data: vec(2, concat(...protocols.map((p) => vec(1, ascii(p))))),
    display: protocols.map((p) => `"${p}"`).join(', '),
    summary: `ALPN ${protocols.join(', ')}`,
  }),
  supportedVersionsClient: (versions: number[]): TlsExt => ({
    type: 43,
    data: vec(1, concat(...versions.map(u16))),
    display: versions.map((v) => `${v === 0x0304 ? 'TLS 1.3' : 'TLS 1.2'} (${hex(v, 4)})`).join(', '),
    summary: `supported_versions ${versions.map((v) => (v === 0x0304 ? '1.3' : '1.2')).join(', ')}`,
  }),
  supportedVersionServer: (): TlsExt => ({ type: 43, data: u16(0x0304), display: 'TLS 1.3 (0x0304)', summary: 'supported_versions TLS 1.3' }),
  pskModes: (): TlsExt => ({ type: 45, data: vec(1, u8(1)), display: 'psk_dhe_ke (1)', summary: 'psk_key_exchange_modes psk_dhe_ke' }),
  keyShareClient: (group: number, key: Uint8Array): TlsExt => ({
    type: 51,
    data: vec(2, concat(u16(group), vec(2, key))),
    display: `${GROUPS[group]}: ${key.length}-octet public key ${hexBytes(key.subarray(0, 4))} ...`,
    summary: `key_share ${GROUPS[group]}`,
  }),
  keyShareServer: (group: number, key: Uint8Array): TlsExt => ({
    type: 51,
    data: concat(u16(group), vec(2, key)),
    display: `${GROUPS[group]}: ${key.length}-octet public key ${hexBytes(key.subarray(0, 4))} ...`,
    summary: `key_share ${GROUPS[group]}`,
  }),
};

// ---- handshake messages

const handshakeHeader: FieldDef[] = [
  { id: 'msgType', name: 'msg_type', bits: 8, about: 'Handshake message type: 1 = client_hello, 2 = server_hello, 4 = new_session_ticket, 8 = encrypted_extensions, 11 = certificate, 15 = certificate_verify, 20 = finished.', source: R('4') },
  { id: 'length', name: 'length', bits: 24, about: 'Length of the rest of the handshake message in octets.', source: R('4') },
];

const helloCommon = (who: 'client' | 'server'): FieldDef[] => [
  { id: 'legacyVersion', name: 'legacy_version', bits: 16, about: 'Always 0x0303 (TLS 1.2) in TLS 1.3, so that old servers and middleboxes are not confused. The real version is in supported_versions.', source: R('4.1.2') },
  {
    id: 'random',
    name: 'random',
    bits: 256,
    compact: true,
    about:
      who === 'client'
        ? '32 octets from a secure random number generator. They go into the key derivation, so every connection gets fresh keys.'
        : '32 random octets from the server. The last 8 octets also act as a downgrade signal if the server negotiated an older version.',
    source: R(who === 'client' ? '4.1.2' : '4.1.3'),
  },
  { id: 'sessionIdLen', name: 'legacy_session_id length', bits: 8, about: 'Length of legacy_session_id.', source: R('4.1.2') },
  {
    id: 'sessionId',
    name: 'legacy_session_id',
    bits: 'variable',
    compact: true,
    about:
      who === 'client'
        ? 'Not used for resumption in TLS 1.3. Clients send 32 random octets anyway ("middlebox compatibility mode"), so the handshake looks like a TLS 1.2 session resumption to old network equipment.'
        : 'The server echoes the session ID of the client.',
    source: R(who === 'client' ? '4.1.2' : '4.1.3'),
  },
];

export const clientHelloDef: LayerDef = {
  id: 'tls-client-hello',
  name: 'ClientHello',
  short: 'ClientHello',
  osi: [6],
  osiNote: OSI_NOTE,
  tcpip: 'application',
  about:
    'The first handshake message. The client offers everything it supports: cipher suites, groups for the key exchange, signature algorithms, and already sends its key share, guessing which group the server will pick. That guess is what lets TLS 1.3 finish in one round trip.',
  fields: [
    ...handshakeHeader,
    ...helloCommon('client'),
    { id: 'suitesLen', name: 'cipher_suites length', bits: 16, about: 'Length of the list in octets, two per suite.', source: R('4.1.2') },
    {
      id: 'suites',
      name: 'cipher_suites',
      bits: 'variable',
      about: 'TLS 1.3 cipher suites name only the AEAD cipher and the hash for key derivation. Key exchange and signatures are negotiated separately, in extensions.',
      source: R('B.4'),
    },
    { id: 'compLen', name: 'legacy_compression_methods length', bits: 8, about: 'Always 1.', source: R('4.1.2') },
    { id: 'comp', name: 'legacy_compression_methods', bits: 'variable', about: 'Exactly one octet 0 ("null", no compression). Compression in TLS was removed after the CRIME attack.', source: R('4.1.2') },
    { id: 'extLen', name: 'extensions length', bits: 16, about: 'Length of all extensions in octets.', source: R('4.1.2') },
    { id: 'extensions', name: 'extensions', bits: 'variable', compact: true, about: 'The extensions; in TLS 1.3 most of the negotiation happens here.', source: R('4.2') },
  ],
  sources: [R('4.1.2'), R('4.2')],
};

export const serverHelloDef: LayerDef = {
  id: 'tls-server-hello',
  name: 'ServerHello',
  short: 'ServerHello',
  osi: [6],
  osiNote: OSI_NOTE,
  tcpip: 'application',
  about: 'The server picks one cipher suite and one key share group and sends its own key share. After this message both sides can compute the handshake keys; everything after it is encrypted.',
  fields: [
    ...handshakeHeader,
    ...helloCommon('server'),
    { id: 'suite', name: 'cipher_suite', bits: 16, about: 'The cipher suite the server chose from the client list.', source: R('4.1.3') },
    { id: 'comp', name: 'legacy_compression_method', bits: 8, about: 'Always 0.', source: R('4.1.3') },
    { id: 'extLen', name: 'extensions length', bits: 16, about: 'Length of all extensions in octets.', source: R('4.1.3') },
    { id: 'extensions', name: 'extensions', bits: 'variable', compact: true, about: 'Only what is needed before encryption starts: supported_versions and key_share. Everything else follows encrypted in EncryptedExtensions.', source: R('4.1.3') },
  ],
  sources: [R('4.1.3')],
};

export const ccsDef: LayerDef = {
  id: 'tls-ccs',
  name: 'ChangeCipherSpec',
  short: 'CCS',
  osi: [6],
  osiNote: OSI_NOTE,
  tcpip: 'application',
  about: 'A dummy record in TLS 1.3. It has no meaning and is ignored by the receiver; it is sent only so the handshake looks like TLS 1.2 to middleboxes (middlebox compatibility mode).',
  fields: [{ id: 'value', name: 'value', bits: 8, about: 'Always 1.', source: R('5') }],
  sources: [R('5'), R('D.4')],
};

export const encryptedDef: LayerDef = {
  id: 'tls-encrypted',
  name: 'Encrypted record content',
  short: 'Encrypted',
  osi: [6],
  osiNote: OSI_NOTE,
  tcpip: 'application',
  about:
    'An encrypted TLSInnerPlaintext: the real content (a handshake message or application data), followed by one octet with its real content type and optional zero padding, all encrypted with the AEAD cipher. With AES-GCM the 16-octet authentication tag follows. Without the keys, an observer sees only the length.',
  fields: [
    { id: 'ciphertext', name: 'encrypted content', bits: 'variable', compact: true, about: 'Ciphertext of content, content type and padding. The octets shown are random stand-ins, not real ciphertext.', source: R('5.2') },
    { id: 'tag', name: 'authentication tag', bits: 128, compact: true, about: 'AES-GCM tag: proves that the record was not changed and comes from the peer. A record with a wrong tag ends the connection.', source: { rfc: 5116, section: '5.1' } },
  ],
  sources: [R('5.2'), R('5.4')],
};

// ---- builders

const HS_TYPES: Record<number, string> = { 1: 'client_hello', 2: 'server_hello' };

export function record(type: 20 | 22 | 23, version: number, contentLength: number, ann: Annotations = {}): LayerInstance {
  const TYPES: Record<number, string> = { 20: 'change_cipher_spec', 22: 'handshake', 23: 'application_data' };
  return buildStruct(
    tlsRecordDef,
    {
      type: { raw: type, display: `${type} (${TYPES[type]})` },
      version: { raw: version, display: `${hex(version, 4)} (${version === 0x0301 ? 'TLS 1.0' : 'TLS 1.2'}, legacy)` },
      length: { raw: contentLength, display: String(contentLength) },
    },
    ann,
    `${TYPES[type]}, ${contentLength} octets`,
  );
}

interface HelloParams extends Annotations {
  random: Uint8Array;
  sessionId: Uint8Array;
  extensions: TlsExt[];
}

function hello(def: LayerDef, type: 1 | 2, p: HelloParams, middle: Record<string, { raw: number | Uint8Array; display: string }>, summary: string): LayerInstance {
  const exts = p.extensions.map(buildExt);
  const extBytes = concat(...exts.map((e) => e.bytes));
  const body = (msgLen: number) => ({
    msgType: { raw: type, display: `${type} (${HS_TYPES[type]})` },
    length: { raw: msgLen, display: String(msgLen) },
    legacyVersion: { raw: 0x0303, display: '0x0303 (TLS 1.2, legacy)' },
    random: { raw: p.random, display: `${hexBytes(p.random.subarray(0, 8))} ... (32 random octets)` },
    sessionIdLen: { raw: p.sessionId.length, display: String(p.sessionId.length) },
    sessionId: { raw: p.sessionId, display: `${hexBytes(p.sessionId.subarray(0, 8))} ... (${p.sessionId.length} octets)` },
    ...middle,
    extLen: { raw: extBytes.length, display: String(extBytes.length) },
    extensions: { raw: extBytes, display: exts.map((e) => e.summary).join(', '), items: exts },
  });
  const draft = buildStruct(def, body(0));
  return buildStruct(def, body(draft.bytes.length - 4), p, summary);
}

export function clientHello(p: HelloParams & { suites: number[] }): LayerInstance {
  return hello(
    clientHelloDef,
    1,
    p,
    {
      suitesLen: { raw: p.suites.length * 2, display: String(p.suites.length * 2) },
      suites: { raw: concat(...p.suites.map(u16)), display: p.suites.map((s) => `${SUITES[s]} (${hex(s, 4)})`).join(', ') },
      compLen: { raw: 1, display: '1' },
      comp: { raw: u8(0), display: '0 (null)' },
    },
    `ClientHello, ${p.suites.length} cipher suites, ${p.extensions.length} extensions`,
  );
}

export function serverHello(p: HelloParams & { suite: number }): LayerInstance {
  return hello(
    serverHelloDef,
    2,
    p,
    {
      suite: { raw: p.suite, display: `${SUITES[p.suite]} (${hex(p.suite, 4)})` },
      comp: { raw: 0, display: '0' },
    },
    `ServerHello, ${SUITES[p.suite]}`,
  );
}

export function changeCipherSpec(): LayerInstance {
  return buildStruct(ccsDef, { value: { raw: 1, display: '1' } }, {}, 'dummy ChangeCipherSpec');
}

/** Lengths of the encrypted content: plaintext + 1 octet content type, then a 16-octet tag. */
export function encrypted(plaintextLength: number, random: Uint8Array, summary: string, ann: Annotations = {}): LayerInstance {
  const ct = random.subarray(0, plaintextLength + 1);
  const tag = random.subarray(plaintextLength + 1, plaintextLength + 17);
  if (ct.length !== plaintextLength + 1 || tag.length !== 16) throw new Error('encrypted: not enough random octets');
  return buildStruct(
    encryptedDef,
    {
      ciphertext: { raw: ct, display: `${ct.length} octets: ${plaintextLength} of content + 1 octet content type, encrypted` },
      tag: { raw: tag, display: `${hexBytes(tag.subarray(0, 4))} ... (16 octets)` },
    },
    ann,
    summary,
  );
}
