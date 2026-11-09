import type { Source } from '../schema';

export function sourceLabel(s: Source): string {
  const base = 'rfc' in s ? `RFC ${s.rfc}` : s.spec;
  return s.section ? `${base}, ${'rfc' in s ? 'section ' : ''}${s.section}` : base;
}

export function sourceUrl(s: Source): string | undefined {
  if ('rfc' in s) {
    const anchor = s.section && /^\d/.test(s.section) ? `#section-${s.section}` : '';
    return `https://www.rfc-editor.org/rfc/rfc${s.rfc}${anchor}`;
  }
  return s.url;
}
