import * as hegel from '@hegeldev/hegel';
import * as gs from '@hegeldev/hegel/generators';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadVatRates } from '@/data/load';
import type { CoefficientTable, VatRates } from '@/data/schemas';
import {
  availableTermsFromTable,
  calculateContractQuote,
  clampDownPaymentCents,
  downPaymentBoundsFor,
  vatRateOn,
} from './contract-pricing';

let table: CoefficientTable;
let vatRates: VatRates;

beforeAll(async () => {
  [table, vatRates] = await Promise.all([loadCoefficientTable(), loadVatRates()]);
});

describe('vatRateOn', () => {
  it('returns 25.5 % on 2026-11-05 and 2026-12-31', () => {
    expect(vatRateOn(vatRates, '2026-11-05')).toEqual({
      ok: true,
      ratePercent: 25.5,
      fictional: false,
    });
    expect(vatRateOn(vatRates, '2026-12-31')).toEqual({
      ok: true,
      ratePercent: 25.5,
      fictional: false,
    });
  });

  it('switches to the fictional 26.0 % rate on 2027-01-01', () => {
    expect(vatRateOn(vatRates, '2027-01-01')).toEqual({
      ok: true,
      ratePercent: 26.0,
      fictional: true,
    });
  });

  it('returns no_vat_rate_on_date before the earliest rate', () => {
    expect(vatRateOn(vatRates, '2010-01-01')).toEqual({
      ok: false,
      reason: 'no_vat_rate_on_date',
    });
  });

  it('throws on malformed ISO dates', () => {
    expect(() => vatRateOn(vatRates, '05-11-2026')).toThrow(RangeError);
  });
});

describe('availableTermsFromTable & downPaymentBoundsFor', () => {
  it('extracts sorted lease terms from the coefficient table', () => {
    expect(availableTermsFromTable(table)).toEqual([12, 24, 36, 48]);
  });

  it('caps max down payment so at least 300 € remains financed', () => {
    // 380 000 - 30 000 = 350 000, an exact multiple of 5 000.
    expect(downPaymentBoundsFor(table, 380_000, 5_000)).toEqual({
      minCents: 0,
      maxCents: 350_000,
      stepCents: 5_000,
    });
    // 389 000 - 30 000 = 359 000 → floored to 355 000 at 5 000 cent steps.
    expect(downPaymentBoundsFor(table, 389_000, 5_000)).toEqual({
      minCents: 0,
      maxCents: 355_000,
      stepCents: 5_000,
    });
  });

  it('rounds maxCents down to the nearest step', () => {
    // 199 999 - 30 000 = 169 999 → 165 000 at 5 000 cent steps
    expect(downPaymentBoundsFor(table, 199_999, 5_000)).toEqual({
      minCents: 0,
      maxCents: 165_000,
      stepCents: 5_000,
    });
  });

  it('returns maxCents = 0 when list price is at or below minimum financed amount', () => {
    expect(downPaymentBoundsFor(table, 30_000, 5_000)).toEqual({
      minCents: 0,
      maxCents: 0,
      stepCents: 5_000,
    });
    expect(downPaymentBoundsFor(table, 25_000, 5_000)).toEqual({
      minCents: 0,
      maxCents: 0,
      stepCents: 5_000,
    });
  });

  it('validates inputs and clamps down payment within bounds', () => {
    expect(() => downPaymentBoundsFor(table, -1, 5_000)).toThrow(RangeError);
    expect(() => downPaymentBoundsFor(table, 100_000, 0)).toThrow(RangeError);
    expect(() => clampDownPaymentCents(10.5, { minCents: 0, maxCents: 100 })).toThrow(RangeError);

    expect(clampDownPaymentCents(-500, { minCents: 0, maxCents: 50_000 })).toBe(0);
    expect(clampDownPaymentCents(20_000, { minCents: 0, maxCents: 50_000 })).toBe(20_000);
    expect(clampDownPaymentCents(80_000, { minCents: 0, maxCents: 50_000 })).toBe(50_000);
  });
});

