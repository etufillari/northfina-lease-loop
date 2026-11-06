import { describe, expect, it } from 'vitest';
import { forecastPaymentChanges } from './forecast-changes';
import type { ForecastInvoice } from './lease-billing';

const invoice = (dueDate: string, changes: Partial<ForecastInvoice> = {}): ForecastInvoice => ({
  dueDate,
  netCents: 10000,
  vatBasisPoints: 2550,
  vatCents: 2550,
  totalCents: 12550,
  ...changes,
});

describe('forecastPaymentChanges', () => {
  it('compresses unchanged monthly forecasts into date ranges', () => {
    const result = forecastPaymentChanges(
      [
        invoice('2026-11-05'),
        invoice('2026-12-05'),
        invoice('2027-01-05', { vatBasisPoints: 2600, vatCents: 2600, totalCents: 12600 }),
        invoice('2027-02-05', { vatBasisPoints: 2600, vatCents: 2600, totalCents: 12600 }),
      ],
      [],
      '2026-11-05'
    );
    expect(result).toMatchObject([
      { startDate: '2026-11-05', endDate: '2026-12-05', paymentCount: 2, totalCents: 12550 },
      { startDate: '2027-01-05', endDate: '2027-02-05', paymentCount: 2, totalCents: 12600 },
    ]);
  });
  it('keeps tax or net changes even when the rounded total stays the same', () => {
    const result = forecastPaymentChanges(
      [
        invoice('2026-11-05'),
        invoice('2026-12-05', { vatBasisPoints: 2600 }),
        invoice('2027-01-05', { netCents: 9999, vatBasisPoints: 2600 }),
      ],
      [],
      '2026-11-05'
    );
    expect(result).toHaveLength(3);
  });
  it('excludes past and issued forecasts and sorts without changing the input', () => {
    const invoices = [
      invoice('2027-02-05'),
      invoice('2026-10-05'),
      invoice('2026-12-05'),
      invoice('2026-11-05'),
    ];
    const original = structuredClone(invoices);
    expect(forecastPaymentChanges(invoices, ['2026-12-05'], '2026-11-05')).toMatchObject([
      { startDate: '2026-11-05', endDate: '2027-02-05', paymentCount: 2 },
    ]);
    expect(invoices).toEqual(original);
  });
  it('preserves a later return to an earlier amount', () => {
    const result = forecastPaymentChanges(
      [invoice('2026-11-05'), invoice('2026-12-05', { totalCents: 12600 }), invoice('2027-01-05')],
      [],
      '2026-11-05'
    );
    expect(result.map((period) => period.totalCents)).toEqual([12550, 12600, 12550]);
  });
  it('returns no periods when no future unissued forecasts remain', () => {
    expect(forecastPaymentChanges([], [], '2026-11-05')).toEqual([]);
    expect(forecastPaymentChanges([invoice('2026-11-05')], ['2026-11-05'], '2026-11-05')).toEqual(
      []
    );
    expect(forecastPaymentChanges([invoice('2026-10-05')], [], '2026-11-05')).toEqual([]);
  });
});
