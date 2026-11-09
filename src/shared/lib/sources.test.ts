import { describe, expect, it } from 'vitest';
import { sourceLabel, sourceUrl } from './sources';

describe('sources', () => {
  it('labels and links numbered sections', () => {
    expect(sourceLabel({ rfc: 9293, section: '3.1' })).toBe('RFC 9293, section 3.1');
    expect(sourceUrl({ rfc: 9293, section: '3.1' })).toBe('https://www.rfc-editor.org/rfc/rfc9293#section-3.1');
  });
  it('labels and links appendices', () => {
    expect(sourceLabel({ rfc: 791, section: 'Appendix B' })).toBe('RFC 791, Appendix B');
    expect(sourceUrl({ rfc: 791, section: 'Appendix B' })).toBe('https://www.rfc-editor.org/rfc/rfc791#appendix-B');
  });
  it('keeps other specifications as they are', () => {
    expect(sourceLabel({ spec: 'IEEE 802.3-2022', section: '3.2.1' })).toBe('IEEE 802.3-2022, 3.2.1');
    expect(sourceUrl({ rfc: 1918 })).toBe('https://www.rfc-editor.org/rfc/rfc1918');
  });
});
