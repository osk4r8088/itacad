import { describe, expect, it } from 'vitest';
import { decode } from './decode';
import { readName } from './dns';
import { parseHex } from './input';
import { EXAMPLES } from './examples';

const bytesOf = (hex: string) => {
  const r = parseHex(hex);
  if (!r.ok) throw new Error(r.error);
  return r.bytes;
};
const example = (id: string) => bytesOf(EXAMPLES.find((e) => e.id === id)!.hex);
type D = ReturnType<typeof decode>;
const ids = (d: D) => d.layers.map((l) => l.def.id);
const value = (d: D, layer: string, field: string) => d.layers.find((l) => l.def.id === layer)!.values[field];
const problems = (d: D) => d.issues.filter((i) => i.level !== 'info');
const has = (d: D, level: string, text: string) => d.issues.some((i) => i.level === level && i.text.includes(text));

/** An IPv4 packet with a UDP datagram (checksum 0: not computed) between documentation addresses. */
function udp(srcPort: number, dstPort: number, payload: number[] | Uint8Array): Uint8Array {
  const len = 8 + payload.length;
  const ip = [0x45, 0, (20 + len) >> 8, (20 + len) & 0xff, 0, 0, 0x40, 0, 64, 17, 0, 0, 192, 0, 2, 50, 192, 0, 2, 53];
  let sum = 0;
  for (let i = 0; i < 20; i += 2) sum += (ip[i] << 8) | ip[i + 1];
  while (sum >> 16) sum = (sum & 0xffff) + (sum >> 16);
  ip[10] = (~sum >> 8) & 0xff;
  ip[11] = ~sum & 0xff;
  return Uint8Array.from([...ip, srcPort >> 8, srcPort & 0xff, dstPort >> 8, dstPort & 0xff, len >> 8, len & 0xff, 0, 0, ...payload]);
}

