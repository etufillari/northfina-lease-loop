import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable } from '@/data/load';
import type { CoefficientTable } from '@/data/schemas';
import {
  checkAffordabilityOverTerm,
  checkAffordability,
  suggestAffordableParameters,
} from './affordability';

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

  it('leaves room for what the customer already pays on other leases', () => {
    // 24 months fits a €300 limit alone (€245.26 gross), not next to €100 already paid.
    const suggestion = suggestAffordableParameters({
      listPriceCents: 550_000,
      downPaymentCents: 0,
      termMonths: 12,
      monthlyNetIncomeCents: 100_000,
      vatRateBasisPoints: 2550,
      table,
      existingMonthlyCents: 10_000,
    });
    expect(suggestion).not.toMatchObject({ termMonths: 24, downPaymentCents: 0 });
    expect(suggestion === null || suggestion.monthlyRentWithVatCents + 10_000 <= 30_000).toBe(true);
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

describe('checkAffordabilityOverTerm: every month, with the leases they already have', () => {
  const monthly = (start: string, months: number, cents: number) =>
    Array.from({ length: months }, (_, i) => {
      const [y, m] = start.split('-').map(Number);
      const index = y! * 12 + (m! - 1) + i;
      const month = String((index % 12) + 1).padStart(2, '0');
      return { dueDate: `${Math.floor(index / 12)}-${month}-05`, totalCents: cents };
    });
  const consumer = (income: number | null) => ({ monthlyNetIncomeCents: income, isConsumer: true });

  it('passes when every month fits, and names the heaviest one', () => {
    const result = checkAffordabilityOverTerm({
      ...consumer(320_000),
      newPayments: [
        { dueDate: '2026-12-05', totalCents: 13_466 },
        { dueDate: '2027-01-05', totalCents: 13_520 },
      ],
      existingPayments: [],
    });
    expect(result).toEqual({
      status: 'passed',
      limitCents: 96_000,
      peakMonth: '2027-01',
      peakCents: 13_520,
    });
  });

  it('a later month can fail on its own: the 1 Jan 2027 VAT rise tips card 1 over €135', () => {
    // 30 % of €450 is €135.00: December's €134.66 fits, January's €135.20 does not.
    const result = checkAffordabilityOverTerm({
      ...consumer(45_000),
      newPayments: [
        { dueDate: '2026-12-05', totalCents: 13_466 },
        { dueDate: '2027-01-05', totalCents: 13_520 },
      ],
      existingPayments: [],
    });
    expect(result).toEqual({
      status: 'failed',
      limitCents: 13_500,
      month: '2027-01',
      totalCents: 13_520,
      newCents: 13_520,
      existingCents: 0,
    });
  });

  it('adds what they already pay in the same month, and fails at the first month over', () => {
    const result = checkAffordabilityOverTerm({
      ...consumer(100_000), // limit €300
      newPayments: monthly('2026-11', 12, 20_000),
      // An existing lease of €150 a month that ends after January 2027.
      existingPayments: monthly('2026-08', 6, 15_000),
    });
    expect(result).toEqual({
      status: 'failed',
      limitCents: 30_000,
      month: '2026-11',
      totalCents: 35_000,
      newCents: 20_000,
      existingCents: 15_000,
    });
  });

  it('counts by calendar month, whatever the due day; months the new lease does not bill do not count', () => {
    const result = checkAffordabilityOverTerm({
      ...consumer(100_000), // limit €300
      newPayments: [{ dueDate: '2027-02-28', totalCents: 10_000 }],
      existingPayments: [
        { dueDate: '2027-02-01', totalCents: 10_000 },
        { dueDate: '2027-02-15', totalCents: 10_000 },
        { dueDate: '2027-03-01', totalCents: 90_000 }, // after the new lease's months
      ],
    });
    expect(result).toMatchObject({ status: 'passed', peakMonth: '2027-02', peakCents: 30_000 });
    const over = checkAffordabilityOverTerm({
      ...consumer(100_000),
      newPayments: [{ dueDate: '2027-02-28', totalCents: 10_001 }],
      existingPayments: [
        { dueDate: '2027-02-01', totalCents: 10_000 },
        { dueDate: '2027-02-15', totalCents: 10_000 },
      ],
    });
    expect(over).toMatchObject({ status: 'failed', month: '2027-02', existingCents: 20_000 });
  });

  it('is not assessed for companies, or when income was not asked (deals under €2,000)', () => {
    const payments = { newPayments: monthly('2026-11', 3, 99_999_999), existingPayments: [] };
    expect(
      checkAffordabilityOverTerm({ ...payments, monthlyNetIncomeCents: 100_000, isConsumer: false })
    ).toEqual({ status: 'not_assessed', reason: 'not_a_consumer' });
    expect(checkAffordabilityOverTerm({ ...payments, ...consumer(null) })).toEqual({
      status: 'not_assessed',
      reason: 'income_not_asked',
    });
  });
});
