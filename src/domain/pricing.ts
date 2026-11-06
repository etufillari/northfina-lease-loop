import type { CoefficientTable, PriceList } from '@/data/schemas';
import { isIsoDate } from './calendar';
import { monthlyFactorFor } from './coefficient';
import { decimalToScaled, multiplyRatio } from './money-arithmetic';
import { listPriceOn } from './price-list';

export type PriceTerms = {
  listPriceCents: number;
  downPaymentCents: number;
  financedCents: number;
  termMonths: number;
  coefficientTableId: string;
  coefficientTableVersion: number;
  band: string;
  factorMillionths: number;
  monthlyNetCents: number;
  buyoutNetCents: number;
  totalRentNetCents: number;
};

export type PriceFailure =
  'invalid_down_payment' | 'invalid_term' | 'below_minimum' | 'above_maximum' | 'unknown_term';
export type PriceResult = { ok: true; terms: PriceTerms } | { ok: false; reason: PriceFailure };

type PriceInput = {
  listPriceCents: number;
  downPaymentCents: number;
  termMonths: number;
  table: CoefficientTable;
};

/** All amounts are net. The factor already includes financing; do not add interest again. */
export function calculatePrice(input: PriceInput): PriceResult {
  const { listPriceCents, downPaymentCents, termMonths, table } = input;
  if (!Number.isSafeInteger(listPriceCents) || listPriceCents < 0) {
    throw new RangeError('list price must be non-negative safe integer cents');
  }
  if (
    !Number.isSafeInteger(downPaymentCents) ||
    downPaymentCents < 0 ||
    downPaymentCents > listPriceCents
  ) {
    return { ok: false, reason: 'invalid_down_payment' };
  }
  if (!Number.isSafeInteger(termMonths) || termMonths <= 0) {
    return { ok: false, reason: 'invalid_term' };
  }
  const financedCents = listPriceCents - downPaymentCents;
  const selected = monthlyFactorFor(table, financedCents, termMonths);
  if (!selected.ok) return selected;

  const buyoutPercent = table.end_of_term_buyout_percent_of_financed[String(termMonths)];
  if (buyoutPercent === undefined) return { ok: false, reason: 'unknown_term' };
  const factorMillionths = decimalToScaled(selected.factor, 6);
  const monthlyNetCents = multiplyRatio(financedCents, factorMillionths, 1000000);
  const buyoutNetCents = multiplyRatio(financedCents, decimalToScaled(buyoutPercent, 2), 10000);
  // Fixed instalment policy: total is the sum of rounded instalments, not a second rounding.
  const totalRentNetCents = multiplyRatio(monthlyNetCents, termMonths, 1);
  return {
    ok: true,
    terms: {
      listPriceCents,
      downPaymentCents,
      financedCents,
      termMonths,
      coefficientTableId: table.id,
      coefficientTableVersion: table.version,
      band: selected.band.band,
      factorMillionths,
      monthlyNetCents,
      buyoutNetCents,
      totalRentNetCents,
    },
  };
}

export type DatedPriceTerms = PriceTerms & {
  assetId: string;
  pricedOn: string;
  priceListVersion: number;
};
export type DatedPriceResult =
  | { ok: true; terms: DatedPriceTerms }
  | {
      ok: false;
      reason: PriceFailure | 'unknown_asset' | 'no_price_list_on_date' | 'table_not_yet_valid';
    };

/** Prices on the supplied date. Saving this result is a separate audited server operation. */
export function quoteOn(input: {
  assetId: string;
  isoDate: string;
  priceLists: readonly PriceList[];
  downPaymentCents: number;
  termMonths: number;
  table: CoefficientTable;
}): DatedPriceResult {
  if (!isIsoDate(input.isoDate)) throw new RangeError('priced date must be a real ISO date');
  if (input.isoDate < input.table.valid_from) return { ok: false, reason: 'table_not_yet_valid' };
  const price = listPriceOn(input.priceLists, input.assetId, input.isoDate);
  if (!price.ok) return price;
  const result = calculatePrice({ ...input, listPriceCents: price.priceCents });
  if (!result.ok) return result;
  return {
    ok: true,
    terms: {
      ...result.terms,
      assetId: input.assetId,
      pricedOn: input.isoDate,
      priceListVersion: price.priceListVersion,
    },
  };
}
