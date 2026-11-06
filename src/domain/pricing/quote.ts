// The price breakdown of a lease (D1, D6, D8): from the list price of one item on a day, the term
// and the down payment to the monthly rent, the VAT, the buyout and the total cost. Every item is
// unique, so a quote prices exactly one unit (D8, decided by the organisers on 6 Nov).
//
// The numbers are computed once here, then frozen in a stored quote (D7). Everything that can
// be derived from the frozen numbers is derived by `breakdownFromFrozen`, so a stored quote and
// a fresh one always show the same lines and a stored quote is never re-priced.
import type {
  Asset,
  AssetCategory,
  CoefficientTable,
  PriceList,
  TermLimits,
  VatRates,
} from '@/data/schemas';
import { monthlyFactorFor } from '../coefficient';
import {
  applyMillionths,
  factorToMillionths,
  percentOf,
  percentToBasisPoints,
  roundHalfUpDiv,
  splitVat,
} from '../money-math';
import { listPriceOn } from '../price-list';
import { vatRateOn } from '../vat';
import { categoryOf, longestAllowedTerm, termAllowed, termsOf } from './terms';

export { termsOf };

export type PricingData = {
  priceLists: readonly PriceList[];
  table: CoefficientTable;
  vatRates: VatRates;
  /** The team's longest term per category (D43); `loadPricingData()` reads it beside the pack. */
  termLimits: TermLimits;
  /** The assets' categories, for the cap (the quote has only an asset id). */
  assets: readonly Pick<Asset, 'id' | 'category'>[];
};

export type QuoteInput = {
  assetId: string;
  termMonths: number;
  /** Net, cents; paid at the start and taken off the financed amount. */
  downPaymentCents: number;
  /** The day the price is taken (list price and VAT rate), `YYYY-MM-DD`. */
  isoDate: string;
};

/** The numbers a stored quote keeps (D7). Everything else is derived from them. */
export type FrozenQuote = {
  assetId: string;
  /** Always 1 (D8): the stored column stays so signing can still guard it (D76). */
  quantity: number;
  isoDate: string;
  priceListVersion: number;
  /** Net list price of one unit on `isoDate`. */
  unitListPriceCents: number;
  downPaymentCents: number;
  financedCents: number;
  band: string;
  factorMillionths: number;
  termMonths: number;
  monthlyNetCents: number;
  buyoutCents: number;
  vatRateBasisPoints: number;
};

export type QuoteBreakdown = FrozenQuote & {
  /** `unitListPriceCents × quantity`. */
  listPriceCents: number;
  monthlyVatCents: number;
  monthlyGrossCents: number;
  /** The buyout as a share of the financed amount, in basis points (1500 = 15 %). */
  buyoutPercentBasisPoints: number;
  /** VAT on the down payment at the quote-date rate (it is invoiced as invoice 0, D5). */
  downPaymentVatCents: number;
  downPaymentGrossCents: number;
  /** VAT on the buyout at the quote-date rate (the buyout is invoiced when the customer buys). */
  buyoutVatCents: number;
  buyoutGrossCents: number;
  /** Gross down payment + every month's gross rent (D6): what the invoices add up to. */
  totalIfReturnCents: number;
  /** The same + the gross buyout (D6). */
  totalIfBuyCents: number;
  /** Always true: VAT is charged at each invoice's date, so a later rate change moves the
   * totals. The quote shows them at the quote-date rate and says they are an estimate. */
  vatIsEstimate: true;
};

export type QuoteRefusal =
  | { code: 'invalid_down_payment'; params: { downPaymentCents: number } }
  | { code: 'unknown_term'; params: { termMonths: number; terms: number[] } }
  | { code: 'unknown_asset'; params: { assetId: string } }
  | {
      code: 'term_over_category_max';
      params: { category: AssetCategory; termMonths: number; maxTermMonths: number };
    }
  | { code: 'no_price_list_on_date'; params: { isoDate: string } }
  | { code: 'down_payment_too_high'; params: { downPaymentCents: number; listPriceCents: number } }
  | { code: 'below_minimum'; params: { financedCents: number; minimumCents: number } }
  | { code: 'above_maximum'; params: { financedCents: number; maximumCents: number } }
  | { code: 'no_vat_rate_on_date'; params: { isoDate: string } };

export type QuoteResult = { ok: true; quote: QuoteBreakdown } | { ok: false; reason: QuoteRefusal };

/**
 * Prices one item on `input.isoDate`. The checks run in the order a customer would fix them:
 * term, asset and price list, the category's term cap (D43), down payment, then the band of
 * what is left to finance.
 * Every expected refusal is a code with params for the page to write in the visitor's language.
 */