const label = (text: string) => [text.length, ...Array.from(text, (c) => c.charCodeAt(0))];
const name = (text: string) => [...text.split('.').flatMap(label), 0];
const u16 = (n: number) => [n >> 8, n & 0xff];
const u32 = (n: number) => [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
/** DNS header with the given flags word and the four counts. */
const dnsHeader = (flags: number, counts: [number, number, number, number]) => [0x12, 0x34, ...u16(flags), ...counts.flatMap(u16)];
const rr = (owner: number[], type: number, rdata: number[], ttl = 300, cls = 1) => [...owner, ...u16(type), ...u16(cls), ...u32(ttl), ...u16(rdata.length), ...rdata];
/** Pointer to the question name at offset 12. */
const Q = [0xc0, 12];
const question = (qname: string, qtype: number) => [...name(qname), ...u16(qtype), ...u16(1)];
const dnsResponse = (records: number[][], counts: [number, number, number] = [records.length, 0, 0], qtype = 1) =>
  decode(udp(53, 40000, [...dnsHeader(0x8180, [1, ...counts]), ...question('example.com', qtype), ...records.flat()]), 'ipv4');
const items = (d: D, field: string) => value(d, 'dns', field).items!;

describe('DNS', () => {
  it('decodes the query example', () => {
    const d = decode(example('dns'));
    expect(ids(d)).toEqual(['ethernet', 'ipv4', 'udp', 'dns']);
    expect(value(d, 'dns', 'qr').display).toBe('0 (query)');
    expect(value(d, 'dns', 'rd').display).toBe('1');
    expect(value(d, 'dns', 'question').display).toBe('www.example.com A');
    expect(d.layers[3].summary).toBe('Query 0x6c1f: www.example.com A');
  });

  it('resolves compression pointers in the referral example', () => {
    const d = decode(example('dns-response'));
    expect(problems(d)).toEqual([]);
    expect(value(d, 'dns', 'answer').display).toBe('empty');
    const ns = items(d, 'authority')[0];
    expect(ns.summary).toBe('com NS a.gtld-servers.net');
    expect(ns.values.name.display).toBe('com (pointer to offset 24, 0xc018)');
    expect(ns.values.ttl.display).toBe('172800 s (48 h)');
    expect(items(d, 'additional')[0].summary).toBe('a.gtld-servers.net A 192.5.6.30');
  });

  it('reads the common record types', () => {
    const d = dnsResponse([
      rr(Q, 5, [...label('www'), ...Q]),
      rr(Q, 28, [0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]),
      rr(Q, 15, [...u16(10), ...label('mail'), ...Q]),
      rr(Q, 16, [...label('v=spf1 -all'), ...label('two')]),
      rr(Q, 6, [...label('ns1'), ...Q, ...label('hostmaster'), ...Q, ...u32(2026110101), ...u32(7200), ...u32(3600), ...u32(1209600), ...u32(300)]),
      rr(name('_sip._tcp.example.com'), 33, [...u16(10), ...u16(60), ...u16(5060), ...name('sip.example.com')]),
      rr(Q, 99, [1, 2, 3]),
    ]);
    expect(problems(d)).toEqual([]);
    expect(items(d, 'answer').map((i) => i.summary)).toEqual([
      'example.com CNAME www.example.com',
      'example.com AAAA 2001:db8::1',
      'example.com MX 10 mail.example.com',
      'example.com TXT "v=spf1 -all" "two"',
      'example.com SOA ns1.example.com hostmaster.example.com 2026110101',
      '_sip._tcp.example.com SRV 10 60 5060 sip.example.com',
      'example.com TYPE99 (3 octets)',
    ]);
    expect(items(d, 'answer')[0].values.rdata.display).toBe('www.example.com (label "www", then pointer to offset 12)');
    expect(items(d, 'answer')[6].values.type.display).toBe('99');
  });

  it('reads the EDNS OPT pseudo-record', () => {
    const opt = [0, ...u16(41), ...u16(1232), 0, 0, 0x80, 0, ...u16(12), ...u16(10), ...u16(8), 1, 2, 3, 4, 5, 6, 7, 8];
    const d = decode(udp(40000, 53, [...dnsHeader(0x0120, [1, 0, 0, 1]), ...question('example.com', 1), ...opt]), 'ipv4');
    expect(problems(d)).toEqual([]);
    const o = items(d, 'additional')[0];
    expect(o.def.id).toBe('dns-opt');
    expect(o.values.udpSize.display).toBe('1232 octets');
    expect(o.values.do.display).toBe('1');
    expect(o.values.rdata.display).toBe('option 10 with 8 octets');
    expect(value(d, 'dns', 'ad').display).toBe('1');
  });

  it('names the response code and the opcode', () => {
    const d = decode(udp(53, 40000, [...dnsHeader(0x8183, [1, 0, 0, 0]), ...question('nope.example.com', 28)]), 'ipv4');
    expect(value(d, 'dns', 'rcode').display).toBe('3 (NXDOMAIN)');
    expect(value(d, 'dns', 'opcode').display).toBe('0 (QUERY)');
    expect(value(d, 'dns', 'question').display).toBe('nope.example.com AAAA');
  });

  it.each([
    ['a pointer to itself', [0xc0, 12]],
    ['a pointer forward', [0xc0, 20]],
    ['a pointer into its own labels', [3, 0x61, 0x62, 0x63, 0xc0, 12]],
  ])('reports %s as a possible loop', (_what, qname) => {
    const d = decode(udp(40000, 53, [...dnsHeader(0x0100, [1, 0, 0, 0]), ...qname, ...u16(1), ...u16(1), 0, 0, 0, 0]), 'ipv4');
    expect(ids(d)).toEqual(['ipv4', 'udp', 'dns']);
    expect(has(d, 'error', 'could loop forever')).toBe(true);
    expect(value(d, 'dns', 'question').display).toMatch(/octets not decoded$/);
  });

  it('follows a chain of pointers that only goes backwards', () => {
    // offset 0: "com", offset 5: "example" + pointer to 0, offset 15: pointer to 5
    const msg = Uint8Array.from([...label('com'), 0, ...label('example'), 0xc0, 0, 0xc0, 5]);
    expect(readName(msg, 15).text).toBe('example.com');
    expect(readName(msg, 5).display).toBe('example.com (label "example", then pointer to offset 0)');
  });

  it('reports reserved label bits, cut-off records and wrong lengths', () => {
    const reserved = decode(udp(40000, 53, [...dnsHeader(0x0100, [1, 0, 0, 0]), 0x40, 1, 2, 0, 0, 1, 0, 1]), 'ipv4');
    expect(has(reserved, 'error', 'reserved')).toBe(true);

    const full = [...dnsHeader(0x8180, [1, 1, 0, 0]), ...question('example.com', 1), ...rr(Q, 1, [192, 0, 2, 1])];
    const cut = decode(udp(53, 40000, full.slice(0, -3)), 'ipv4');
    expect(has(cut, 'error', 'RDLENGTH says 4 octets, but only 1 are left')).toBe(true);
    expect(items(cut, 'question')).toHaveLength(1);

    // Wrong data inside a record does not stop the decoder: RDLENGTH still tells where the next record starts.
    const badA = dnsResponse([rr(Q, 1, [192, 0, 2]), rr(Q, 1, [192, 0, 2, 7])]);
    expect(has(badA, 'error', 'the data of type A is 4 octets long')).toBe(true);
    expect(items(badA, 'answer').map((i) => i.summary)).toEqual(['example.com A (malformed)', 'example.com A 192.0.2.7']);

    const short = decode(udp(40000, 53, [1, 2, 3, 4]), 'ipv4');
    expect(ids(short)).toEqual(['ipv4', 'udp', 'data']);
    expect(has(short, 'error', 'DNS header needs 12 octets')).toBe(true);

    const extra = decode(udp(40000, 53, [...dnsHeader(0x0100, [1, 0, 0, 0]), ...question('example.com', 1), 9, 9]), 'ipv4');
    expect(has(extra, 'warning', '2 octets follow the last record')).toBe(true);
  });

  it('treats missing records of a truncated response as expected', () => {
    const d = decode(udp(53, 40000, [...dnsHeader(0x8380, [1, 3, 0, 0]), ...question('example.com', 16)]), 'ipv4');
    expect(problems(d)).toEqual([]);
    expect(has(d, 'info', 'TC bit is set')).toBe(true);
  });

  it('rejects a name longer than 255 octets', () => {
    const long = Array.from({ length: 5 }, () => label('a'.repeat(63))).flat();
    const d = decode(udp(40000, 53, [...dnsHeader(0x0100, [1, 0, 0, 0]), ...long, 0, 0, 1, 0, 1]), 'ipv4');
    expect(has(d, 'error', 'longer than 255 octets')).toBe(true);
  });
});

describe('DHCP', () => {
  const dhcpStart = 14 + 20 + 8;
  const options = (d: D) => value(d, 'dhcp', 'options').items!;
  /** The offer example with other options after the magic cookie. */
  const withOptions = (opts: number[]) => {
    const b = example('dhcp').subarray(14, dhcpStart + 240);
    return decode(udp(67, 68, [...b.subarray(28), ...opts]), 'ipv4');
  };

  it('decodes the offer example with its options', () => {
    const d = decode(example('dhcp'));
    expect(problems(d)).toEqual([]);
    expect(ids(d)).toEqual(['ethernet', 'ipv4', 'udp', 'dhcp']);
    expect(d.layers[3].summary).toBe('DHCPOFFER, xid 0x5f2c9a41');
    expect(value(d, 'dhcp', 'yiaddr').display).toBe('192.0.2.50');
    expect(value(d, 'dhcp', 'chaddr').display).toBe('00:00:5e:00:53:0a + 10 zero octets');
    expect(options(d).map((o) => o.summary)).toEqual([
      'Type DHCPOFFER',
      'Server Identifier 192.0.2.1',
      'Lease 24 h',
      'Subnet Mask 255.255.255.0',
      'Router 192.0.2.1',
      'Domain Name Server 192.0.2.53',
      'Domain example.com',
      'End',
    ]);
  });

  it('names further options and shows unknown ones as code, length and value', () => {
    const d = withOptions([53, 1, 5, 58, 4, ...u32(43200), 59, 4, ...u32(75600), 12, 4, 0x68, 0x6f, 0x73, 0x74, 57, 2, ...u16(1500), 61, 7, 1, 0, 0, 0x5e, 0, 0x53, 0x0a, 224, 3, 1, 2, 3, 255, 0, 0, 0]);
    expect(problems(d)).toEqual([]);
    expect(options(d).map((o) => o.summary)).toEqual(['Type DHCPACK', 'T1 12 h', 'T2 21 h', 'Host name host', 'Max size 1500', 'Client ID 00:00:5e:00:53:0a', 'Option 224', 'End', '3 octets of padding']);
    const unknown = options(d)[6];
    expect(unknown.def.id).toBe('dhcp-opt-other');
    expect([unknown.values.code.display, unknown.values.len.display, unknown.values.value.display]).toEqual(['224', '3', '01 02 03']);
  });

  it('reports cut-off options, a missing End and wrong option lengths', () => {
    const cut = withOptions([53, 1, 2, 51, 4, 0, 1]);
    expect(has(cut, 'error', 'option 51')).toBe(true);
    expect(options(cut).map((o) => o.summary)).toEqual(['Type DHCPOFFER']);

    expect(has(withOptions([53, 1, 2]), 'warning', 'End option (255)')).toBe(true);
    expect(has(withOptions([53, 1, 2, 1, 3, 255, 255, 255, 255]), 'warning', 'Subnet Mask (1) must hold one IPv4 address')).toBe(true);
    expect(has(withOptions([255]), 'info', 'DHCP Message Type option (53)')).toBe(true);
  });

  it('shows a message without magic cookie as BOOTP', () => {
    const b = example('dhcp').subarray(dhcpStart, dhcpStart + 236);
    const d = decode(udp(68, 67, [...b, ...new Array(64).fill(0)]), 'ipv4');
    expect(ids(d)).toEqual(['ipv4', 'udp', 'bootp']);
    expect(d.layers[2].bytes.length).toBe(300);
    expect(has(d, 'info', 'magic cookie')).toBe(true);
  });

  it('needs the fixed part', () => {
    const d = decode(udp(68, 67, new Array(100).fill(0)), 'ipv4');
    expect(ids(d)).toEqual(['ipv4', 'udp', 'data']);
    expect(has(d, 'error', '236 octets')).toBe(true);
  });
});

describe('NTP', () => {
  const header = (first: number, stratum: number, refid: number[]) => [first, stratum, 6, 0xe9, ...u32(0), ...u32(0), ...refid, ...new Array(24).fill(0), 0xee, 0x98, 0x19, 0x14, 0x80, 0, 0, 0];

  it('decodes the response example with its timestamps as dates', () => {
    const d = decode(example('ntp'));
    expect(problems(d)).toEqual([]);
    expect(ids(d)).toEqual(['ethernet', 'ipv4', 'udp', 'ntp']);
    expect(d.layers[3].summary).toBe('NTPv4 server, stratum 2');
    expect(value(d, 'ntp', 'stratum').display).toBe('2 (secondary server)');
    expect(value(d, 'ntp', 'precision').display).toBe('-23 (about 119 ns)');
    expect(value(d, 'ntp', 'xmtTs').display).toMatch(/^2026-11-06 09:15:00\.\d{6} UTC \(0x[0-9a-f]{16}\)$/);
    expect(value(d, 'ntp', 'refid').display).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });

  it('reads the reference clock name of a stratum 1 server and a MAC after the header', () => {
    const d = decode(udp(123, 40000, [...header(0x24, 1, [0x47, 0x50, 0x53, 0]), ...u32(7), ...new Array(16).fill(0xaa)]), 'ipv4');
    expect(value(d, 'ntp', 'refid').display).toBe('"GPS"');
    expect(value(d, 'ntp', 'stratum').display).toBe('1 (primary server)');
    expect(value(d, 'ntp', 'xmtTs').display).toBe('2026-11-06 09:15:00.500000 UTC (0xee98191480000000)');
    expect(value(d, 'ntp', 'extra').display).toBe('MAC: key identifier 0x00000007 and a 16-octet digest');
    expect(d.layers[2].bytes.length).toBe(68);
  });

  it('names the other modes and notes dates outside era 0', () => {
    const d = decode(udp(123, 123, header(0xe1, 16, [0, 0, 0, 0]).map((b, i) => (i === 40 ? 0x01 : b))), 'ipv4');
    expect(value(d, 'ntp', 'li').display).toBe('3 (not synchronized)');
    expect(value(d, 'ntp', 'mode').display).toBe('1 (symmetric active)');
    expect(value(d, 'ntp', 'stratum').display).toBe('16 (unsynchronized)');
    expect(value(d, 'ntp', 'xmtTs').note).toContain('era 1');
  });

  it('does not decode short packets and control messages', () => {
    const short = decode(udp(40000, 123, [0x23, 0, 0, 0]), 'ipv4');
    expect(ids(short)).toEqual(['ipv4', 'udp', 'data']);
    expect(has(short, 'error', '48 octets')).toBe(true);
    const control = decode(udp(40000, 123, [0x16, 2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]), 'ipv4');
    expect(ids(control)).toEqual(['ipv4', 'udp', 'data']);
    expect(has(control, 'info', 'mode 6')).toBe(true);
  });
});

describe('choosing the protocol by port', () => {
  it('leaves other ports as data and says which ports are read', () => {
    const d = decode(udp(40000, 5353, [...dnsHeader(0x0100, [1, 0, 0, 0]), ...question('example.com', 1)]), 'ipv4');
    expect(ids(d)).toEqual(['ipv4', 'udp', 'data']);
    expect(value(d, 'data', 'data').note).toContain('DNS on UDP port 53, DHCP on UDP ports 67 and 68, and NTP on UDP port 123');
  });

  it('does not read DNS over TCP', () => {
    const tcp = [0xc2, 0x94, 0, 53, 0, 0, 0, 1, 0, 0, 0, 1, 0x50, 0x18, 0xfa, 0xf0, 0, 0, 0, 0, 0, 29, ...dnsHeader(0x0100, [1, 0, 0, 0]), ...question('example.com', 1)];
    const ip = udp(1, 1, []).slice(0, 20);
    ip[3] = 20 + tcp.length;
    ip[9] = 6;
    const d = decode(Uint8Array.from([...ip, ...tcp]), 'ipv4');
    expect(ids(d)).toEqual(['ipv4', 'tcp', 'data']);
    expect(value(d, 'data', 'data').note).toContain('two-octet length');
  });
});

describe('robustness', () => {
  /** Small deterministic generator, so a failure can be repeated. */
  function random(seed: number) {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  }

  it.each(['dns', 'dns-response', 'dhcp', 'ntp'])('never throws on damaged %s frames', (id) => {
    const original = example(id);
    const rnd = random(original.length);
    for (let round = 0; round < 1500; round++) {
      const b = original.slice(0, round % 3 === 0 ? 42 + Math.floor(rnd() * (original.length - 41)) : original.length);
      const changes = 1 + Math.floor(rnd() * 4);
      // Only the application data is damaged, so the frame still reaches the DNS, DHCP or NTP decoder.
      for (let c = 0; c < changes && b.length > 42; c++) b[42 + Math.floor(rnd() * (b.length - 42))] = Math.floor(rnd() * 256);
      const d = decode(b);
      expect(d.layers.length).toBeGreaterThanOrEqual(3);
      for (const l of d.layers) for (const v of Object.values(l.values)) expect(typeof v.display).toBe('string');
    }
  });

  it('never throws on random application data', () => {
    const rnd = random(7);
    for (const port of [53, 67, 123]) {
      for (let round = 0; round < 1000; round++) {
        const payload = Uint8Array.from({ length: Math.floor(rnd() * 320) }, () => Math.floor(rnd() * 256));
        expect(() => decode(udp(40000, port, payload), 'ipv4')).not.toThrow();
      }
    }
  });
});
