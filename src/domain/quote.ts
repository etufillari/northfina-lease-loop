// A quote is a dated, time-limited offer: the price of one asset on one day, and where every
// number in it came from. Signing copies it into a contract (see contract.ts).
import type { CoefficientTable, PriceList } from '@/data/schemas';
import { addDays } from './calendar';
import { listPriceOn } from './price-list';
import { quoteLease, type QuoteFailure } from './pricing';
import { QUOTE_VALID_DAYS } from './pricing-rules';

export interface QuoteRequest {
  assetId: string;
  /** The day the customer sees the price (ISO). */
  quoteDate: string;
  termMonths: number;
  downPaymentCents: number;
}

export interface Quote extends QuoteRequest {
  /** Last day the quote can be signed (inclusive). */
  validUntil: string;
  priceListVersion: number;
  coefficientTableId: string;
  listPriceCents: number;
  financedCents: number;
  band: string;
  factor: number;
  monthlyNetRentCents: number;
  buyoutCents: number;
  totalNetRentCents: number;
  totalNetCostCents: number;
}

export type QuoteResult =
  | { ok: true; quote: Quote }
  | { ok: false; reason: QuoteFailure | 'unknown_asset' | 'no_price_list_on_date' };

/** Prices an asset from the price list valid on the quote date. */
export function makeQuote(
  priceLists: readonly PriceList[],
  table: CoefficientTable,
  request: QuoteRequest
): QuoteResult {
  const price = listPriceOn(priceLists, request.assetId, request.quoteDate);
  if (!price.ok) return price;

  const priced = quoteLease(table, {
    listPriceCents: price.priceCents,
    termMonths: request.termMonths,
    downPaymentCents: request.downPaymentCents,
  });
  if (!priced.ok) return priced;

  const { ok: _ok, ...amounts } = priced;
  return {
    ok: true,
    quote: {
      ...request,
      validUntil: addDays(request.quoteDate, QUOTE_VALID_DAYS),
      priceListVersion: price.priceListVersion,
      coefficientTableId: table.id,
      listPriceCents: price.priceCents,
      ...amounts,
    },
  };
}
