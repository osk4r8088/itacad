export type HexResult = { ok: true; bytes: Uint8Array } | { ok: false; error: string };

const OFFSET_LINE = /^\s*[0-9a-f]{4,8}[:\s]\s*/i;

/**
 * Reads bytes from the common copy formats of packet analyzers:
 * a hex stream ("001a2b..."), space or colon separated bytes, "0x" prefixed bytes,
 * and hex dumps with an offset column and an ASCII column ("0000  00 1a 2b ...  ..E.").
 */
export function parseHex(text: string): HexResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { ok: false, error: 'Paste the bytes of a frame or packet as hex.' };

  const isDump = lines.length > 0 && lines.every((l) => OFFSET_LINE.test(l) && /^\s*[0-9a-f]{4,8}[:\s]+([0-9a-f]{2}\s)/i.test(l + ' '));
  const parts: string[] = [];
  for (const line of lines) {
    if (isDump) {
      // Offset, then up to 16 two-digit bytes; whatever follows is the ASCII column.
      const tokens = line.replace(OFFSET_LINE, '').split(/\s+/);
      for (const t of tokens.slice(0, 16)) {
        if (!/^[0-9a-f]{2}$/i.test(t)) break;
        parts.push(t);
      }
    } else {
      parts.push(line.replace(/0x/gi, '').replace(/[\s:,.-]/g, ''));
    }
  }
  const hex = parts.join('');
  const bad = hex.match(/[^0-9a-f]/i);
  if (bad) return { ok: false, error: `"${bad[0]}" is not a hex digit. Use 0 to 9 and a to f, optionally separated by spaces or colons.` };
  if (hex.length % 2 !== 0) return { ok: false, error: `Odd number of hex digits (${hex.length}): every octet needs two digits.` };
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return { ok: true, bytes };
}

export function toHex(bytes: Uint8Array): string {
  const out: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) out.push(Array.from(bytes.subarray(i, i + 16), (b) => b.toString(16).padStart(2, '0')).join(' '));
  return out.join('\n');
}
