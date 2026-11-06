// Signing: decides which price is locked and builds the snapshot that never changes again.
//
// THE PRICE-LOCK RULE: a quote is not binding, so the price list live on the signing day
// decides the price. If that differs from what the customer accepted, nothing is signed:
// they get the new figures and confirm them. This works in both directions, so nobody pays a
// price they did not see, and nobody is held to an old price when the list has dropped.
import type { CoefficientTable, PriceList } from '@/data/schemas';
import { addMonthsClamped, assertIsoDate, previousDay } from './calendar';
import { quoteFromPriceList, type AssetQuote, type AssetQuoteResult } from './pricing';

/** The figures the customer saw and agreed to when pressing "sign". */
export type AcceptedPrice = { monthlyNetRentCents: number; buyoutNetCents: number };

export type PriceLockReason = 'price_unchanged_since_quote' | 'list_price_changed_since_quote';

/** Everything the UI needs to say which price was locked and why. */
export type PriceLock = {
  reason: PriceLockReason;
  quotedOn: string;
  signedOn: string;
  quotedPriceListVersion: number | null;
  lockedPriceListVersion: number | null;
  quotedListPriceCents: number;
  lockedListPriceCents: number;
  quotedMonthlyNetRentCents: number;
  lockedMonthlyNetRentCents: number;
};

export type ContractSnapshot = Omit<AssetQuote, 'quotedOn'> & {
  customerId: string;
  signedOn: string;
  /** First day of the lease; invoice dates are counted from it. */
  startDate: string;
  /** Last day covered by the lease. */
  endDate: string;
  priceLock: PriceLock;
};

export type LockContractFailure =
  | { ok: false; reason: 'signed_before_quote' | 'start_before_signing' }
  | { ok: false; reason: 'price_changed'; repriced: AssetQuote }
  | Extract<AssetQuoteResult, { ok: false }>;

export type LockContractResult = { ok: true; snapshot: ContractSnapshot } | LockContractFailure;

/** Last day covered: the 36-month lease from 5 Nov 2026 ends on 4 Nov 2029. */
export function contractEndDate(startDate: string, termMonths: number): string {
  return previousDay(addMonthsClamped(startDate, termMonths));
}

function priceOnSigningDay(
  quote: AssetQuote,
  signedOn: string,
  priceLists: readonly PriceList[],
  table: CoefficientTable
): AssetQuoteResult {
  // A second-life price comes from an assessment, not a list, so no list can change it.
  if (quote.priceListVersion === null) return { ok: true, quote };
  return quoteFromPriceList(priceLists, table, {
    assetId: quote.assetId,
    onDate: signedOn,
    downPaymentCents: quote.downPaymentCents,
    termMonths: quote.termMonths,
  });
}

/** Applies the price-lock rule and returns the immutable snapshot, or why it cannot be signed. */
export function lockContract(input: {
  quote: AssetQuote;
  customerId: string;
  signedOn: string;
  startDate: string;
  accepted: AcceptedPrice;
  priceLists: readonly PriceList[];
  table: CoefficientTable;
}): LockContractResult {
  const { quote, customerId, signedOn, startDate, accepted, priceLists, table } = input;
  assertIsoDate(signedOn);
  assertIsoDate(startDate);
  if (signedOn < quote.quotedOn) return { ok: false, reason: 'signed_before_quote' };
  if (startDate < signedOn) return { ok: false, reason: 'start_before_signing' };

  const current = priceOnSigningDay(quote, signedOn, priceLists, table);
  if (!current.ok) return current;

  const { quotedOn: _quotedOn, ...locked } = current.quote;
  if (
    locked.monthlyNetRentCents !== accepted.monthlyNetRentCents ||
    locked.buyoutNetCents !== accepted.buyoutNetCents
  ) {
    return { ok: false, reason: 'price_changed', repriced: { ...locked, quotedOn: signedOn } };
  }

  const samePrice =
    locked.listPriceCents === quote.listPriceCents &&
    locked.monthlyNetRentCents === quote.monthlyNetRentCents;
  return {
    ok: true,
    snapshot: {
      ...locked,
      customerId,
      signedOn,
      startDate,
      endDate: contractEndDate(startDate, locked.termMonths),
      priceLock: {
        reason: samePrice ? 'price_unchanged_since_quote' : 'list_price_changed_since_quote',
        quotedOn: quote.quotedOn,
        signedOn,
        quotedPriceListVersion: quote.priceListVersion,
        lockedPriceListVersion: locked.priceListVersion,
        quotedListPriceCents: quote.listPriceCents,
        lockedListPriceCents: locked.listPriceCents,
        quotedMonthlyNetRentCents: quote.monthlyNetRentCents,
        lockedMonthlyNetRentCents: locked.monthlyNetRentCents,
      },
    },
  };
}
