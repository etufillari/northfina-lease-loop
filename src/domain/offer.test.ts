import { describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadVatRates } from '@/data/load';
import {
  calculateOfferExpiryDate,
  calculateQuoteWithOffer,
  DEFAULT_OFFER_VALIDITY_DAYS,
  evaluateOfferPriceProtection,
  isOfferExpired,
  OFFER_VALIDITY_PRESETS,
  remainingOfferDays,
  type OfferQuoteTerms,
} from './offer';

describe('calculateOfferExpiryDate', () => {
  it('adds default 14 days correctly', () => {
    expect(calculateOfferExpiryDate('2026-11-05')).toBe('2026-11-19');
    expect(calculateOfferExpiryDate('2026-11-05', DEFAULT_OFFER_VALIDITY_DAYS)).toBe('2026-11-19');
  });

  it('handles month boundaries', () => {
    // Nov has 30 days; 2026-11-25 + 7 days -> Dec 2
    expect(calculateOfferExpiryDate('2026-11-25', 7)).toBe('2026-12-02');
  });

  it('handles year boundaries', () => {
    // 2026-12-25 + 14 days -> 2027-01-08
    expect(calculateOfferExpiryDate('2026-12-25', 14)).toBe('2027-01-08');
  });

  it('handles leap years (2028 is a leap year)', () => {
    // 2028-02-20 + 10 days -> 2028-03-01
    expect(calculateOfferExpiryDate('2028-02-20', 10)).toBe('2028-03-01');
  });

  it('supports all presets: 7, 14, 30 days', () => {
    expect(OFFER_VALIDITY_PRESETS).toEqual([7, 14, 30]);
    expect(calculateOfferExpiryDate('2026-05-01', 7)).toBe('2026-05-08');
    expect(calculateOfferExpiryDate('2026-05-01', 14)).toBe('2026-05-15');
    expect(calculateOfferExpiryDate('2026-05-01', 30)).toBe('2026-05-31');
  });

  it('throws on invalid date input or non-positive validity days', () => {
    expect(() => calculateOfferExpiryDate('2026/11/05')).toThrow(RangeError);
    expect(() => calculateOfferExpiryDate('invalid')).toThrow(RangeError);
    expect(() => calculateOfferExpiryDate('2026-11-05', 0)).toThrow(RangeError);
    expect(() => calculateOfferExpiryDate('2026-11-05', -5)).toThrow(RangeError);
  });
});

describe('isOfferExpired and remainingOfferDays', () => {
  it('detects active vs expired offers', () => {
    const expiresAt = '2026-11-19T23:59:59.999Z';

    expect(isOfferExpired(expiresAt, '2026-11-06T12:00:00.000Z')).toBe(false);
    expect(isOfferExpired(expiresAt, '2026-11-19T23:59:59.998Z')).toBe(false);
    expect(isOfferExpired(expiresAt, expiresAt)).toBe(true);
    expect(isOfferExpired(expiresAt, '2026-11-20T00:00:00.000Z')).toBe(true);
    expect(isOfferExpired(expiresAt, '2026-11-25T00:00:00.000Z')).toBe(true);
  });

  it('handles ISO date-only strings by defaulting to end of day', () => {
    expect(isOfferExpired('2026-11-19', '2026-11-19T10:00:00.000Z')).toBe(false);
    expect(isOfferExpired('2026-11-19', '2026-11-20T00:00:01.000Z')).toBe(true);
  });

  it('calculates remaining calendar days correctly', () => {
    const expiresAt = '2026-11-19T23:59:59.999Z';

    expect(remainingOfferDays(expiresAt, '2026-11-05T00:00:00.000Z')).toBe(15);
    expect(remainingOfferDays(expiresAt, '2026-11-18T12:00:00.000Z')).toBe(2);
    expect(remainingOfferDays(expiresAt, '2026-11-19T12:00:00.000Z')).toBe(1);
    expect(remainingOfferDays(expiresAt, '2026-11-20T00:00:00.000Z')).toBe(0);
    expect(remainingOfferDays(expiresAt, '2026-11-25T00:00:00.000Z')).toBe(0);
  });
});

