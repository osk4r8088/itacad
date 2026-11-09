// Re-exports for the tests, plus the records that must carry an "illustrative" note.
export * from './zone';
import { ZONE } from './zone';
export const ILLUSTRATIVE_CHECK = ZONE.filter((r) => r.rdata.type === 'RRSIG' || r.rdata.type === 'DNSKEY' || r.owner.includes('._domainkey.'));
