// Minimal checks on names people type: a person's full name (in the application and as the
// signature) and a company name. Deliberately lenient, because names around the world don't
// follow one pattern:
// - no space is required: many people have one name ("Suharto"), and Chinese, Japanese and
//   Korean names are written without one ("王五");
// - any alphabet is fine ("Mäkelä", "Тамм");
// - length is counted in characters (code points), not bytes, so "王" or "Ö" is one.
// What we do refuse is what can't be a name: a single letter, digits or symbols in a person's
// name, and text that is far too long to print on a contract.

export type NameProblem = 'too_short' | 'too_long' | 'not_a_name';

export const MAX_PERSON_NAME_LENGTH = 100;
export const MAX_COMPANY_NAME_LENGTH = 150;

/** Letters (any alphabet) with their accents, spaces, and the - ' ’ . found in real names. */
const PERSON_NAME = /^[\p{L}\p{M}\s'’.-]+$/u;

const characters = (text: string) => [...text].length;
const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0;

/**
 * Why `text` can't be a person's full name, or null if it can. At least two letters; only
 * letters, spaces, hyphens, apostrophes and full stops; at most MAX_PERSON_NAME_LENGTH.
 */
export function checkPersonName(text: string): NameProblem | null {
  const name = text.trim();
  if (characters(name) > MAX_PERSON_NAME_LENGTH) return 'too_long';
  if (!PERSON_NAME.test(name)) return name === '' ? 'too_short' : 'not_a_name';
  if (count(name, /\p{L}/gu) < 2) return 'too_short';
  return null;
}

/**
 * Why `text` can't be a company name, or null if it can. Companies have digits and symbols in
 * their names ("3M Oy", "7-Eleven", "AT&T"), so only: at least two letters or digits, and at
 * most MAX_COMPANY_NAME_LENGTH.
 */
export function checkCompanyName(text: string): NameProblem | null {
  const name = text.trim();
  if (characters(name) > MAX_COMPANY_NAME_LENGTH) return 'too_long';
  if (count(name, /[\p{L}\p{N}]/gu) < 2) return 'too_short';
  return null;
}
