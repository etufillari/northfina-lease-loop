import { describe, expect, it } from 'vitest';
import {
  dueDateForMonth,
  forecastInvoices,
  invoiceAmounts,
  paymentStatus,
  quoteAmounts,
} from './lease-billing';

const rates = [
  { valid_from: '2024-09-01', valid_to: '2026-12-31', rate_percent: 25.5 },
  { valid_from: '2027-01-01', valid_to: null, rate_percent: 26 },
];

describe('lease billing', () => {
  it('uses the data-pack factor with intentional cent rounding', () => {
    expect(quoteAmounts(389000, 0.027584, 15)).toEqual({
      monthlyNetCents: 10730,
      buyoutCents: 58350,
    });
    expect(() => quoteAmounts(100, 0.1234567, 10)).toThrow();
  });
  it('clamps short months without losing the original billing day', () => {
    expect(dueDateForMonth('2026-01-31', 1)).toBe('2026-02-28');
    // Scenario card 4: February 2028 is a leap-year February.
    expect(dueDateForMonth('2026-01-31', 25)).toBe('2028-02-29');
    expect(dueDateForMonth('2026-01-31', 2)).toBe('2026-03-31');
    expect(dueDateForMonth('2026-01-31', 25)).toBe('2028-02-29');
    expect(() => dueDateForMonth('2026-02-30', 0)).toThrow();
  });
  it('rounds VAT once in cents and forecasts the rate on each due date', () => {
    expect(invoiceAmounts(10730, 2550)).toEqual({ vatCents: 2736, totalCents: 13466 });
    expect(invoiceAmounts(1, 5000)).toEqual({ vatCents: 1, totalCents: 2 });
    const result = forecastInvoices('2026-12-15', 2, 10730, rates);
    expect(result.ok && result.invoices.map((invoice) => invoice.vatBasisPoints)).toEqual([
      2550, 2600,
    ]);
    expect(forecastInvoices('2020-01-01', 1, 100, rates)).toEqual({
      ok: false,
      reason: 'missing_vat_rate',
    });
    expect(() => invoiceAmounts(0.5, 2550)).toThrow();
  });
  it('distinguishes settled, partial and late invoices', () => {
    expect(paymentStatus(100, 100, '2026-01-01', '2026-01-02')).toBe('paid');
    expect(paymentStatus(100, 50, '2026-01-01', '2026-01-02')).toBe('overdue');
    expect(paymentStatus(100, 50, '2026-01-01', '2026-01-01')).toBe('partial');
    expect(paymentStatus(100, 0, '2026-01-01', '2026-01-01')).toBe('unpaid');
  });
});
