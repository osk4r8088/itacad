import { describe, expect, it } from 'vitest';
import { decode } from './decode';
import { parseHex, toHex } from './input';
import { EXAMPLES } from './examples';

const bytesOf = (hex: string) => {
  const r = parseHex(hex);
  if (!r.ok) throw new Error(r.error);
  return r.bytes;
};
const example = (id: string) => bytesOf(EXAMPLES.find((e) => e.id === id)!.hex);
const ids = (d: ReturnType<typeof decode>) => d.layers.map((l) => l.def.id);
const value = (d: ReturnType<typeof decode>, layer: string, field: string) => d.layers.find((l) => l.def.id === layer)!.values[field];

describe('parseHex', () => {
  const expected = [0x00, 0x1a, 0x2b, 0xff];
  it.each([
    ['hex stream', '001a2bff'],
    ['spaces', '00 1a 2b ff'],
    ['colons', '00:1a:2b:FF'],
    ['0x prefixes and commas', '0x00, 0x1a, 0x2b, 0xff'],
    ['several lines', '00 1a\n2b ff\n'],
    ['hex dump with offset and ASCII column', '0000   00 1a 2b ff                                       ..+.'],
  ])('reads %s', (_name, text) => {
    expect(parseHex(text)).toEqual({ ok: true, bytes: Uint8Array.from(expected) });
  });
  it('reads a multi-line hex dump without taking ASCII text as bytes', () => {
    const dump = '0000   45 00 00 54 7d 21 40 00 40 01 bf 2c c0 00 02 0a   E..T}!@.@..,....\n0010   cb 00 71 50                                       ..qP';
    const r = parseHex(dump);
    expect(r.ok && toHex(r.bytes)).toBe('45 00 00 54 7d 21 40 00 40 01 bf 2c c0 00 02 0a\ncb 00 71 50');
  });
  it.each([
    ['', 'Paste'],
    ['00 1g', '"g" is not a hex digit'],
    ['001', 'Odd number'],
  ])('rejects "%s"', (text, message) => {
    const r = parseHex(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(message);
  });
});

describe('examples', () => {
  it.each(EXAMPLES.map((e) => [e.id, e] as const))('%s decodes without warnings and with valid checksums', (_id, e) => {
    const d = decode(bytesOf(e.hex));
    expect(d.issues.filter((i) => i.level !== 'info')).toEqual([]);
    expect(d.checks.length).toBeGreaterThan(0);
    expect(d.checks.every((c) => c.ok)).toBe(true);
  });

  it('TCP SYN: decodes all options', () => {
    const d = decode(example('tcp-syn'));
    expect(ids(d)).toEqual(['ethernet', 'ipv4', 'tcp']);
    const options = value(d, 'tcp', 'options').items!.map((o) => o.def.id);
    expect(options).toContain('tcp-opt-mss');
    expect(options).toContain('tcp-opt-ws');
    expect(value(d, 'tcp', 'flagSYN').display).toBe('1');
    expect(d.checks.map((c) => c.label)).toEqual(['IPv4 header checksum', 'TCP checksum']);
  });

  it('ARP request: recognizes FCS and padding', () => {
    const d = decode(example('arp'));
    expect(ids(d)).toEqual(['ethernet', 'arp']);
    expect(value(d, 'ethernet', 'dst').display).toContain('broadcast');
    expect(value(d, 'ethernet', 'pad').display).toBe('18 zero octets');
    expect(value(d, 'ethernet', 'fcs')).toBeDefined();
    expect(d.checks).toContainEqual({ label: 'Ethernet FCS', ok: true });
    expect(d.layers[1].summary).toMatch(/^Who has /);
  });

  it('frames without FCS have no FCS field', () => {
    const d = decode(example('ping'));
    expect(d.layers[0].def.trailer!.map((f) => f.id)).toEqual(['pad']);
  });

  it('HTTP request: shows the payload as text with a port hint', () => {
    const d = decode(example('http'));
    expect(ids(d)).toEqual(['ethernet', 'ipv4', 'tcp', 'data']);
    expect(value(d, 'data', 'data').display).toMatch(/^GET \/ HTTP\/1\.1\\r\\n/);
    expect(value(d, 'data', 'data').note).toContain('HTTP');
  });

  it('IPv4 only: detects the start automatically', () => {
    const d = decode(example('ipv4'));
    expect(d.start).toBe('ipv4');
    expect(ids(d)).toEqual(['ipv4', 'icmp-echo']);
  });
});

describe('802.1Q', () => {
  it('decodes a tagged frame', () => {
    const d = decode(example('vlan'));
    expect(ids(d)).toEqual(['ethernet', 'vlan', 'ipv4', 'icmp-echo']);
    expect(value(d, 'ethernet', 'type').display).toBe('0x8100 (VLAN tag, IEEE 802.1Q)');
    expect(value(d, 'vlan', 'vid').display).toBe('10');
    expect(value(d, 'vlan', 'type').display).toBe('0x0800 (IPv4)');
  });

  it('warns about a second tag right after the first', () => {
    const b = example('vlan');
    const double = new Uint8Array([...b.subarray(0, 16), 0x81, 0x00, 0x00, 0x14, ...b.subarray(16)]);
    const d = decode(double);
    expect(ids(d).slice(0, 3)).toEqual(['ethernet', 'vlan', 'vlan']);
    expect(d.issues.some((i) => i.level === 'warning' && i.text.includes('Double tagging'))).toBe(true);
  });
});

describe('problems in the input', () => {
  it('reports a wrong IPv4 header checksum with the expected value', () => {
    const b = example('ping');
    b[14 + 8] = 1; // change the TTL
    const d = decode(b);
    expect(d.checks.find((c) => c.label === 'IPv4 header checksum')!.ok).toBe(false);
    expect(value(d, 'ipv4', 'checksum').note).toMatch(/^Does not match: computed from the content it would be 0x[0-9a-f]{4}\.$/);
    expect(d.issues.some((i) => i.level === 'warning' && i.text.includes('IPv4 header checksum'))).toBe(true);
  });

  it('reports a wrong TCP checksum after the payload was changed', () => {
    const b = example('http');
    b[b.length - 1] ^= 0xff;
    const d = decode(b);
    expect(d.checks).toContainEqual({ label: 'TCP checksum', ok: false });
    expect(d.checks).toContainEqual({ label: 'IPv4 header checksum', ok: true });
  });

  it('reports cut-off input', () => {
    const d = decode(example('tcp-syn').subarray(0, 40));
    expect(d.issues.some((i) => i.level === 'warning' && i.text.includes('Total Length'))).toBe(true);
    expect(d.issues.some((i) => i.level === 'error' && i.text.includes('TCP header'))).toBe(true);
  });

  it('stops at an unknown EtherType', () => {
    const b = example('ping');
    b[12] = 0x88;
    b[13] = 0xcc;
    const d = decode(b, 'ethernet');
    expect(ids(d)).toEqual(['ethernet', 'data']);
    expect(value(d, 'ethernet', 'type').display).toBe('0x88cc (LLDP)');
    expect(d.issues[0]).toMatchObject({ level: 'info' });
  });

  it('treats a small EtherType as an 802.3 length', () => {
    const b = example('ping');
    b[12] = 0x00;
    b[13] = 0x40;
    const d = decode(b, 'ethernet');
    expect(value(d, 'ethernet', 'type').display).toContain('length');
  });

  it('rejects a wrong IP version and a too small IHL', () => {
    const v6 = example('ipv4');
    v6[0] = 0x65;
    expect(decode(v6, 'ipv4').issues[0].text).toContain('Version field is 6');
    const ihl = example('ipv4');
    ihl[0] = 0x44;
    expect(decode(ihl, 'ipv4').issues[0].text).toContain('IHL is 4');
  });

  it('detects a cut-off IPv4 packet by its header checksum', () => {
    const d = decode(example('ipv4').subarray(0, 20));
    expect(d.start).toBe('ipv4');
    expect(d.issues.some((i) => i.level === 'warning' && i.text.includes('cut off'))).toBe(true);
    expect(d.issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('falls back to Ethernet when the start is not a valid IPv4 header', () => {
    expect(decode(example('ping')).start).toBe('ethernet');
  });

  it('accepts a UDP checksum of zero as "not computed"', () => {
    const b = example('dns');
    const udp = 14 + 20;
    b[udp + 6] = 0;
    b[udp + 7] = 0;
    const d = decode(b);
    expect(value(d, 'udp', 'checksum').note).toContain('RFC 768');
    expect(d.checks.some((c) => c.label === 'UDP checksum')).toBe(false);
  });
});

describe('texts for real input', () => {
  it('drops sentences about generated examples', () => {
    for (const e of EXAMPLES) {
      for (const layer of decode(bytesOf(e.hex)).layers) {
        const texts = [layer.def.about, ...layer.def.fields.map((f) => f.about), ...(layer.def.trailer ?? []).map((f) => f.about)];
        for (const t of texts) expect(t).not.toMatch(/this example/);
      }
    }
  });
});

describe('IPv6', () => {
  /** An IPv6 packet between documentation addresses with the given Next Header, Hop Limit and payload. */
  const SRC = Uint8Array.from([0x20, 0x01, 0x0d, 0xb8, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x0a]);
  const DST = Uint8Array.from([0x20, 0x01, 0x0d, 0xb8, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x50]);
  const packet = (nextHeader: number, payload: Uint8Array, hopLimit = 64) =>
    Uint8Array.from([0x60, 0, 0, 0, payload.length >> 8, payload.length & 0xff, nextHeader, hopLimit, ...SRC, ...DST, ...payload]);
  /** Fills in the checksum at `at` over the IPv6 pseudo-header for the upper-layer protocol `protocol`. */
  const withChecksum = (segment: Uint8Array, protocol: number, at: number) => {
    const n = segment.length;
    const pseudo = Uint8Array.from([...SRC, ...DST, n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, 0, 0, 0, protocol]);
    const all = Uint8Array.from([...pseudo, ...segment]);
    let sum = 0;
    for (let i = 0; i < all.length; i += 2) sum += (all[i] << 8) | (all[i + 1] ?? 0);
    while (sum >> 16) sum = (sum & 0xffff) + (sum >> 16);
    const c = ~sum & 0xffff;
    const out = segment.slice();
    out[at] = c >> 8;
    out[at + 1] = c & 0xff;
    return out;
  };
  const tcpSyn = () => withChecksum(Uint8Array.from([0xc2, 0x94, 0, 80, 0, 0, 0, 1, 0, 0, 0, 0, 0x50, 0x02, 0xfa, 0xf0, 0, 0, 0, 0]), 6, 16);
  const udp = (checksum: boolean) => {
    const d = Uint8Array.from([0xc4, 0x88, 0, 53, 0, 12, 0, 0, 1, 2, 3, 4]);
    return checksum ? withChecksum(d, 17, 6) : d;
  };

  it('decodes a Router Advertisement with its options', () => {
    const d = decode(example('ipv6-ra'));
    expect(ids(d)).toEqual(['ethernet', 'ipv6', 'icmpv6-ra']);
    expect(d.checks).toContainEqual({ label: 'ICMPv6 checksum', ok: true });
    expect(d.checks.every((c) => c.ok)).toBe(true);
    expect(d.issues.filter((i) => i.level !== 'info')).toEqual([]);
    const options = value(d, 'icmpv6-ra', 'options');
    expect(options.items?.map((o) => o.def.id)).toEqual(['nd-opt-slla', 'nd-opt-mtu', 'nd-opt-prefix']);
    expect(options.display).toContain('Prefix 2001:db8:1::/64, SLAAC');
  });

  it('detects an IPv6 packet without Ethernet header', () => {
    const frame = example('ipv6-ping');
    const d = decode(frame.subarray(14, 14 + 40 + ((frame[18] << 8) | frame[19]))); // without Ethernet header and FCS
    expect(d.start).toBe('ipv6');
    expect(ids(d)).toEqual(['ipv6', 'icmpv6-echo']);
    expect(d.checks.every((c) => c.ok)).toBe(true);
  });

  it('checks TCP over IPv6 with the IPv6 pseudo-header', () => {
    const d = decode(packet(6, tcpSyn()), 'ipv6');
    expect(ids(d)).toEqual(['ipv6', 'tcp']);
    expect(d.checks).toEqual([{ label: 'TCP checksum', ok: true }]);
    const broken = packet(6, tcpSyn());
    broken[39] ^= 1; // change the destination address: the pseudo-header covers it
    expect(decode(broken, 'ipv6').checks).toEqual([{ label: 'TCP checksum', ok: false }]);
  });

  it('checks UDP over IPv6 and rejects a zero checksum', () => {
    expect(decode(packet(17, udp(true)), 'ipv6').checks).toEqual([{ label: 'UDP checksum', ok: true }]);
    const zero = decode(packet(17, udp(false)), 'ipv6');
    expect(zero.issues.some((i) => i.level === 'warning' && i.text.includes('mandatory'))).toBe(true);
  });

  it('skips extension headers by their length', () => {
    const hopByHop = Uint8Array.from([6, 0, 1, 4, 0, 0, 0, 0]); // Next Header TCP, 8 octets, PadN
    const destOpts = Uint8Array.from([0, 1, 1, 12, ...new Array(12).fill(0)]); // Next Header Hop-by-Hop (for the test), 16 octets
    const d = decode(packet(60, Uint8Array.from([...destOpts, ...hopByHop, ...tcpSyn()])), 'ipv6');
    expect(ids(d)).toEqual(['ipv6', 'ipv6-ext', 'ipv6-ext', 'tcp']);
    expect(d.layers[1].def.name).toBe('Destination Options');
    expect(d.layers[1].bytes.length).toBe(16);
    expect(d.checks).toEqual([{ label: 'TCP checksum', ok: true }]);
  });

  it('reads the Fragment header and stops at a later fragment', () => {
    const first = decode(packet(44, Uint8Array.from([6, 0, 0, 1, 0, 0, 0, 7, ...tcpSyn()])), 'ipv6');
    expect(ids(first)).toEqual(['ipv6', 'ipv6-frag', 'tcp']);
    expect(first.checks).toEqual([]); // the checksum covers the whole packet, not just this fragment
    const later = decode(packet(44, Uint8Array.from([6, 0, 0, 0xb8, 0, 0, 0, 7, 1, 2, 3, 4])), 'ipv6');
    expect(ids(later)).toEqual(['ipv6', 'ipv6-frag', 'fragment']);
    expect(value(later, 'ipv6-frag', 'fragOffset').display).toBe('23 (184 octets)');
  });

  it('warns when a Neighbor Discovery message has crossed a router', () => {
    const b = example('ipv6-ra');
    b[14 + 7] = 64; // Hop Limit is not covered by the checksum
    const d = decode(b);
    expect(d.checks.every((c) => c.ok)).toBe(true);
    expect(d.issues.some((i) => i.level === 'warning' && i.text.includes('Hop Limit 255'))).toBe(true);
  });

  it('reports a Neighbor Discovery option with length zero', () => {
    const b = example('ipv6-ra');
    b[14 + 40 + 16 + 1] = 0; // Length of the first option
    expect(decode(b).issues.some((i) => i.level === 'error' && i.text.includes('invalid length'))).toBe(true);
  });
});
