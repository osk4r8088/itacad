import type { LayerDef, LayerInstance } from '../../shared/schema';
import { ntpDef, ntpPollDisplay, ntpPrecisionDisplay, ntpShortDisplay, ntpStratumDisplay, ntpTimestampDisplay, NTP_LI, NTP_MODES } from '../../shared/headers/ntp';
import { type Display, forInput, hex, hexBytes, instance, ip4, num, type Report, slice } from './fields';

// NTP packet header: RFC 5905 section 7.3.

const NTP = forInput(ntpDef, { about: ntpDef.about.replace('; they are not used here', '') });
const NTP_WITH_EXTRA: LayerDef = {
  ...NTP,
  fields: [
    ...NTP.fields,
    {
      id: 'extra',
      name: 'Extension fields or MAC',
      bits: 'variable',
      compact: true,
      about: 'After the header, extension fields can follow, and a message authentication code (MAC): a 32-bit key identifier and a 128-bit digest. The decoder does not read them.',
      source: { rfc: 5905, section: '7.3' },
    },
  ],
};

const signed8 = (n: number) => (n > 127 ? n - 256 : n);
const big = (b: Uint8Array) => b.reduce((v, x) => (v << 8n) | BigInt(x), 0n);

function referenceId(b: Uint8Array, stratum: number): Display[string] {
  if (b.every((x) => x === 0)) return '0';
  if (stratum <= 1) {
    const end = b.indexOf(0) < 0 ? 4 : b.indexOf(0);
    const printable = end > 0 && b.subarray(0, end).every((c) => c >= 0x20 && c < 0x7f) && b.subarray(end).every((c) => c === 0);
    if (!printable) return hex(Number(big(b)), 8);
    const text = String.fromCharCode(...b.subarray(0, end));
    return { display: `"${text}"`, note: stratum === 0 ? 'With stratum 0 this is a kiss code: a short message from the server, for debugging and monitoring.' : 'The name of the reference clock of this primary server.' };
  }
  return { display: ip4(b), note: 'Read as an IPv4 address. If the server gets its time over IPv6, these are the first four octets of the MD5 hash of that IPv6 address.' };
}

function timestamp(b: Uint8Array): Display[string] {
  const raw = big(b);
  const display = ntpTimestampDisplay(raw);
  // The seconds count from 1900 and wrap in February 2036 (RFC 5905 section 6). A first bit of 0 means a date before 1968 in era 0.
  if (raw !== 0n && !(b[0] & 0x80)) return { display, note: 'Read in era 0, which started in 1900. The 32-bit seconds wrap in February 2036; in era 1 the same bits mean a date about 136 years later.' };
  return display;
}

export function decodeNtp(msg: Uint8Array, report: Report): LayerInstance | undefined {
  if (msg.length < 1) return undefined;
  const mode = msg[0] & 7;
  if (mode === 6 || mode === 7) {
    report('info', `NTP mode ${mode} (${NTP_MODES[mode]}) packets do not have the header of RFC 5905 section 7.3 and are not decoded.`);
    return undefined;
  }
  if (msg.length < 48) {
    report('error', `An NTP header needs 48 octets, but only ${msg.length} are left. The input is cut off.`);
    return undefined;
  }
  const def = msg.length > 48 ? NTP_WITH_EXTRA : NTP;
  const s = slice(def.fields, msg);
  const stratum = num(s.raw.stratum);
  const vn = num(s.raw.vn);
  const extra = msg.subarray(48);
  const display: Display = {
    li: NTP_LI[num(s.raw.li)],
    vn: String(vn),
    mode: `${mode} (${NTP_MODES[mode]})`,
    stratum: ntpStratumDisplay(stratum),
    poll: ntpPollDisplay(signed8(num(s.raw.poll))),
    precision: ntpPrecisionDisplay(signed8(num(s.raw.precision))),
    rootDelay: ntpShortDisplay(num(s.raw.rootDelay)),
    rootDisp: ntpShortDisplay(num(s.raw.rootDisp)),
    refid: referenceId(s.bin.refid, stratum),
    refTs: timestamp(s.bin.refTs),
    orgTs: timestamp(s.bin.orgTs),
    recTs: timestamp(s.bin.recTs),
    xmtTs: timestamp(s.bin.xmtTs),
  };
  if (extra.length) display.extra = extra.length === 20 ? `MAC: key identifier ${hex(Number(big(extra.subarray(0, 4))), 8)} and a 16-octet digest` : `${extra.length} octets: ${hexBytes(extra)}`;
  return instance(def, msg, s, display, `NTPv${vn} ${NTP_MODES[mode]}, stratum ${stratum}`);
}
