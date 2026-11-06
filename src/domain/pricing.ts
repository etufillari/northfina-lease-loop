// The price of a lease: financed amount, monthly net rent, buyout and the contract total.
// All amounts are net (VAT excluded). VAT belongs to invoices, see vat.ts and invoicing.ts.
import type { CoefficientTable, PriceList } from '@/data/schemas';
import { monthlyFactorFor } from './coefficient';
import { applyFactor, percentOf } from './money';
import { listPriceOn } from './price-list';

export type QuoteInput = {
  /** Net price the lease is based on: the list price, or a second-life price. */
  listPriceCents: number;
  downPaymentCents: number;
  termMonths: number;
};

export type QuoteBreakdown = QuoteInput & {
  financedCents: number;
  band: string;
  monthlyFactor: number;
  annualInterestPercent: number;
  /** `financed × factor`, rounded half up. This one integer is what a contract locks. */
  monthlyNetRentCents: number;
  buyoutPercent: number;
  /** Optional purchase at the end of the term, so not part of the contract total. */
  buyoutNetCents: number;
  /** `down payment + term × rent`. The net amount of all the contract's invoices, exactly. */
  contractNetTotalCents: number;
};

export type QuoteFailureReason =
  'down_payment_exceeds_price' | 'below_minimum' | 'above_maximum' | 'unknown_term';

export type QuoteResult =
  { ok: true; quote: QuoteBreakdown } | { ok: false; reason: QuoteFailureReason };

function assertWholeCents(label: string, cents: number): void {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new RangeError(`${label} must be non-negative whole cents, got ${cents}`);
  }
}

/**
 * Prices a lease from a net price. Takes the price rather than an asset, so a second-life
 * lease goes through exactly the same calculation as a new one.
 *
 * Note that a bigger down payment can raise the rent: crossing down into a band with a higher
 * factor. 200 000 cents over 36 months costs 5 517 a month; 199 999 cents costs 5 725.
 */
export function calculateQuote(table: CoefficientTable, input: QuoteInput): QuoteResult {
  const { listPriceCents, downPaymentCents, termMonths } = input;
  assertWholeCents('listPriceCents', listPriceCents);
  assertWholeCents('downPaymentCents', downPaymentCents);
  if (downPaymentCents > listPriceCents) {
    return { ok: false, reason: 'down_payment_exceeds_price' };
  }

  const financedCents = listPriceCents - downPaymentCents;
  const factorResult = monthlyFactorFor(table, financedCents, termMonths);
  if (!factorResult.ok) return factorResult;

  const buyoutPercent = table.end_of_term_buyout_percent_of_financed[String(termMonths)];
  if (buyoutPercent === undefined) return { ok: false, reason: 'unknown_term' };

  const monthlyNetRentCents = applyFactor(financedCents, factorResult.factor);
  return {
    ok: true,
    quote: {
      ...input,
      financedCents,
      band: factorResult.band.band,
      monthlyFactor: factorResult.factor,
      annualInterestPercent: factorResult.band.annual_interest_percent,
      monthlyNetRentCents,
      buyoutPercent,
      buyoutNetCents: percentOf(financedCents, buyoutPercent),
      contractNetTotalCents: downPaymentCents + termMonths * monthlyNetRentCents,
    },
  };
}

/** A quote tied to an asset and a day. `priceListVersion` is null for a second-life price. */
export type AssetQuote = QuoteBreakdown & {
  assetId: string;
  quotedOn: string;
  priceListVersion: number | null;
};

export type AssetQuoteResult =
  | { ok: true; quote: AssetQuote }
  | { ok: false; reason: QuoteFailureReason | 'unknown_asset' | 'no_price_list_on_date' };

/** Prices `assetId` from the price list in force on `onDate`. */
export function quoteFromPriceList(
  priceLists: readonly PriceList[],
  table: CoefficientTable,
  input: { assetId: string; onDate: string; downPaymentCents: number; termMonths: number }
): AssetQuoteResult {
  const listPrice = listPriceOn(priceLists, input.assetId, input.onDate);
  if (!listPrice.ok) return listPrice;

  const result = calculateQuote(table, {
    listPriceCents: listPrice.priceCents,
    downPaymentCents: input.downPaymentCents,
    termMonths: input.termMonths,
  });
  if (!result.ok) return result;

  return {
    ok: true,
    quote: {
      ...result.quote,
      assetId: input.assetId,
      quotedOn: input.onDate,
      priceListVersion: listPrice.priceListVersion,
    },
  };
}
