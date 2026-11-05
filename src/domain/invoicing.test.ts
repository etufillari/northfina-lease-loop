import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import { addDays } from './calendar';
import { invoiceSchedule, type BilledContract } from './invoicing';

let vatRates: VatRates;
beforeAll(async () => {
  vatRates = await loadVatRates();
});

const contract = (overrides: Partial<BilledContract> = {}): BilledContract => ({
  startDate: '2026-11-05',
  termMonths: 36,
  monthlyNetRentCents: 10_730,
  billing: 'start_day_full_months',
  ...overrides,
});

function scheduleOf(c: BilledContract) {
  const result = invoiceSchedule(c, vatRates);
  if (!result.ok) throw new Error(`no schedule: ${result.reason}`);
  return result;
}

describe('invoiceSchedule, start-day billing in full months', () => {
  it('bills once per month of the term, the first on the start date, in advance', () => {
    const { invoices } = scheduleOf(contract());
    expect(invoices).toHaveLength(36);
    expect(invoices[0]).toMatchObject({
      number: 1,
      invoiceDate: '2026-11-05',
      periodStart: '2026-11-05',
      periodEnd: '2026-12-04',
    });
    expect(invoices[35]).toMatchObject({ number: 36, invoiceDate: '2029-10-05' });
  });

  it('charges VAT at the rate on each invoice date, so the gross changes on 1 Jan 2027', () => {
    // 10 730 net: 25.5 % → 2 736.15 → 2 736 (gross 13 466); 26 % → 2 789.8 → 2 790 (gross 13 520).
    const { invoices } = scheduleOf(contract());
    expect(invoices[1]).toMatchObject({
      invoiceDate: '2026-12-05',
      vatRatePercent: 25.5,
      vatCents: 2_736,
      grossCents: 13_466,
    });
    expect(invoices[2]).toMatchObject({
      invoiceDate: '2027-01-05',
      vatRatePercent: 26,
      vatCents: 2_790,
      grossCents: 13_520,
    });
  });

  it('adds the totals from the invoices themselves', () => {
    // 36 × 10 730 = 386 280 net. VAT: 2 invoices × 2 736 + 34 × 2 790 = 5 472 + 94 860 = 100 332.
    expect(scheduleOf(contract()).totals).toEqual({
      netCents: 386_280,
      vatCents: 100_332,
      grossCents: 486_612,
    });
  });

  it('bills a 31st start on the last day of short months and returns to the 31st', () => {
    const { invoices } = scheduleOf(contract({ startDate: '2026-01-31' }));
    expect(invoices.slice(0, 4).map((i) => i.invoiceDate)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
    // Period 2 runs from 28 Feb up to the day before the next invoice.
    expect(invoices[1]).toMatchObject({ periodStart: '2026-02-28', periodEnd: '2026-03-30' });
  });

  it('reports a missing VAT rate instead of inventing one', () => {
    expect(invoiceSchedule(contract({ startDate: '2012-06-01' }), vatRates)).toEqual({
      ok: false,
      reason: 'no_vat_rate',
      invoiceDate: '2012-06-01',
    });
  });
});

describe('invoiceSchedule properties (thousands of random contracts)', () => {
  // Any day from the 24 % era to well past the 2027 change, any term, any rent up to 10 000 €.
  const day = fc.integer({ min: 0, max: 365 * 6 }).map((offset) => addDays('2024-09-01', offset));
  const anyContract = fc.record({
    startDate: day,
    termMonths: fc.constantFrom(12, 24, 36, 48),
    monthlyNetRentCents: fc.integer({ min: 1, max: 1_000_000 }),
    billing: fc.constant('start_day_full_months' as const),
  });

  it('has one invoice per month, in order, covering the term without gaps or overlaps', () => {
    fc.assert(
      fc.property(anyContract, (c) => {
        const { invoices } = scheduleOf(c);
        expect(invoices).toHaveLength(c.termMonths);
        expect(invoices[0]?.periodStart).toBe(c.startDate);
        invoices.forEach((invoice, i) => {
          expect(invoice.number).toBe(i + 1);
          expect(invoice.invoiceDate).toBe(invoice.periodStart);
          expect(invoice.periodStart <= invoice.periodEnd).toBe(true);
          const next = invoices[i + 1];
          if (next) expect(addDays(invoice.periodEnd, 1)).toBe(next.periodStart);
        });
      })
    );
  });

  it('adds up exactly: net total = rent × term, and every gross = net + VAT', () => {
    fc.assert(
      fc.property(anyContract, (c) => {
        const { invoices, totals } = scheduleOf(c);
        const sum = (pick: (i: (typeof invoices)[number]) => number) =>
          invoices.reduce((total, invoice) => total + pick(invoice), 0);
        expect(totals.netCents).toBe(c.monthlyNetRentCents * c.termMonths);
        expect(sum((i) => i.netCents)).toBe(totals.netCents);
        expect(sum((i) => i.vatCents)).toBe(totals.vatCents);
        expect(totals.grossCents).toBe(totals.netCents + totals.vatCents);
        for (const invoice of invoices) {
          expect(Number.isInteger(invoice.vatCents)).toBe(true);
          expect(invoice.grossCents).toBe(invoice.netCents + invoice.vatCents);
        }
      })
    );
  });

  it('charges 25.5 % on invoices dated in 2026 or earlier (from Sep 2024) and 26 % from 2027', () => {
    fc.assert(
      fc.property(anyContract, (c) => {
        for (const invoice of scheduleOf(c).invoices) {
          const expected = invoice.invoiceDate >= '2027-01-01' ? 26 : 25.5;
          expect(invoice.vatRatePercent).toBe(expected);
        }
      })
    );
  });
});
