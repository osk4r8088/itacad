import { describe, expect, it } from 'vitest';
import { sha256 } from './sha256';
import { canonicalCompare, concat, dsDigest, encodeIpv6, encodeName, encodeRdata, encodeRecord, keyTag, TYPE_CODES, typeBitmaps, type Rdata } from './wire';
import { ILLUSTRATIVE_CHECK, KEY_TAG, NSEC_CHAIN, OTHER, ZONE, illustrative, labelCount, present, relative } from './zone.testdata';
import { TYPES } from './types';
import { recordInstance } from './record';
import { dnsExchange } from '../../protocols/exchanges/dns';

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
/** Independent reference: the Web Crypto implementation of the test runtime. */
const digest = async (alg: 'SHA-1' | 'SHA-256', data: Uint8Array) => new Uint8Array(await crypto.subtle.digest(alg, new Uint8Array(data)));

describe('sha256', () => {
  it.each([[''], ['abc'], ['a'.repeat(55)], ['a'.repeat(56)], ['x'.repeat(1000)]])('matches Web Crypto for %#', async (s) => {
    const data = new TextEncoder().encode(s);
    expect(hex(sha256(data))).toBe(hex(await digest('SHA-256', data)));
  });
});

describe('DNSSEC computations against RFC 4034', () => {
  // RFC 4034 section 5.4: dskey.example.com. DNSKEY 256 3 5 ... ; key id = 60485, DS 60485 5 1 2BB183AF...
  const key: Rdata = {
    type: 'DNSKEY',
    flags: 256,
    protocol: 3,
    algorithm: 5,
    publicKey: b64('AQOeiiR0GOMYkDshWoSKz9XzfwJr1AYtsmx3TGkJaNXVbfi/2pHm822aJ5iI9BMzNXxeYCmZDRD99WYwYqUSdjMmmAphXdvxegXd/M5+X7OrzKBaMbCVdFLUUh6DhweJBjEVv5f2wwjM9XzcnOf+EPbtG9DMBmADjFDc2w/rljwvFw=='),
  };
  it('computes the key tag of the example key', () => {
    expect(keyTag(encodeRdata(key))).toBe(60485);
  });
  it('builds the DS digest input like the example (checked with its SHA-1 digest)', async () => {
    const input = concat(encodeName('dskey.example.com.', true), encodeRdata(key));
    expect(hex(await digest('SHA-1', input)).toUpperCase()).toBe('2BB183AF5F22588179A53B0A98631FAD1A292118');
    expect(dsDigest('dskey.example.com.', encodeRdata(key))).toEqual(await digest('SHA-256', input));
  });
  it('encodes type bit maps like section 4.3', () => {
    expect(Array.from(typeBitmaps(['A', 'MX', 'RRSIG', 'NSEC']))).toEqual([0x00, 0x06, 0x40, 0x01, 0x00, 0x00, 0x00, 0x03]);
  });
  it('sorts names canonically like section 6.1', () => {
    const order = ['example.', 'a.example.', 'yljkjljk.a.example.', 'Z.a.example.', 'zABC.a.EXAMPLE.', 'z.example.', '*.z.example.'];
    expect([...order].reverse().sort(canonicalCompare)).toEqual(order);
  });
});

describe('wire format', () => {
  it('encodes names and IPv6 addresses', () => {
    expect(Array.from(encodeName('www.example.com.'))).toEqual([3, 119, 119, 119, 7, 101, 120, 97, 109, 112, 108, 101, 3, 99, 111, 109, 0]);
    expect(Array.from(encodeName('.'))).toEqual([0]);
    expect(Array.from(encodeIpv6('2001:db8::80'))).toEqual([0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x80]);
  });
  it('writes RDLENGTH and splits every record into fields that add up', () => {
    for (const rec of [...ZONE, ...OTHER.map((o) => o.record)]) {
      const wire = encodeRecord(rec);
      const nameLen = encodeName(rec.owner).length;
      const rdlength = (wire[nameLen + 8] << 8) | wire[nameLen + 9];
      expect(rdlength, `${rec.owner} ${rec.rdata.type}`).toBe(encodeRdata(rec.rdata).length);
      const inst = recordInstance(rec);
      const bits = Object.values(inst.values).reduce((n, v) => n + v.bits, 0);
      expect(bits, `${rec.owner} ${rec.rdata.type}`).toBe(wire.length * 8);
      expect(inst.def.fields.map((f) => f.id).sort()).toEqual(Object.keys(inst.values).sort());
    }
  });
  it('has the IANA type numbers', () => {
    expect(TYPE_CODES).toMatchObject({ A: 1, NS: 2, CNAME: 5, SOA: 6, PTR: 12, MX: 15, TXT: 16, AAAA: 28, SRV: 33, DS: 43, RRSIG: 46, NSEC: 47, DNSKEY: 48, HTTPS: 65, CAA: 257 });
  });
});

