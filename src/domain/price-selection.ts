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
 * - the down payment is snapped to the slider step and clamped into the item's allowed range;
 *   anything missing or unreadable falls back to the smallest allowed down payment.
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
  return { termMonths, downPaymentCents: snapDownPayment(down, range) };
}

/** A down payment snapped to the slider step and clamped into the item's allowed range. */
export function snapDownPayment(
  cents: number,
  range: Extract<DownPaymentRange, { ok: true }>
): number {
  const snapped = Math.round(cents / range.stepCents) * range.stepCents;
  return Math.min(range.maxCents, Math.max(range.minCents, snapped));
}

const EURO_INPUT = /^(\d+)(?:[.,](\d{1,2}))?$/;

/**
 * Euros typed by a person, as whole cents: "20000", "20 000", "1234,5" (Finnish comma) or
 * "1234.50". Parsed from the text, never through a float, so 0.1 + 0.2 problems can't appear.
 * Returns null for anything else: empty, negative, letters or more than two decimals.
 */
export function parseEuroInput(text: string): number | null {
  const match = EURO_INPUT.exec(text.replace(/[\s\u00a0\u202f]/g, '').replace(/€$/, ''));
  if (!match) return null;
  const euros = Number(match[1]);
  const cents = Number((match[2] ?? '').padEnd(2, '0'));
  const total = euros * 100 + cents;
  return Number.isSafeInteger(total) ? total : null;
}
