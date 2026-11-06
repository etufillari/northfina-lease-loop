// The term comparison: the same item and down payment priced at every term the
// item may be offered (the table's terms under the category's cap, D43), side by side, so the
// customer sees what a longer term costs in total.
import { priceQuote, type PricingData, type QuoteInput, type QuoteRefusal } from './quote';
import { allowedTermsOf } from './terms';

export type TermRow = {
  termMonths: number;
  band: string;
  monthlyNetCents: number;
  monthlyGrossCents: number;
  buyoutCents: number;
  /** The buyout with VAT at the quote day's rate, as the customer would pay it. */
  buyoutGrossCents: number;
  totalIfReturnCents: number;
  totalIfBuyCents: number;
};

export type TermComparison = {
  /** The terms that can be priced, shortest first. */
  rows: TermRow[];
  /** The terms that cannot, with the same refusal `priceQuote` gives. */
  unavailable: { termMonths: number; reason: QuoteRefusal }[];
};

/** Runs `priceQuote` once per allowed term with everything else held the same. */
export function compareTerms(
  data: PricingData,
  input: Omit<QuoteInput, 'termMonths'>
): TermComparison {
  const comparison: TermComparison = { rows: [], unavailable: [] };
  for (const termMonths of allowedTermsOf(data, input.assetId)) {
    const result = priceQuote(data, { ...input, termMonths });
    if (!result.ok) {
      comparison.unavailable.push({ termMonths, reason: result.reason });
      continue;
    }
    const q = result.quote;
    comparison.rows.push({
      termMonths,
      band: q.band,
      monthlyNetCents: q.monthlyNetCents,
      monthlyGrossCents: q.monthlyGrossCents,
      buyoutCents: q.buyoutCents,
      buyoutGrossCents: q.buyoutGrossCents,
      totalIfReturnCents: q.totalIfReturnCents,
      totalIfBuyCents: q.totalIfBuyCents,
    });
  }
  return comparison;
}
