import { ZxcvbnFactory, type ZxcvbnResult } from '@zxcvbn-ts/core';
import * as common from '@zxcvbn-ts/language-common';
import * as en from '@zxcvbn-ts/language-en';

// zxcvbn estimates how many guesses an attacker needs who tries likely passwords first:
// common passwords, words, names, keyboard patterns, dates, repeats and sequences.
// This module is only loaded with the password tool, so its dictionaries stay out of the main bundle.

let factory: ZxcvbnFactory | undefined;

function get(): ZxcvbnFactory {
  factory ??= new ZxcvbnFactory({
    translations: en.translations,
    graphs: common.adjacencyGraphs,
    dictionary: { ...common.dictionary, ...en.dictionary },
  });
  return factory;
}

export type Analysis = ZxcvbnResult;

export function analyze(password: string): Analysis {
  return get().check(password);
}
