import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable } from '@/data/load';
import type { CoefficientTable } from '@/data/schemas';
import { checkAffordability, suggestAffordableParameters } from './affordability';

let table: CoefficientTable;
beforeAll(async () => {
  table = await loadCoefficientTable();
});

describe('checkAffordability', () => {
  it('passes a rent within 30 % of net income (Aino, scenario card 1)', () => {
    expect(
      checkAffordability({
        monthlyRentWithVatCents: 13_466,
        monthlyNetIncomeCents: 320_000,
        isConsumer: true,
      })
    ).toEqual({ status: 'passed', limitCents: 96_000 });
  });

  it('fails a rent one cent over the limit', () => {
    expect(
      checkAffordability({
        monthlyRentWithVatCents: 96_001,
        monthlyNetIncomeCents: 320_000,
        isConsumer: true,
      })
    ).toEqual({ status: 'failed', limitCents: 96_000 });
  });

  it('is not assessed when income was never asked (deals under €2,000)', () => {
    expect(
      checkAffordability({
        monthlyRentWithVatCents: 13_466,
        monthlyNetIncomeCents: null,
        isConsumer: true,
      })
    ).toEqual({ status: 'not_assessed', reason: 'income_not_asked' });
  });

  it('is not assessed for businesses: the rule text says consumers', () => {
    expect(
      checkAffordability({
        monthlyRentWithVatCents: 1_000_000,
        monthlyNetIncomeCents: 50_000,
        isConsumer: false,
      })
    ).toEqual({ status: 'not_assessed', reason: 'not_a_consumer' });
  });
});

describe('suggestAffordableParameters', () => {
  it('suggests a longer term first, keeping the down payment', () => {
    // €5,500 cargo bike at 12 months is 301.39 € net ≈ 378.24 € gross: over a 1,000 € income's
    // 300 € limit. 24 months is 195.43 € net ≈ 245.26 € gross: within it.
    const suggestion = suggestAffordableParameters({
      listPriceCents: 550_000,
      downPaymentCents: 0,
      termMonths: 12,
      monthlyNetIncomeCents: 100_000,
      vatRateBasisPoints: 2550,
      table,
    });
    expect(suggestion).toMatchObject({ termMonths: 24, downPaymentCents: 0 });
  });

  it('reaches for a larger down payment when no term alone is enough', () => {
    const suggestion = suggestAffordableParameters({
      listPriceCents: 550_000,
      downPaymentCents: 0,
      termMonths: 12,
      monthlyNetIncomeCents: 40_000,
      vatRateBasisPoints: 2550,
      table,
    });
    expect(suggestion).not.toBeNull();
    expect(suggestion!.downPaymentCents).toBeGreaterThan(0);
    expect(suggestion!.monthlyRentWithVatCents).toBeLessThanOrEqual(12_000);
  });

  it('returns null when even 48 months with the maximum down payment is too much', () => {
    expect(
      suggestAffordableParameters({
        listPriceCents: 550_000,
        downPaymentCents: 0,
        termMonths: 12,
        monthlyNetIncomeCents: 10_000,
        vatRateBasisPoints: 2550,
        table,
      })
    ).toBeNull();
  });
});
