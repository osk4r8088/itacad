/** Plain-language names for the patterns zxcvbn reports. */
export const PATTERN_NAMES: Record<string, string> = {
  dictionary: 'Known word or password',
  spatial: 'Keyboard pattern',
  repeat: 'Repetition',
  sequence: 'Sequence',
  regex: 'Recognizable format',
  date: 'Date',
  bruteforce: 'Random characters',
  separator: 'Separator',
  wordSequence: 'Word sequence',
};

export const SCORE_NAMES = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'] as const;

/** Readable names for the zxcvbn dictionaries. */
export const DICTIONARY_NAMES: Record<string, string> = {
  'passwords-common': 'leaked passwords',
  'commonWords-en': 'common English words',
  'firstnames-en': 'first names',
  'lastnames-en': 'surnames',
  'wikipedia-en': 'words from Wikipedia',
  'diceware-common': 'the EFF passphrase word list',
  userInputs: 'your own inputs',
};