describe('example zone', () => {
  const all = [...ZONE, ...OTHER.map((o) => o.record)];
  const at = (owner: string) => ZONE.filter((r) => r.owner === owner);
  const isCname = (name: string) => at(name).some((r) => r.rdata.type === 'CNAME');

  it('shows an example for every type', () => {
    for (const t of TYPES) expect(all.some((r) => r.rdata.type === t.type), t.type).toBe(true);
  });
  it('matches the DNS exchange: www.example.com and ns1.example.com', () => {
    const answer = dnsExchange.steps.at(-1)!.captures[0].layers.find((l) => l.def.id === 'dns')!.values.answer.display;
    const www = at('www.example.com.').find((r) => r.rdata.type === 'A')!;
    expect(answer).toContain(present(www).rdata);
    expect(at('ns1.example.com.')[0].rdata).toEqual({ type: 'A', address: '203.0.113.53' });
  });
  it('has exactly one SOA, at the apex', () => {
    expect(ZONE.filter((r) => r.rdata.type === 'SOA').map((r) => r.owner)).toEqual(['example.com.']);
  });
  it('follows the rules it teaches', () => {
    for (const r of ZONE.filter((x) => x.rdata.type === 'CNAME')) {
      expect(at(r.owner).filter((x) => !['CNAME', 'RRSIG', 'NSEC'].includes(x.rdata.type)), `${r.owner} has only the CNAME`).toEqual([]);
    }
    for (const r of ZONE) {
      const target = r.rdata.type === 'MX' ? r.rdata.exchange : r.rdata.type === 'NS' || r.rdata.type === 'SRV' ? r.rdata.target : undefined;
      if (!target) continue;
      expect(isCname(target), `${r.rdata.type} ${target} is no CNAME`).toBe(false);
      if (target.endsWith('.example.com.')) expect(at(target).some((x) => x.rdata.type === 'A'), `${target} has an address`).toBe(true);
    }
    expect(ZONE.filter((r) => r.rdata.type === 'TXT' && r.rdata.strings.join('').startsWith('v=spf1')).filter((r) => r.owner === 'example.com.')).toHaveLength(1);
    for (const r of ZONE) if (r.rdata.type === 'TXT') for (const s of r.rdata.strings) expect(s.length).toBeLessThanOrEqual(255);
  });
  it('signs consistently: RRSIG labels and key tag, DS digest of the key', () => {
    const sig = ZONE.find((r) => r.rdata.type === 'RRSIG')!;
    if (sig.rdata.type !== 'RRSIG') throw new Error();
    expect(sig.rdata.labels).toBe(labelCount(sig.owner));
    expect(sig.rdata.keyTag).toBe(KEY_TAG);
    const covered = sig.rdata.typeCovered;
    expect(ZONE.some((r) => r.owner === sig.owner && r.rdata.type === covered)).toBe(true);
    const key = ZONE.find((r) => r.rdata.type === 'DNSKEY')!;
    const ds = OTHER.find((o) => o.record.rdata.type === 'DS')!.record.rdata;
    if (ds.type !== 'DS') throw new Error();
    expect(ds.keyTag).toBe(keyTag(encodeRdata(key.rdata)));
    expect(ds.digest).toEqual(dsDigest(key.owner, encodeRdata(key.rdata)));
  });
  it('chains NSEC in canonical order, starting at the apex', () => {
    expect(NSEC_CHAIN[0].owner).toBe('example.com.');
    const first = NSEC_CHAIN[0].rdata;
    if (first.type !== 'NSEC') throw new Error();
    expect(first.next).toBe('_dmarc.example.com.');
    expect(first.types).toEqual(expect.arrayContaining(['SOA', 'NS', 'MX', 'DNSKEY', 'RRSIG', 'NSEC']));
    const last = NSEC_CHAIN.at(-1)!.rdata;
    expect(last.type === 'NSEC' && last.next).toBe('example.com.');
  });
  it('marks example keys and signatures as illustrative', () => {
    expect(ILLUSTRATIVE_CHECK.map(illustrative).every(Boolean)).toBe(true);
  });
  it('writes owners relative to the origin', () => {
    expect(relative('example.com.')).toBe('@');
    expect(relative('_imaps._tcp.example.com.')).toBe('_imaps._tcp');
    expect(relative('ns2.example.net.')).toBe('ns2.example.net.');
  });
});
