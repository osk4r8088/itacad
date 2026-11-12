import type { Source } from '../../../shared/schema';

/** A chapter of the free textbook the operating system topics lean on. */
export const OSTEP = (chapter: string, file: string): Source => ({
  spec: `Arpaci-Dusseau, Arpaci-Dusseau: Operating Systems, Three Easy Pieces, chapter ${chapter}`,
  url: `https://pages.cs.wisc.edu/~remzi/OSTEP/${file}`,
});

export const SDM: Source = { spec: "Intel 64 and IA-32 Architectures Software Developer's Manual", url: 'https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html' };

/** POSIX: IEEE Std 1003.1, published by The Open Group as the Base Specifications. */
export const POSIX = (what: string): Source => ({ spec: 'IEEE Std 1003.1-2024 (POSIX), The Open Group Base Specifications Issue 8', url: 'https://pubs.opengroup.org/onlinepubs/9799919799/', note: what });

export const MAN = (page: string, section: number, note?: string): Source => ({ spec: `Linux man-pages: ${page}(${section})`, url: `https://man7.org/linux/man-pages/man${section}/${page}.${section}.html`, ...(note ? { note } : {}) });
