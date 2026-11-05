// The slider positions (term and down payment) as they are kept in the URL
// (?term=24&down=50000), so a reload or a language switch keeps what the customer picked.
import type { CoefficientTable } from '@/data/schemas';
import type { SearchParamsInput } from './catalogue';
import { downPaymentRange, leaseTerms } from './pricing';

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
  const snapped = Math.round(down / range.stepCents) * range.stepCents;
  const downPaymentCents = Math.min(range.maxCents, Math.max(range.minCents, snapped));
  return { termMonths, downPaymentCents };
}
