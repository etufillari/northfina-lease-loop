// Pure domain logic for longer-term offers and price protection.
//
// Rules per AGENTS.md:
// - Pure functions: no I/O, no database, no fetch, no Date.now() / new Date() / Math.random().
// - Pass dates (ISO YYYY-MM-DD or timestamps) and data as arguments.
// - All monetary amounts are integer euro cents. Derived values rounded once via Math.round.

import type { CoefficientTable, VatRates } from '@/data/schemas';
import { calculateContractQuote, type ContractQuoteResult } from './contract-pricing';

/** Default offer validity duration: 14 calendar days. */
export const DEFAULT_OFFER_VALIDITY_DAYS = 14;

/** Supported preset offer validity durations in days. */
export const OFFER_VALIDITY_PRESETS = [7, 14, 30] as const;
export type OfferValidityDays = (typeof OFFER_VALIDITY_PRESETS)[number];

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses an ISO date string (YYYY-MM-DD) into year, month (1-12), and day (1-31).
 * Throws RangeError if invalid.
 */
function parseIsoDate(isoDate: string): { year: number; month: number; day: number } {
  if (!ISO_DATE_REGEX.test(isoDate)) {
    throw new RangeError(`isoDate must match YYYY-MM-DD, got "${isoDate}"`);
  }
  const [yearStr, monthStr, dayStr] = isoDate.split('-');
  return {
    year: Number(yearStr),
    month: Number(monthStr),
    day: Number(dayStr),
  };
}

