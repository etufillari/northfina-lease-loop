// The slider positions (term and down payment) as they are kept in the URL
// (?term=24&down=50000), so a reload or a language switch keeps what the customer picked.
import type { CoefficientTable } from '@/data/schemas';
import type { SearchParamsInput } from './catalogue';
import { downPaymentRange, leaseTerms, type DownPaymentRange } from './pricing';

export const DEFAULT_TERM_MONTHS = 36;

export type PriceSelection = { termMonths: number; downPaymentCents: number };

/**
 * Reads `term` (months) and `down` (cents) from URL search params for an item priced
 * `listPriceCents`. The URL is untrusted, so:
 * - a term that isn't offered falls back to 36 months (or the first term if 36 isn't offered);
 * - the down payment is rounded to whole euros and clamped into the item's allowed range
 *   (see settleDownPayment); anything missing or unreadable falls back to the smallest
 *   allowed down payment.
 */
export function parsePriceSelection(
  params: SearchParamsInput,
  listPriceCents: number,
  table: CoefficientTable
): PriceSelection {
  const first = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const terms = leaseTerms(table);
  const fallbackTerm = terms.includes(DEFAULT_TERM_MONTHS) ? DEFAULT_TERM_MONTHS : (terms[0] ?? 0);
  const term = Number(first('term'));
  const termMonths = terms.includes(term) ? term : fallbackTerm;

  const range = downPaymentRange(listPriceCents, table);
  if (!range.ok) return { termMonths, downPaymentCents: 0 };

  const raw = first('down');
  const down = Number(raw);
  if (raw === undefined || raw.trim() === '' || !Number.isFinite(down)) {
    return { termMonths, downPaymentCents: range.minCents };
  }
  return { termMonths, downPaymentCents: settleDownPayment(down, range) };
}

/**
 * The down payment to use for an amount the customer asked for: rounded half up to whole euros
 * and clamped into the item's allowed range. It is NOT snapped to the slider step: the slider
 * moves in €10/€100/€1,000 steps for ease, but a typed €1,234 means €1,234.
 */
export function settleDownPayment(
  cents: number,
  range: Extract<DownPaymentRange, { ok: true }>
): number {
  const wholeEuros = Math.floor((cents + 50) / 100) * 100;
  return Math.min(range.maxCents, Math.max(range.minCents, wholeEuros));
}

const WHOLE_EURO_INPUT = /^(\d+)(?:[.,]0{1,2})?$/;

/**
 * Whole euros typed by a person, as cents: "20000", "20 000", "1500 €", or "1500,00" /
 * "1500.00" (zero cents written out). Parsed from the text, never through a float.
 * Returns null for anything else, including real cents ("1234,56"): a down payment is a whole
 * number of euros, so the field says so instead of rounding the amount behind the customer's back.
 */
export function parseWholeEuroInput(text: string): number | null {
  const match = WHOLE_EURO_INPUT.exec(text.replace(/[\s\u00a0\u202f]/g, '').replace(/€$/, ''));
  if (!match) return null;
  const cents = Number(match[1]) * 100;
  return Number.isSafeInteger(cents) ? cents : null;
}
