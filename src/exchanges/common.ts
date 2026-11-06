// Small helpers shared by several exchanges.

/**
 * Payload of a Linux ping (iputils): 56 octets. The first 16 are the send time as a
 * struct timeval (seconds and microseconds, 64 bit each, in host byte order, here
 * little-endian), followed by the octets 0x10, 0x11, ... 0x37.
 */
export function linuxPingData(seconds: number, micros: number): Uint8Array {
  const data = new Uint8Array(56);
  const view = new DataView(data.buffer);
  view.setBigUint64(0, BigInt(seconds), true);
  view.setBigUint64(8, BigInt(micros), true);
  for (let i = 16; i < 56; i++) data[i] = i;
  return data;
}

export const LINUX_PING_DISPLAY = '56 octets: send time (16 octets) and the pattern 0x10 to 0x37';

/** Deterministic filler bytes for opaque application data. */
export function filler(length: number, seed = 0): Uint8Array {
  const out = new Uint8Array(length);
  let x = seed + 0x9e;
  for (let i = 0; i < length; i++) {
    x = (x * 73 + 41) & 0xff;
    out[i] = x;
  }
  return out;
}

/**
 * Deterministic bytes that look random (xorshift32), for values that are random in reality:
 * nonces, key shares, session IDs and ciphertext. They are not real keys or real ciphertext.
 */
export function randomBytes(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let x = (seed * 2654435761) >>> 0 || 1;
  for (let i = 0; i < length; i++) {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    out[i] = x & 0xff;
  }
  return out;
}
