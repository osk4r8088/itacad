/** How much a reader needs to know before an entry makes sense. */
export type Level = 1 | 2 | 3;

export const LEVELS: Record<Level, { name: string; about: string }> = {
  1: { name: 'Foundations', about: 'No prior knowledge needed.' },
  2: { name: 'Practitioner', about: 'For apprentices and admins who work with it.' },
  3: { name: 'Deep dive', about: 'Bit and specification level.' },
};

export const levelLabel = (level: Level) => `Level ${level}: ${LEVELS[level].name}`;
