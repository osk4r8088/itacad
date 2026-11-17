import TERMS from 'virtual:term-index';
import { expandTermIndex } from './build';
import { compileMatcher } from './match';

/** The key terms of all topics that may be linked, compiled once for every page that links them. */
export const MATCHER = compileMatcher(expandTermIndex(TERMS));
