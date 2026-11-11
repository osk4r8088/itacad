// IPv6 address helpers: parsing, the canonical text form, and the addresses derived from others.

/** Parses any valid textual form (RFC 4291 section 2.2), including a trailing IPv4 part such as ::ffff:192.0.2.33, into 16 octets. */
export function parseIpv6(input: string): Uint8Array {
  let text = input;
  const v4 = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(input);
  if (v4) {
    const o = v4[2].split('.').map(Number);
    if (o.some((n, i) => n > 255 || !/^(0|[1-9]\d{0,2})$/.test(v4[2].split('.')[i]))) throw new Error(`bad IPv6 ${input}`);
    text = `${v4[1]}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const parts = text.split('::');
  if (parts.length > 2) throw new Error(`bad IPv6 ${input}`);
  const groups = (s: string) => (s === '' ? [] : s.split(':'));
  const head = groups(parts[0]);
  const tail = parts.length === 2 ? groups(parts[1]) : [];
  const fill = 8 - head.length - tail.length;
  if ((parts.length === 2 && fill < 1) || (parts.length === 1 && fill !== 0)) throw new Error(`bad IPv6 ${input}`);
  const all = [...head, ...Array(parts.length === 2 ? fill : 0).fill('0'), ...tail];
  const out = new Uint8Array(16);
  all.forEach((g, i) => {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) throw new Error(`bad IPv6 ${input}`);
    const n = parseInt(g, 16);
    out[i * 2] = n >> 8;
    out[i * 2 + 1] = n & 0xff;
  });
  return out;
}

/** The recommended text form (RFC 5952): lowercase, no leading zeros, the longest run of two or more zero groups as "::" (the first one on a tie). */
export function formatIpv6(bytes: Uint8Array): string {
  const g = Array.from({ length: 8 }, (_, i) => (bytes[i * 2] << 8) | bytes[i * 2 + 1]);
  let best = -1;
  let bestLen = 1;
  for (let i = 0; i < 8; ) {
    if (g[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && g[j] === 0) j++;
    if (j - i > bestLen) [best, bestLen] = [i, j - i];
    i = j;
  }
  const hex = (a: number[]) => a.map((n) => n.toString(16)).join(':');
  if (best < 0) return hex(g);
  return `${hex(g.slice(0, best))}::${hex(g.slice(best + bestLen))}`;
}

export const canonicalIpv6 = (text: string): string => formatIpv6(parseIpv6(text));

/** Modified EUI-64 interface identifier from a 48-bit MAC address: ff:fe in the middle, universal/local bit inverted (RFC 4291 appendix A). */
export function eui64(mac: Uint8Array): Uint8Array {
  return Uint8Array.of(mac[0] ^ 0x02, mac[1], mac[2], 0xff, 0xfe, mac[3], mac[4], mac[5]);
}

/** A /64 prefix and an interface identifier joined into one address. */
export function withInterfaceId(prefix: string, iid: Uint8Array): string {
  const p = parseIpv6(prefix);
  p.set(iid, 8);
  return formatIpv6(p);
}

/** Solicited-node multicast address: ff02::1:ff00:0/104 plus the low 24 bits of the address (RFC 4291 section 2.7.1). */
export function solicitedNode(address: string): string {
  const a = parseIpv6(address);
  const m = parseIpv6('ff02::1:ff00:0');
  m.set(a.subarray(13), 13);
  return formatIpv6(m);
}

/** Ethernet address for an IPv6 multicast destination: 33:33 plus the low 32 bits (RFC 2464 section 7). */
export function multicastMac(address: string): string {
  const a = parseIpv6(address);
  return ['33', '33', ...Array.from(a.subarray(12), (b) => b.toString(16).padStart(2, '0'))].join(':');
}
