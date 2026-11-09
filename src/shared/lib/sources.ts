import type { Source } from '../schema';

export function sourceLabel(s: Source): string {
  const base = 'rfc' in s ? `RFC ${s.rfc}` : s.spec;
  // RFC sections are numbers ("section 3.2"); appendices and IEEE clauses carry their own word.
  return s.section ? `${base}, ${'rfc' in s && /^\d/.test(s.section) ? 'section ' : ''}${s.section}` : base;
}

export function sourceUrl(s: Source): string | undefined {
  if ('rfc' in s) {
    const appendix = s.section && /^Appendix ([A-Z](\.\d+)*)$/.exec(s.section);
    const anchor = s.section && /^\d/.test(s.section) ? `#section-${s.section}` : appendix ? `#appendix-${appendix[1]}` : '';
    return `https://www.rfc-editor.org/rfc/rfc${s.rfc}${anchor}`;
  }
  return s.url;
}
