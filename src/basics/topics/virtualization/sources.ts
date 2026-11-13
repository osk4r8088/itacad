import type { Source } from '../../../shared/schema';

/** Specifications and documentation the virtualization topics lean on. */
export const OCI = (part: string, url: string, note?: string): Source => ({ spec: `Open Container Initiative: ${part}`, url, ...(note ? { note } : {}) });
export const K8S = (page: string, url: string, note?: string): Source => ({ spec: `Kubernetes documentation: ${page}`, url: `https://kubernetes.io/docs/${url}`, ...(note ? { note } : {}) });
export const MAN = (page: string, section: number, note?: string): Source => ({ spec: `Linux man-pages: ${page}(${section})`, url: `https://man7.org/linux/man-pages/man${section}/${page}.${section}.html`, ...(note ? { note } : {}) });
export const KERNEL = (what: string, url: string, note?: string): Source => ({ spec: `The Linux kernel documentation: ${what}`, url, ...(note ? { note } : {}) });