export function priceQuote(data: PricingData, input: QuoteInput): QuoteResult {
  const { assetId, termMonths, downPaymentCents, isoDate } = input;

  if (!Number.isSafeInteger(downPaymentCents) || downPaymentCents < 0) {
    return refuse({ code: 'invalid_down_payment', params: { downPaymentCents } });
  }
  const terms = termsOf(data.table);
  if (!terms.includes(termMonths)) {
    return refuse({ code: 'unknown_term', params: { termMonths, terms } });
  }

  const price = listPriceOn(data.priceLists, assetId, isoDate);
  if (!price.ok) {
    return price.reason === 'unknown_asset'
      ? refuse({ code: 'unknown_asset', params: { assetId } })
      : refuse({ code: 'no_price_list_on_date', params: { isoDate } });
  }

  // D43: the category's cap, before any money is looked at. An asset whose category the data
  // does not know cannot be checked against the cap, so it is not in the catalogue. The refusal
  // names the longest term the table offers under the cap (a cap of 40 says "at most 36").
  const category = categoryOf(data.assets, assetId);
  if (!category) return refuse({ code: 'unknown_asset', params: { assetId } });
  if (!termAllowed(category, termMonths, data.table, data.termLimits)) {
    const maxTermMonths = longestAllowedTerm(category, data.table, data.termLimits);
    return refuse({
      code: 'term_over_category_max',
      params: { category, termMonths, maxTermMonths },
    });
  }

  // D8: every item is unique, so the band is decided on the one item's price.
  const listPriceCents = price.priceCents;
  if (downPaymentCents >= listPriceCents) {
    return refuse({ code: 'down_payment_too_high', params: { downPaymentCents, listPriceCents } });
  }
  const financedCents = listPriceCents - downPaymentCents;

  const factor = monthlyFactorFor(data.table, financedCents, termMonths);
  if (!factor.ok) {
    const bands = data.table.bands;
    if (factor.reason === 'below_minimum') {
      const minimumCents = Math.min(...bands.map((b) => b.min_financed_cents));
      return refuse({ code: 'below_minimum', params: { financedCents, minimumCents } });
    }
    if (factor.reason === 'above_maximum') {
      const maximumCents = Math.max(...bands.map((b) => b.max_financed_cents));
      return refuse({ code: 'above_maximum', params: { financedCents, maximumCents } });
    }
    // The band has no column for a term the buyout table offers: report it as unknown.
    return refuse({ code: 'unknown_term', params: { termMonths, terms } });
  }

  const vat = vatRateOn(data.vatRates, isoDate);
  if (!vat.ok) return refuse({ code: 'no_vat_rate_on_date', params: { isoDate } });

  const factorMillionths = factorToMillionths(factor.factor);
  const buyoutPercent = data.table.end_of_term_buyout_percent_of_financed[String(termMonths)]!;

  return {
    ok: true,
    quote: breakdownFromFrozen({
      assetId,
      quantity: 1,
      isoDate,
      priceListVersion: price.priceListVersion,
      unitListPriceCents: price.priceCents,
      downPaymentCents,
      financedCents,
      band: factor.band.band,
      factorMillionths,
      termMonths,
      // D1: cents × millionths, divided once and rounded half up.
      monthlyNetCents: applyMillionths(financedCents, factorMillionths),
      buyoutCents: percentOf(financedCents, percentToBasisPoints(buyoutPercent)),
      vatRateBasisPoints: vat.rateBasisPoints,
    }),
  };
}

/**
 * The full breakdown from the frozen numbers alone: VAT and gross per month (D1, VAT rounded
 * from the net), the totals both ways (D6). Every line of the totals
 * carries VAT at the quote-date rate, rounded per line like an invoice line, so the totals are
 * what the invoices add up to when the rate does not change. Needs no data pack,
 * so a stored quote is shown exactly as it was priced.
 */
export function breakdownFromFrozen(frozen: FrozenQuote): QuoteBreakdown {
  const { vatCents, grossCents } = splitVat(frozen.monthlyNetCents, frozen.vatRateBasisPoints);
  const down = splitVat(frozen.downPaymentCents, frozen.vatRateBasisPoints);
  const buyout = splitVat(frozen.buyoutCents, frozen.vatRateBasisPoints);
  const totalIfReturnCents = down.grossCents + grossCents * frozen.termMonths;

  return {
    assetId: frozen.assetId,
    quantity: frozen.quantity,
    isoDate: frozen.isoDate,
    priceListVersion: frozen.priceListVersion,
    unitListPriceCents: frozen.unitListPriceCents,
    listPriceCents: frozen.unitListPriceCents * frozen.quantity,
    downPaymentCents: frozen.downPaymentCents,
    financedCents: frozen.financedCents,
    band: frozen.band,
    factorMillionths: frozen.factorMillionths,
    termMonths: frozen.termMonths,
    monthlyNetCents: frozen.monthlyNetCents,
    vatRateBasisPoints: frozen.vatRateBasisPoints,
    monthlyVatCents: vatCents,
    monthlyGrossCents: grossCents,
    // Recovered from the frozen amounts; exact for any financed amount the table allows,
    // because one cent of buyout rounding is under half a basis point from 300 € up.
    buyoutPercentBasisPoints: roundHalfUpDiv(frozen.buyoutCents * 10_000, frozen.financedCents),
    buyoutCents: frozen.buyoutCents,
    downPaymentVatCents: down.vatCents,
    downPaymentGrossCents: down.grossCents,
    buyoutVatCents: buyout.vatCents,
    buyoutGrossCents: buyout.grossCents,
    totalIfReturnCents,
    totalIfBuyCents: totalIfReturnCents + buyout.grossCents,
    vatIsEstimate: true,
  };
}

function refuse(reason: QuoteRefusal): QuoteResult {
  return { ok: false, reason };
}