/** Formats year, month, day into YYYY-MM-DD without timezone shifts. */
function formatPartsToIso(year: number, month: number, day: number): string {
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Calculates future expiry ISO date (`YYYY-MM-DD`) by adding `validityDays` to `isoStartDate`.
 * Uses pure UTC calendar date math (no local timezone offsets).
 */
export function calculateOfferExpiryDate(
  isoStartDate: string,
  validityDays: number = DEFAULT_OFFER_VALIDITY_DAYS
): string {
  if (!Number.isInteger(validityDays) || validityDays <= 0) {
    throw new RangeError(`validityDays must be a positive integer, got ${validityDays}`);
  }
  const { year, month, day } = parseIsoDate(isoStartDate);

  // UTC Date constructor avoids local daylight saving shifts
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  utcDate.setUTCDate(utcDate.getUTCDate() + validityDays);

  return formatPartsToIso(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth() + 1,
    utcDate.getUTCDate()
  );
}

/** Converts an ISO date or timestamp into epoch milliseconds. */
function toEpochMs(value: string | Date | number): number {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  const trimmed = value.trim();
  if (ISO_DATE_REGEX.test(trimmed)) {
    const { year, month, day } = parseIsoDate(trimmed);
    // An end-of-day UTC boundary for date-only expiry
    return Date.UTC(year, month - 1, day, 23, 59, 59, 999);
  }
  return new Date(trimmed).getTime();
}

/** Checks whether an offer has expired as of `now`. Matches isReservationExpired boundary. */
export function isOfferExpired(
  expiresAt: string | Date | number,
  now: string | Date | number
): boolean {
  return toEpochMs(now) >= toEpochMs(expiresAt);
}

/** Computes remaining whole calendar days from `now` to `expiresAt`, floored at 0. */
export function remainingOfferDays(
  expiresAt: string | Date | number,
  now: string | Date | number
): number {
  const diffMs = toEpochMs(expiresAt) - toEpochMs(now);
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

export type OfferQuoteTerms = {
  listPriceCents: number;
  priceListVersion: number;
  termMonths: number;
  downPaymentCents: number;
  monthlyNetRentCents: number;
  monthlyGrossRentCents: number;
  vatRatePercent?: number;
  buyoutNetCents: number;
  offeredOn: string;
};

export type PriceProtectionStatus =
  | 'price_protected' // Current price is higher; offer locks lower price
  | 'price_locked_prior_version' // Current price is lower; offer locks agreed price per contract
  | 'same_price' // Prices are identical
  | 'offer_expired'; // Offer has elapsed; current catalogue price applies

export type OfferPriceProtectionResult = {
  isOfferValid: boolean;
  priceChange: 'increase' | 'decrease' | 'none';
  priceDifferenceCents: number; // current - offered
  effectiveListPriceCents: number;
  effectivePriceListVersion: number;
  status: PriceProtectionStatus;
  savingsCents: number; // list price savings when price increased
  explanationKey: string;
};

/**
 * Pure evaluation of price protection for a longer-term offer:
 * - If the catalogue price increased since the offer was made, the lower offered price is locked.
 * - If the offer expired, current catalogue pricing applies.
 * - If the catalogue price decreased, the offer's agreed price is locked per contract terms.
 */
export function evaluateOfferPriceProtection(input: {
  offerTerms: OfferQuoteTerms;
  currentListPriceCents: number;
  currentPriceListVersion: number;
  asOfDate: string | Date | number;
  expiresAt: string | Date | number;
}): OfferPriceProtectionResult {
  const { offerTerms, currentListPriceCents, currentPriceListVersion, asOfDate, expiresAt } = input;

  const expired = isOfferExpired(expiresAt, asOfDate);
  if (expired) {
    const diff = currentListPriceCents - offerTerms.listPriceCents;
    return {
      isOfferValid: false,
      priceChange: diff > 0 ? 'increase' : diff < 0 ? 'decrease' : 'none',
      priceDifferenceCents: diff,
      effectiveListPriceCents: currentListPriceCents,
      effectivePriceListVersion: currentPriceListVersion,
      status: 'offer_expired',
      savingsCents: 0,
      explanationKey: 'offer.protection.expired',
    };
  }

  const diff = currentListPriceCents - offerTerms.listPriceCents;

  if (diff > 0) {
    return {
      isOfferValid: true,
      priceChange: 'increase',
      priceDifferenceCents: diff,
      effectiveListPriceCents: offerTerms.listPriceCents,
      effectivePriceListVersion: offerTerms.priceListVersion,
      status: 'price_protected',
      savingsCents: diff,
      explanationKey: 'offer.protection.priceProtected',
    };
  }

  if (diff < 0) {
    return {
      isOfferValid: true,
      priceChange: 'decrease',
      priceDifferenceCents: diff,
      effectiveListPriceCents: offerTerms.listPriceCents,
      effectivePriceListVersion: offerTerms.priceListVersion,
      status: 'price_locked_prior_version',
      savingsCents: 0,
      explanationKey: 'offer.protection.lockedPriorVersion',
    };
  }

  return {
    isOfferValid: true,
    priceChange: 'none',
    priceDifferenceCents: 0,
    effectiveListPriceCents: offerTerms.listPriceCents,
    effectivePriceListVersion: offerTerms.priceListVersion,
    status: 'same_price',
    savingsCents: 0,
    explanationKey: 'offer.protection.samePrice',
  };
}

export type QuoteWithOfferInput = {
  offerTerms: OfferQuoteTerms;
  currentListPriceCents: number;
  currentPriceListVersion: number;
  asOfDate: string;
  expiresAt: string | Date | number;
  coefficientTable: CoefficientTable;
  vatRates: VatRates;
};

export type QuoteWithOfferResult = {
  protection: OfferPriceProtectionResult;
  quoteResult: ContractQuoteResult;
  monthlyNetRentSavingsCents: number;
  monthlyGrossRentSavingsCents: number;
};

/**
 * Calculates contract quote respecting an active longer-term offer.
 * If list price increased, preserves the offered price and computes exact monthly savings.
 */
export function calculateQuoteWithOffer(input: QuoteWithOfferInput): QuoteWithOfferResult {
  const protection = evaluateOfferPriceProtection({
    offerTerms: input.offerTerms,
    currentListPriceCents: input.currentListPriceCents,
    currentPriceListVersion: input.currentPriceListVersion,
    asOfDate: input.asOfDate,
    expiresAt: input.expiresAt,
  });

  const quoteResult = calculateContractQuote({
    listPriceCents: protection.effectiveListPriceCents,
    priceListVersion: protection.effectivePriceListVersion,
    downPaymentCents: input.offerTerms.downPaymentCents,
    termMonths: input.offerTerms.termMonths,
    isoDate: input.asOfDate,
    coefficientTable: input.coefficientTable,
    vatRates: input.vatRates,
  });

  let monthlyNetRentSavingsCents = 0;
  let monthlyGrossRentSavingsCents = 0;

  if (protection.status === 'price_protected' && quoteResult.ok) {
    const unadjustedQuote = calculateContractQuote({
      listPriceCents: input.currentListPriceCents,
      priceListVersion: input.currentPriceListVersion,
      downPaymentCents: input.offerTerms.downPaymentCents,
      termMonths: input.offerTerms.termMonths,
      isoDate: input.asOfDate,
      coefficientTable: input.coefficientTable,
      vatRates: input.vatRates,
    });

    if (unadjustedQuote.ok) {
      monthlyNetRentSavingsCents = Math.max(
        0,
        unadjustedQuote.quote.monthlyNetRentCents - quoteResult.quote.monthlyNetRentCents
      );
      monthlyGrossRentSavingsCents = Math.max(
        0,
        unadjustedQuote.quote.monthlyGrossRentCents - quoteResult.quote.monthlyGrossRentCents
      );
    }
  }

  return {
    protection,
    quoteResult,
    monthlyNetRentSavingsCents,
    monthlyGrossRentSavingsCents,
  };
}
