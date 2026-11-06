// D90: a pass-on starts the next deal. In the exit's transaction the named customer gets a stored
// quote on the exit day, priced from the item's market value on that day (the value the exit's
// cost already computed, per unit) as its second-life price (D86), through the normal band and
// factor. The term is the default the price page offers (36 months) when the item may be offered
// it, else its first allowed term; with none allowed the default stays and the pricing refuses.
// No down payment: the next customer changes the quote's terms on the price page if they wish.

/** The term the price page opens on (src/app/[locale]/assets/[id]/page.tsx). */
export const NEXT_DEAL_DEFAULT_TERM = 36;

export type NextDealInput = {
  assetId: string;
  /** Per unit, integer cents: the exit cost's `marketValue.valueCents`. */
  marketValueCents: number;
  /** The terms this item may be offered (`allowedTermsOf`). */
  allowedTerms: readonly number[];
  /** The exit day, ISO `YYYY-MM-DD`. */
  today: string;
};

export type NextDealQuote = {
  assetId: string;
  unitPriceCents: number;
  termMonths: number;
  downPaymentCents: number;
  today: string;
};

/** What the next customer's quote is priced from (D90). */
export function nextDealQuote(input: NextDealInput): NextDealQuote {
  if (!Number.isSafeInteger(input.marketValueCents) || input.marketValueCents < 0) {
    throw new RangeError(`market value must be whole cents ≥ 0, got ${input.marketValueCents}`);
  }
  const termMonths = input.allowedTerms.includes(NEXT_DEAL_DEFAULT_TERM)
    ? NEXT_DEAL_DEFAULT_TERM
    : (input.allowedTerms[0] ?? NEXT_DEAL_DEFAULT_TERM);
  return {
    assetId: input.assetId,
    unitPriceCents: input.marketValueCents,
    termMonths,
    downPaymentCents: 0,
    today: input.today,
  };
}
