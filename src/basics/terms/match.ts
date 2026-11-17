/**
 * Links key terms in topic texts to the place where they are defined.
 * Pure functions without React, shared by the topic page, the build of the term index and the tests.
 */

/** A term that may be linked, as stored in the term index (built in build.ts). */
export interface LinkableTerm {
  term: string;
  /** Id of the topic that defines the term. */
  topic: string;
  category: string;
  slug: string;
  /** The words that are matched in texts, longest first; see termForms. */
  forms: string[];
  /**
   * Pages on which this term means something else and is never linked: a topic id ("gpu"), an exchange
   * ("protocols/tcp", "learn/syn-flood"), or every exchange of a section ("protocols/*").
   */
  notIn?: string[];
}

/** A piece of rendered text: plain, or a term linked to its definition. */
export type Segment = string | { text: string; term: LinkableTerm };

/** URL-safe id of a term inside its topic, for example "Page table" -> "page-table". */
export const slugOf = (term: string): string =>
  term
    .toLowerCase()
    .replace(/\+/g, 'plus')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * The words that stand for a term in a text.
 * "Translation lookaside buffer (TLB)" gives the long form and the abbreviation.
 * A parenthesis that is not an abbreviation qualifies an ambiguous word, as in "Service (cluster)";
 * such terms are not matched at all, because the word alone means something else in most texts.
 * Abbreviations of one letter are not matched.
 */
export function termForms(term: string): string[] {
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(term);
  if (!m) return [term];
  const [, base, inner] = m;
  if (!isAbbreviation(inner)) return [];
  return inner.length > 1 ? [base, inner] : [base];
}

/**
 * An abbreviation has no spaces and a capital letter that does not only start a word: TLB, kWh, PCIe, U.
 * A capitalized word such as "Linux" in "Namespace (Linux)" is a qualifier, not an abbreviation.
 */
const isAbbreviation = (s: string) => !/\s/.test(s) && /[A-Z]/.test(s) && !/^[A-Z][a-z]+$/.test(s);

/** A form with a capital letter after its first character is matched case-sensitively: CPU, NVMe, macOS. */
const caseSensitive = (form: string) => /[A-Z]/.test(form.slice(1));

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface Matcher {
  /** One pattern for all forms; group n + 1 is the form forms[n]. */
  pattern: RegExp;
  forms: { form: string; term: LinkableTerm; sensitive: boolean }[];
}

/**
 * Compiles the term index into one regular expression. Longer forms come first, so that
 * "Page table" wins over "Page". A form may take a plural ending (s or es), and is never part of a
 * longer word or of a word joined with a hyphen.
 */
export function compileMatcher(terms: LinkableTerm[]): Matcher {
  const forms = terms
    .flatMap((term) => term.forms.map((form) => ({ form, term, sensitive: caseSensitive(form) })))
    .sort((a, b) => b.form.length - a.form.length || a.form.localeCompare(b.form));
  const alternatives = forms.map(({ form, sensitive }) => {
    const body = sensitive ? escape(form) : [...form].map((c) => (/[a-z]/i.test(c) ? `[${c.toLowerCase()}${c.toUpperCase()}]` : escape(c))).join('');
    return `(${body})`;
  });
  const pattern = new RegExp(`(?<![\\w-])(?:${alternatives.join('|')})(?:e?s)?(?![\\w-])`, 'g');
  return { pattern, forms };
}

/** Whether a page is named in a notIn list, directly or through "<section>/*". */
export const excludedOn = (notIn: string[] | undefined, page: string): boolean =>
  notIn?.some((p) => p === page || (p.endsWith('/*') && page.startsWith(p.slice(0, -1)))) ?? false;

/**
 * Splits a text into plain pieces and linked terms.
 * `page` names where the text is shown: a topic id, or "protocols/<id>" and "learn/<id>" for exchanges.
 * A topic never links its own terms.
 * `linked` collects the terms already linked in the current section, so that each term is linked
 * once per section; pass the same set for every text of one section.
 */
export function linkTerms(text: string, matcher: Matcher, page: string, linked: Set<string>): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(matcher.pattern)) {
    const index = m.slice(1).findIndex((g) => g !== undefined);
    const { term } = matcher.forms[index];
    const key = `${term.topic}/${term.slug}`;
    if (term.topic === page || excludedOn(term.notIn, page) || linked.has(key)) continue;
    linked.add(key);
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push({ text: m[0], term });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** A text with paragraphs separated by blank lines, as Prose renders it, linked paragraph by paragraph. */
export const linkProse = (text: string, matcher: Matcher, page: string, linked: Set<string>): Segment[][] =>
  text.split(/\n\s*\n/).map((p) => linkTerms(p, matcher, page, linked));