describe('calculateContractQuote', () => {
  it('matches the DATA.md worked example for ebike-003 (36 mo, 0 down, 2026-11-05)', () => {
    const result = calculateContractQuote({
      listPriceCents: 389_000,
      priceListVersion: 1,
      downPaymentCents: 0,
      termMonths: 36,
      isoDate: '2026-11-05',
      coefficientTable: table,
      vatRates,
    });

    expect(result).toEqual({
      ok: true,
      quote: {
        isoDate: '2026-11-05',
        listPriceCents: 389_000,
        priceListVersion: 1,
        downPaymentCents: 0,
        financedCents: 389_000,
        termMonths: 36,
        band: expect.objectContaining({ band: 'B', annual_interest_percent: 7.9 }),
        factor: 0.027584,
        monthlyNetRentCents: 10_730,
        vatRatePercent: 25.5,
        vatRateFictional: false,
        monthlyVatCents: 2_736,
        monthlyGrossRentCents: 13_466,
        buyoutPercent: 15,
        buyoutNetCents: 58_350,
        totalRentNetCents: 386_280,
        totalRentGrossCents: 484_776,
        totalLeaseNetCents: 386_280,
        totalWithBuyoutNetCents: 444_630,
      },
    });
  });

  it('recomputes band and monthly rent when down payment crosses a band boundary', () => {
    // 250 000 list price with 60 000 down → 190 000 financed (moves from band B to band A)
    const result = calculateContractQuote({
      listPriceCents: 250_000,
      priceListVersion: 1,
      downPaymentCents: 60_000,
      termMonths: 24,
      isoDate: '2026-11-05',
      coefficientTable: table,
      vatRates,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.quote.financedCents).toBe(190_000);
      expect(result.quote.band.band).toBe('A');
      expect(result.quote.monthlyNetRentCents).toBe(Math.round(190_000 * 0.036637));
      expect(result.quote.totalLeaseNetCents).toBe(60_000 + result.quote.monthlyNetRentCents * 24);
    }
  });

  it('handles Scenario 7 big ticket (farm-002 €145,000, €20,000 down, 48 mo)', () => {
    const result = calculateContractQuote({
      listPriceCents: 14_500_000,
      priceListVersion: 1,
      downPaymentCents: 2_000_000,
      termMonths: 48,
      isoDate: '2026-11-05',
      coefficientTable: table,
      vatRates,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.quote.financedCents).toBe(12_500_000);
      expect(result.quote.band.band).toBe('D');
      expect(result.quote.buyoutPercent).toBe(8);
      expect(result.quote.buyoutNetCents).toBe(1_000_000);
    }
  });

  it('rejects negative or excessive down payments', () => {
    expect(
      calculateContractQuote({
        listPriceCents: 100_000,
        priceListVersion: 1,
        downPaymentCents: -100,
        termMonths: 24,
        isoDate: '2026-11-05',
        coefficientTable: table,
        vatRates,
      })
    ).toEqual({ ok: false, reason: 'invalid_down_payment', financedCents: 100_100 });

    expect(
      calculateContractQuote({
        listPriceCents: 100_000,
        priceListVersion: 1,
        downPaymentCents: 100_001,
        termMonths: 24,
        isoDate: '2026-11-05',
        coefficientTable: table,
        vatRates,
      })
    ).toEqual({ ok: false, reason: 'invalid_down_payment', financedCents: -1 });
  });

  it('returns below_minimum or above_maximum when financed amount is outside bands', () => {
    expect(
      calculateContractQuote({
        listPriceCents: 25_000,
        priceListVersion: 1,
        downPaymentCents: 0,
        termMonths: 24,
        isoDate: '2026-11-05',
        coefficientTable: table,
        vatRates,
      })
    ).toEqual({ ok: false, reason: 'below_minimum', financedCents: 25_000 });

    expect(
      calculateContractQuote({
        listPriceCents: 30_000_000,
        priceListVersion: 1,
        downPaymentCents: 0,
        termMonths: 24,
        isoDate: '2026-11-05',
        coefficientTable: table,
        vatRates,
      })
    ).toEqual({ ok: false, reason: 'above_maximum', financedCents: 30_000_000 });
  });

  it('returns unknown_term or no_vat_rate_on_date when appropriate', () => {
    expect(
      calculateContractQuote({
        listPriceCents: 100_000,
        priceListVersion: 1,
        downPaymentCents: 0,
        termMonths: 18,
        isoDate: '2026-11-05',
        coefficientTable: table,
        vatRates,
      })
    ).toEqual({ ok: false, reason: 'unknown_term', financedCents: 100_000 });

    expect(
      calculateContractQuote({
        listPriceCents: 100_000,
        priceListVersion: 1,
        downPaymentCents: 0,
        termMonths: 24,
        isoDate: '2000-01-01',
        coefficientTable: table,
        vatRates,
      })
    ).toEqual({ ok: false, reason: 'no_vat_rate_on_date', financedCents: 100_000 });
  });

  it('throws on non-integer cent inputs', () => {
    expect(() =>
      calculateContractQuote({
        listPriceCents: 100.5,
        priceListVersion: 1,
        downPaymentCents: 0,
        termMonths: 24,
        isoDate: '2026-11-05',
        coefficientTable: table,
        vatRates,
      })
    ).toThrow(RangeError);

    expect(() =>
      calculateContractQuote({
        listPriceCents: 100_000,
        priceListVersion: 1,
        downPaymentCents: 10.2,
        termMonths: 24,
        isoDate: '2026-11-05',
        coefficientTable: table,
        vatRates,
      })
    ).toThrow(RangeError);
  });
});