describe('evaluateOfferPriceProtection', () => {
  const sampleOfferTerms: OfferQuoteTerms = {
    listPriceCents: 389_000, // ebike-003 price list v1
    priceListVersion: 1,
    termMonths: 36,
    downPaymentCents: 0,
    monthlyNetRentCents: 10_730,
    monthlyGrossRentCents: 13_466,
    vatRatePercent: 25.5,
    buyoutNetCents: 19_450,
    offeredOn: '2026-11-05',
  };

  it('protects customer when price increases between offer and agreement', () => {
    // On 2026-11-06, ebike-003 increased to 408_400 (+5%)
    const result = evaluateOfferPriceProtection({
      offerTerms: sampleOfferTerms,
      currentListPriceCents: 408_400,
      currentPriceListVersion: 2,
      asOfDate: '2026-11-06',
      expiresAt: '2026-11-19',
    });

    expect(result.isOfferValid).toBe(true);
    expect(result.priceChange).toBe('increase');
    expect(result.priceDifferenceCents).toBe(19_400); // 408_400 - 389_000
    expect(result.effectiveListPriceCents).toBe(389_000); // LOWER OFFER PRICE LOCKED
    expect(result.effectivePriceListVersion).toBe(1);
    expect(result.status).toBe('price_protected');
    expect(result.savingsCents).toBe(19_400);
    expect(result.explanationKey).toBe('offer.protection.priceProtected');
  });

  it('locks agreed offer terms when price decreases (e.g. laptop-004 in Scenario 2)', () => {
    // laptop-004 on Nov 5: 349,000 (v1); on Nov 6: 321,100 (v2, -8%)
    const laptopOfferTerms: OfferQuoteTerms = {
      listPriceCents: 349_000,
      priceListVersion: 1,
      termMonths: 36,
      downPaymentCents: 0,
      monthlyNetRentCents: 9_627,
      monthlyGrossRentCents: 12_082,
      vatRatePercent: 25.5,
      buyoutNetCents: 17_450,
      offeredOn: '2026-11-05',
    };

    const result = evaluateOfferPriceProtection({
      offerTerms: laptopOfferTerms,
      currentListPriceCents: 321_100,
      currentPriceListVersion: 2,
      asOfDate: '2026-11-06',
      expiresAt: '2026-11-19',
    });

    expect(result.isOfferValid).toBe(true);
    expect(result.priceChange).toBe('decrease');
    expect(result.priceDifferenceCents).toBe(-27_900);
    expect(result.effectiveListPriceCents).toBe(349_000); // contract offer price locked
    expect(result.effectivePriceListVersion).toBe(1);
    expect(result.status).toBe('price_locked_prior_version');
    expect(result.savingsCents).toBe(0);
    expect(result.explanationKey).toBe('offer.protection.lockedPriorVersion');
  });

  it('handles unchanged price', () => {
    const result = evaluateOfferPriceProtection({
      offerTerms: sampleOfferTerms,
      currentListPriceCents: 389_000,
      currentPriceListVersion: 1,
      asOfDate: '2026-11-06',
      expiresAt: '2026-11-19',
    });

    expect(result.isOfferValid).toBe(true);
    expect(result.priceChange).toBe('none');
    expect(result.priceDifferenceCents).toBe(0);
    expect(result.effectiveListPriceCents).toBe(389_000);
    expect(result.status).toBe('same_price');
  });

  it('reverts to current price list when offer has expired', () => {
    const result = evaluateOfferPriceProtection({
      offerTerms: sampleOfferTerms,
      currentListPriceCents: 408_400,
      currentPriceListVersion: 2,
      asOfDate: '2026-11-25', // past 2026-11-19
      expiresAt: '2026-11-19',
    });

    expect(result.isOfferValid).toBe(false);
    expect(result.status).toBe('offer_expired');
    expect(result.effectiveListPriceCents).toBe(408_400); // CURRENT PRICE APPLIES
    expect(result.effectivePriceListVersion).toBe(2);
    expect(result.savingsCents).toBe(0);
    expect(result.explanationKey).toBe('offer.protection.expired');
  });
});

describe('calculateQuoteWithOffer', async () => {
  const coefficientTable = await loadCoefficientTable();
  const vatRates = await loadVatRates();

  const sampleOfferTerms: OfferQuoteTerms = {
    listPriceCents: 389_000, // ebike-003 price list v1
    priceListVersion: 1,
    termMonths: 36,
    downPaymentCents: 0,
    monthlyNetRentCents: 10_730,
    monthlyGrossRentCents: 13_466,
    vatRatePercent: 25.5,
    buyoutNetCents: 19_450,
    offeredOn: '2026-11-05',
  };

  it('calculates quote and monthly rent savings when price increased', () => {
    // Current price is 408_400 on 2026-11-06
    const res = calculateQuoteWithOffer({
      offerTerms: sampleOfferTerms,
      currentListPriceCents: 408_400,
      currentPriceListVersion: 2,
      asOfDate: '2026-11-06',
      expiresAt: '2026-11-19',
      coefficientTable,
      vatRates,
    });

    expect(res.protection.status).toBe('price_protected');
    expect(res.protection.effectiveListPriceCents).toBe(389_000);
    expect(res.quoteResult.ok).toBe(true);

    if (res.quoteResult.ok) {
      expect(res.quoteResult.quote.monthlyNetRentCents).toBe(10_730);
      expect(res.quoteResult.quote.monthlyGrossRentCents).toBe(13_466);
    }

    // Unadjusted for 408_400: 408_400 * 0.027584 = 11_265 cents net, gross = 11_265 + 2_873 = 14_138 cents
    // Monthly net savings: 11_265 - 10_730 = 535 cents (€5.35/mo)
    // Monthly gross savings: 14_138 - 13_466 = 672 cents (€6.72/mo)
    expect(res.monthlyNetRentSavingsCents).toBe(535);
    expect(res.monthlyGrossRentSavingsCents).toBe(672);
  });

  it('uses current price if offer has expired', () => {
    const res = calculateQuoteWithOffer({
      offerTerms: sampleOfferTerms,
      currentListPriceCents: 408_400,
      currentPriceListVersion: 2,
      asOfDate: '2026-11-25',
      expiresAt: '2026-11-19',
      coefficientTable,
      vatRates,
    });

    expect(res.protection.status).toBe('offer_expired');
    expect(res.protection.effectiveListPriceCents).toBe(408_400);
    expect(res.monthlyNetRentSavingsCents).toBe(0);
    expect(res.monthlyGrossRentSavingsCents).toBe(0);

    if (res.quoteResult.ok) {
      expect(res.quoteResult.quote.monthlyNetRentCents).toBe(11_265);
      expect(res.quoteResult.quote.priceListVersion).toBe(2);
    }
  });
});
