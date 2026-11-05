// Bit packing and checksums used by the header builders.

export type Raw = number | bigint | Uint8Array;

export interface PackItem {
  bits: number;
  raw: Raw;
}

/** Packs fields most significant bit first, as all IETF diagrams do. */
export function pack(items: PackItem[]): Uint8Array {
  const totalBits = items.reduce((n, i) => n + i.bits, 0);
  if (totalBits % 8 !== 0) throw new Error(`pack: ${totalBits} bits is not a whole number of bytes`);
  const out = new Uint8Array(totalBits / 8);
  let pos = 0;
  for (const item of items) {
    if (item.raw instanceof Uint8Array) {
      if (item.raw.length * 8 !== item.bits) throw new Error('pack: byte field length mismatch');
      for (const byte of item.raw) {
        writeBits(out, pos, 8, BigInt(byte));
        pos += 8;
      }
    } else {
      const value = BigInt(item.raw);
      if (value < 0n || value >= 1n << BigInt(item.bits)) {
        throw new Error(`pack: value ${value} does not fit in ${item.bits} bits`);
      }
      writeBits(out, pos, item.bits, value);
      pos += item.bits;
    }
  }
  return out;
}

function writeBits(out: Uint8Array, pos: number, bits: number, value: bigint): void {
  for (let i = 0; i < bits; i++) {
    const bit = (value >> BigInt(bits - 1 - i)) & 1n;
    if (bit) {
      const p = pos + i;
      out[p >> 3] |= 0x80 >> (p & 7);
    }
  }
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Internet checksum, RFC 1071: one's complement of the one's complement sum of 16-bit words. */
export function internetChecksum(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i += 2) {
    const word = (data[i] << 8) | (i + 1 < data.length ? data[i + 1] : 0);
    sum += word;
    sum = (sum & 0xffff) + (sum >>> 16);
  }
  return ~sum & 0xffff;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 as used by the Ethernet FCS (IEEE 802.3), reflected form, same as zlib. */
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function ascii(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c > 0x7f) throw new Error('ascii: non-ASCII character');
    out[i] = c;
  }
  return out;
}

export function parseMac(mac: string): Uint8Array {
  const parts = mac.split(/[:-]/);
  if (parts.length !== 6) throw new Error(`bad MAC ${mac}`);
  return Uint8Array.from(parts.map((p) => parseInt(p, 16)));
}

export function parseIpv4(ip: string): Uint8Array {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !(p >= 0 && p <= 255))) throw new Error(`bad IPv4 ${ip}`);
  return Uint8Array.from(parts);
}

export function hex(n: number | bigint, digits: number): string {
  return '0x' + n.toString(16).padStart(digits, '0');
}

export function hexBytes(data: Uint8Array): string {
  return Array.from(data, (b) => b.toString(16).padStart(2, '0')).join(' ');
}
