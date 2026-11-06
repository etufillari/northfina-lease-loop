import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadVatRates } from '@/data/load';
import type { CoefficientTable, VatRates } from '@/data/schemas';
import { addMonthsClamped, daysInMonth, previousDay } from './calendar';
import { contractEndDate } from './contract';
import {
  buildInvoiceSchedule,
  forecastCost,
  invoicesDueBy,
  sumInvoices,
  withVatChanges,
  type BillingTerms,
} from './invoicing';
import { calculateQuote } from './pricing';

let vatRates: VatRates;
let table: CoefficientTable;
beforeAll(async () => {
  [vatRates, table] = await Promise.all([loadVatRates(), loadCoefficientTable()]);
});

function schedule(terms: BillingTerms) {
  const result = buildInvoiceSchedule(terms, vatRates);
  if (!result.ok) throw new Error(result.reason);
  return result.invoices;
}

const rentOnly = (startDate: string, termMonths: number, monthlyNetRentCents: number) =>
  schedule({ startDate, termMonths, monthlyNetRentCents, downPaymentCents: 0 });

const byMonth = (invoices: ReturnType<typeof schedule>, month: string) =>
  invoices.find((invoice) => invoice.invoiceDate.startsWith(month));

describe('buildInvoiceSchedule: scenario cards', () => {
  it('card 1: the VAT change arrives on the third invoice', () => {
    const [first, second, third] = rentOnly('2026-11-05', 36, 10_730);
    expect(first).toMatchObject({ invoiceDate: '2026-11-05', vatCents: 2736, grossCents: 13_466 });
    expect(second).toMatchObject({ invoiceDate: '2026-12-05', vatCents: 2736, grossCents: 13_466 });
    expect(third).toMatchObject({
      invoiceDate: '2027-01-05',
      netCents: 10_730,
      vatRatePercent: 26,
      vatCents: 2790,
      grossCents: 13_520,
    });
  });

  it('card 1: all 36 invoices add up to the total cost', () => {
    const totals = sumInvoices(rentOnly('2026-11-05', 36, 10_730));
    expect(totals).toEqual({ netCents: 386_280, vatCents: 100_332, grossCents: 486_612 });
  });

  it('card 3: same net rent, different VAT in December and January', () => {
    const invoices = rentOnly('2026-09-15', 24, 6957);
    expect(byMonth(invoices, '2026-12')).toMatchObject({
      invoiceDate: '2026-12-15',
      netCents: 6957,
      vatRatePercent: 25.5,
      vatCents: 1774,
      grossCents: 8731,
    });
    expect(byMonth(invoices, '2027-01')).toMatchObject({
      invoiceDate: '2027-01-15',
      netCents: 6957,
      vatRatePercent: 26,
      vatCents: 1809,
      grossCents: 8766,
    });
  });

  it('card 4: month-end dates, including the leap year, without losing the 31st', () => {
    const invoices = rentOnly('2026-01-31', 36, 3432);
    expect(invoices).toHaveLength(36);
    expect(byMonth(invoices, '2026-02')?.dueDate).toBe('2026-02-28');
    expect(byMonth(invoices, '2026-03')?.dueDate).toBe('2026-03-31');
    expect(byMonth(invoices, '2028-02')?.dueDate).toBe('2028-02-29');
    expect(byMonth(invoices, '2028-03')?.dueDate).toBe('2028-03-31');
    expect(invoices.at(-1)?.dueDate).toBe('2028-12-31');
  });
});

describe('buildInvoiceSchedule: rules', () => {
  it('treats the first month of a mid-month start as a full month', () => {
    expect(rentOnly('2026-09-15', 24, 6957)[0]).toMatchObject({
      netCents: 6957,
      periodStart: '2026-09-15',
      periodEnd: '2026-10-14',
    });
  });

  it('uses the old rate on 31 December and the new one on 1 January', () => {
    expect(rentOnly('2026-12-31', 12, 10_000)[0]?.vatRatePercent).toBe(25.5);
    expect(rentOnly('2027-01-01', 12, 10_000)[0]?.vatRatePercent).toBe(26);
  });

  it('bills a down payment once, with VAT, as invoice 0 before the rents', () => {
    const invoices = schedule({
      startDate: '2026-11-05',
      termMonths: 48,
      monthlyNetRentCents: 272_038,
      downPaymentCents: 2_000_000,
    });
    expect(invoices).toHaveLength(49);
    expect(invoices[0]).toMatchObject({
      sequence: 0,
      kind: 'down_payment',
      netCents: 2_000_000,
      vatCents: 510_000,
      periodStart: null,
    });
    expect(invoices[1]).toMatchObject({ sequence: 1, kind: 'rent' });
    expect(invoices.at(-1)?.sequence).toBe(48);
  });

  it('skips the down payment invoice when there is none', () => {
    expect(rentOnly('2026-11-05', 12, 100)[0]?.sequence).toBe(1);
  });

  it('gives the same result every time, so regenerating creates no differences', () => {
    expect(rentOnly('2026-01-31', 36, 3432)).toEqual(rentOnly('2026-01-31', 36, 3432));
  });

  it('reports the date when no VAT rate covers an invoice', () => {
    const terms = { termMonths: 12, monthlyNetRentCents: 100 };
    const noRates = { ...vatRates, rates: vatRates.rates.slice(0, 2) };
    expect(
      buildInvoiceSchedule({ ...terms, startDate: '2026-11-05', downPaymentCents: 0 }, noRates)
    ).toEqual({ ok: false, reason: 'no_vat_rate_on_date', date: '2027-01-05' });
    expect(
      buildInvoiceSchedule({ ...terms, startDate: '2012-01-01', downPaymentCents: 1 }, vatRates)
    ).toEqual({ ok: false, reason: 'no_vat_rate_on_date', date: '2012-01-01' });
  });
});