describe('contract-pricing property tests (Hegel: Money that adds up)', () => {
  it('property: down payment bounds always align to step and preserve min financed amount', () =>
    hegel.test((tc) => {
      const listPriceCents = tc.draw(gs.integers({ minValue: 0, maxValue: 50_000_000 }));
      const stepCents = tc.draw(gs.sampledFrom([1_000, 2_500, 5_000, 10_000]));
      const bounds = downPaymentBoundsFor(table, listPriceCents, stepCents);

      expect(bounds.minCents).toBe(0);
      expect(bounds.maxCents).toBeGreaterThanOrEqual(0);
      expect(bounds.maxCents % stepCents).toBe(0);

      const lowestFinanced = Math.min(...table.bands.map((b) => b.min_financed_cents));
      if (listPriceCents <= lowestFinanced) {
        expect(bounds.maxCents).toBe(0);
      } else {
        expect(listPriceCents - bounds.maxCents).toBeGreaterThanOrEqual(lowestFinanced);
      }

      // Clamping property: always within [0, maxCents]
      const arbitraryDownPayment = tc.draw(
        gs.integers({ minValue: -1_000_000, maxValue: 100_000_000 })
      );
      const clamped = clampDownPaymentCents(arbitraryDownPayment, bounds);
      expect(clamped).toBeGreaterThanOrEqual(bounds.minCents);
      expect(clamped).toBeLessThanOrEqual(bounds.maxCents);
    }));

  it('property: Money that adds up — quote arithmetic adds up to the exact cent across random contracts', () =>
    hegel.test(
      (tc) => {
        const terms = availableTermsFromTable(table);
        const termMonths = tc.draw(gs.sampledFrom(terms));
        const isoDate = tc.draw(
          gs.sampledFrom(['2025-06-15', '2026-11-05', '2026-12-31', '2027-01-01', '2028-03-31'])
        );

        // Draw financed amount within valid coefficient table bounds
        const lowestFinanced = Math.min(...table.bands.map((b) => b.min_financed_cents));
        const highestFinanced = Math.max(...table.bands.map((b) => b.max_financed_cents));
        const financedCents = tc.draw(
          gs.integers({ minValue: lowestFinanced, maxValue: highestFinanced })
        );
        const downPaymentCents = tc.draw(gs.integers({ minValue: 0, maxValue: 20_000_000 }));
        const listPriceCents = financedCents + downPaymentCents;

        const result = calculateContractQuote({
          listPriceCents,
          priceListVersion: 1,
          downPaymentCents,
          termMonths,
          isoDate,
          coefficientTable: table,
          vatRates,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const { quote } = result;

        // Financed amount invariant
        expect(quote.financedCents).toBe(listPriceCents - downPaymentCents);

        // Safe integer invariants for all monetary values
        const moneyFields: (keyof typeof quote)[] = [
          'listPriceCents',
          'downPaymentCents',
          'financedCents',
          'monthlyNetRentCents',
          'monthlyVatCents',
          'monthlyGrossRentCents',
          'buyoutNetCents',
          'totalRentNetCents',
          'totalRentGrossCents',
          'totalLeaseNetCents',
          'totalWithBuyoutNetCents',
        ];
        for (const field of moneyFields) {
          const val = quote[field];
          expect(typeof val).toBe('number');
          expect(Number.isSafeInteger(val)).toBe(true);
          expect(val).toBeGreaterThanOrEqual(0);
        }

        // Monthly row adds up: gross = net + vat
        expect(quote.monthlyGrossRentCents).toBe(quote.monthlyNetRentCents + quote.monthlyVatCents);

        // Total rent adds up: net total = monthly net * term
        expect(quote.totalRentNetCents).toBe(quote.monthlyNetRentCents * termMonths);

        // Total rent gross adds up: gross total = monthly gross * term
        expect(quote.totalRentGrossCents).toBe(quote.monthlyGrossRentCents * termMonths);

        // Total lease net = down payment + total rent net
        expect(quote.totalLeaseNetCents).toBe(quote.downPaymentCents + quote.totalRentNetCents);

        // Total with buyout net = total lease net + buyout net
        expect(quote.totalWithBuyoutNetCents).toBe(quote.totalLeaseNetCents + quote.buyoutNetCents);
      },
      { testCases: 250 }
    ));
});
