import { beforeAll, describe, expect, it } from 'vitest';
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import { BUYOUT_PAYMENT_DAYS, buyoutInvoicePreview } from './buyout';

let vatRates: VatRates;
beforeAll(async () => {
  vatRates = await loadVatRates();
});

describe('buyoutInvoicePreview', () => {
  it('opting in mid-term: invoiced on the last day of the term, due 30 days later', () => {
    const result = buyoutInvoicePreview(
      { buyoutNetCents: 15_192, termEndsOn: '2029-12-31', asOf: '2026-11-06' },
      vatRates
    );
    expect(result).toEqual({
      ok: true,
      preview: {
        netCents: 15_192,
        vatRatePercent: 26,
        // 151.92 × 26 % = 39.4992 → 39.50, rounded half-up once.
        vatCents: 3_950,
        totalCents: 19_142,
        invoiceDate: '2029-12-31',
        dueDate: '2030-01-30',
      },
    });
    expect(BUYOUT_PAYMENT_DAYS).toBe(30);
  });

  it('buying after the term has ended: invoiced on the day of the purchase', () => {
    const result = buyoutInvoicePreview(
      { buyoutNetCents: 58_350, termEndsOn: '2029-11-04', asOf: '2029-11-20' },
      vatRates
    );
    expect(result.ok && result.preview.invoiceDate).toBe('2029-11-20');
    expect(result.ok && result.preview.dueDate).toBe('2029-12-20');
  });

  it('uses the VAT rate of the invoice date, not of today (the 2027 change)', () => {
    const before = buyoutInvoicePreview(
      { buyoutNetCents: 10_000, termEndsOn: '2026-12-31', asOf: '2026-11-06' },
      vatRates
    );
    const after = buyoutInvoicePreview(
      { buyoutNetCents: 10_000, termEndsOn: '2027-01-01', asOf: '2026-11-06' },
      vatRates
    );
    expect(before.ok && before.preview).toMatchObject({ vatRatePercent: 25.5, vatCents: 2_550 });
    expect(after.ok && after.preview).toMatchObject({ vatRatePercent: 26, vatCents: 2_600 });
  });

  it('net plus VAT is always exactly the total', () => {
    for (const net of [1, 99, 30_001, 58_350, 1_234_567]) {
      const result = buyoutInvoicePreview(
        { buyoutNetCents: net, termEndsOn: '2028-02-29', asOf: '2026-11-06' },
        vatRates
      );
      if (!result.ok) throw new Error(result.reason);
      expect(result.preview.netCents + result.preview.vatCents).toBe(result.preview.totalCents);
    }
  });

  it('says so when no VAT rate is known for the invoice date', () => {
    expect(
      buyoutInvoicePreview(
        { buyoutNetCents: 10_000, termEndsOn: '2010-06-30', asOf: '2010-01-01' },
        vatRates
      )
    ).toEqual({ ok: false, reason: 'no_vat_rate_on_date' });
  });

  it('refuses money that is not whole cents', () => {
    expect(() =>
      buyoutInvoicePreview(
        { buyoutNetCents: 151.92, termEndsOn: '2029-12-31', asOf: '2026-11-06' },
        vatRates
      )
    ).toThrow(RangeError);
  });
});