describe('invoicesDueBy', () => {
  it('includes the invoice dated on the given day and none after it', () => {
    const invoices = rentOnly('2026-11-05', 12, 100);
    expect(invoicesDueBy(invoices, '2026-12-04').map((i) => i.sequence)).toEqual([1]);
    expect(invoicesDueBy(invoices, '2026-12-05').map((i) => i.sequence)).toEqual([1, 2]);
    expect(invoicesDueBy(invoices, '2026-11-04')).toEqual([]);
  });
});

describe('withVatChanges', () => {
  it('marks only the first invoice at a new rate', () => {
    const marked = withVatChanges(rentOnly('2026-11-05', 4, 10_730));
    expect(marked.map((invoice) => invoice.vatChange)).toEqual([
      null,
      null,
      { fromPercent: 25.5, toPercent: 26 },
      null,
    ]);
  });

  it('handles an empty list', () => {
    expect(withVatChanges([])).toEqual([]);
  });
});

describe('forecastCost', () => {
  it('card 1: gives the total with and without the buyout', () => {
    const result = forecastCost(
      {
        startDate: '2026-11-05',
        termMonths: 36,
        monthlyNetRentCents: 10_730,
        downPaymentCents: 0,
        buyoutNetCents: 58_350,
      },
      vatRates
    );
    expect(result).toMatchObject({
      ok: true,
      forecast: {
        totals: { grossCents: 486_612 },
        buyout: { invoiceDate: '2029-11-04', vatCents: 15_171, grossCents: 73_521 },
        totalWithBuyoutGrossCents: 560_133,
      },
    });
  });

  it('passes on a missing VAT rate for the schedule and for the buyout', () => {
    const terms = {
      startDate: '2026-11-05',
      termMonths: 12,
      monthlyNetRentCents: 100,
      downPaymentCents: 0,
      buyoutNetCents: 100,
    };
    const noRates = { ...vatRates, rates: [] };
    expect(forecastCost(terms, noRates)).toMatchObject({ ok: false, date: '2026-11-05' });

    const endsBeforeBuyout = {
      ...vatRates,
      rates: [{ rate_percent: 25.5, valid_from: '2026-01-01', valid_to: '2027-11-01' }],
    };
    expect(forecastCost(terms, endsBeforeBuyout)).toMatchObject({ ok: false, date: '2027-11-04' });
  });
});

describe('thousands of random contracts', () => {
  const realDate = fc
    .record({ year: fc.integer({ min: 2025, max: 2032 }), month: fc.integer({ min: 1, max: 12 }) })
    .chain(({ year, month }) =>
      fc.integer({ min: 1, max: daysInMonth(year, month) }).map((day) => {
        const pad = (value: number) => String(value).padStart(2, '0');
        return `${year}-${pad(month)}-${pad(day)}`;
      })
    );

  const contract = fc
    .record({
      startDate: realDate,
      termMonths: fc.constantFrom(12, 24, 36, 48),
      listPriceCents: fc.integer({ min: 30_000, max: 25_000_000 }),
      downShare: fc.double({ min: 0, max: 1, noNaN: true }),
    })
    .map(({ downShare, ...rest }) => ({
      ...rest,
      downPaymentCents: Math.floor((rest.listPriceCents - 30_000) * downShare),
    }));

  it('always add up exactly, with sound amounts and unbroken dates', () => {
    fc.assert(
      fc.property(contract, ({ startDate, termMonths, listPriceCents, downPaymentCents }) => {
        const priced = calculateQuote(table, { listPriceCents, downPaymentCents, termMonths });
        expect(priced.ok).toBe(true);
        if (!priced.ok) return;
        const { quote } = priced;

        const invoices = schedule({
          startDate,
          termMonths,
          monthlyNetRentCents: quote.monthlyNetRentCents,
          downPaymentCents,
        });
        const totals = sumInvoices(invoices);
        const rents = invoices.filter((invoice) => invoice.kind === 'rent');

        // The invoices add up to the contract total, with no cent lost or invented.
        expect(totals.netCents).toBe(quote.contractNetTotalCents);
        expect(totals.grossCents).toBe(totals.netCents + totals.vatCents);
        expect(rents).toHaveLength(termMonths);
        expect(new Set(invoices.map((invoice) => invoice.sequence)).size).toBe(invoices.length);

        rents.forEach((invoice, index) => {
          expect(invoice.netCents).toBe(quote.monthlyNetRentCents);
          expect(invoice.grossCents).toBe(invoice.netCents + invoice.vatCents);
          expect(Number.isInteger(invoice.vatCents)).toBe(true);
          // VAT is never more than half a cent from the exact amount.
          expect(
            Math.abs(invoice.vatCents * 100 - invoice.netCents * invoice.vatRatePercent)
          ).toBeLessThanOrEqual(50.000001);
          // Every date comes from the start date, so nothing drifts.
          expect(invoice.invoiceDate).toBe(addMonthsClamped(startDate, index));
          // Each period starts right after the last one ended, with no gap or overlap.
          const next = rents[index + 1];
          if (next?.periodStart) expect(previousDay(next.periodStart)).toBe(invoice.periodEnd);
        });
        expect(rents.at(-1)?.periodEnd).toBe(contractEndDate(startDate, termMonths));
      }),
      { numRuns: 2000 }
    );
  });
});
