// Smart Problem 5: "Money that adds up", checked over thousands of random contracts rather than a
// few examples. Each property below must hold for every contract fast-check generates: any price
// the coefficient table finances, any term it offers, any start date (including the 29th–31st and
// leap years) and any VAT period. A failure prints the counterexample and the seed to replay it.
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadVatRates } from '@/data/load';
import type { CoefficientTable, VatRate } from '@/data/schemas';
import { checkoutQuote } from './checkout-quote';
import { invoicesDue } from './invoice-issuance';
import { dueDateForMonth, forecastInvoices, invoiceAmounts } from './lease-billing';
import { settlementQuote } from './lease-settlement';

let table: CoefficientTable;
let rates: VatRate[];
let terms: number[];
beforeAll(async () => {
  [table, { rates }] = await Promise.all([loadCoefficientTable(), loadVatRates()]);
  terms = Object.keys(table.end_of_term_buyout_percent_of_financed).map(Number);
});

const runs = { numRuns: 1000 };
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/** Any calendar date from 2025 to 2032, weighted towards month ends (the 28th–31st). */
const startDate = fc
  .record({
    year: fc.integer({ min: 2025, max: 2032 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.oneof(fc.integer({ min: 1, max: 31 }), fc.integer({ min: 28, max: 31 })),
  })
  .map(({ year, month, day }) => iso(year, month, Math.min(day, lastDay(year, month))));

/** A contract the coefficient table finances: price, down payment and term. */
const contract = fc
  .record({
    financed: fc.integer({ min: 30_000, max: 25_000_000 }),
    down: fc.integer({ min: 0, max: 5_000_000 }),
    termIndex: fc.nat(),
    startDate,
  })
  .map(({ financed, down, termIndex, startDate }) => ({
    priceCents: financed + down,
    downPaymentCents: down,
    termMonths: () => terms[termIndex % terms.length]!,
    startDate,
  }));

describe('money properties (Smart Problem 5)', () => {
  it('every invoice is whole non-negative cents, and the schedule adds up exactly', () => {
    fc.assert(
      fc.property(contract, (c) => {
        const termMonths = c.termMonths();
        const quote = checkoutQuote(
          c.priceCents,
          c.downPaymentCents,
          termMonths,
          c.startDate,
          table,
          rates
        );
        expect(quote).not.toBeNull();
        const schedule = forecastInvoices(c.startDate, termMonths, quote!.monthlyNetCents, rates);
        if (!schedule.ok) throw new Error(schedule.reason);
        expect(schedule.invoices).toHaveLength(termMonths);
        for (const invoice of schedule.invoices) {
          for (const cents of [invoice.netCents, invoice.vatCents, invoice.totalCents])
            expect(Number.isSafeInteger(cents) && cents >= 0).toBe(true);
          expect(invoice.totalCents).toBe(invoice.netCents + invoice.vatCents);
          // VAT is rounded once, half up: within half a cent of the exact amount.
          const exact = invoice.netCents * invoice.vatBasisPoints;
          expect(Math.abs(invoice.vatCents * 10_000 - exact)).toBeLessThanOrEqual(5_000);
        }
        const sum = (key: 'netCents' | 'totalCents') =>
          schedule.invoices.reduce((total, invoice) => total + invoice[key], 0);
        // The net rent never drifts: the invoices sum exactly to rent × term.
        expect(sum('netCents')).toBe(quote!.monthlyNetCents * termMonths);
        // The quoted total is exactly the sum of the invoices it promises.
        expect(sum('totalCents')).toBe(quote!.totalCents);
      }),
      runs
    );
  });

  it('due dates go up one calendar month at a time and clamp to the month end', () => {
    fc.assert(
      fc.property(startDate, fc.integer({ min: 1, max: 60 }), (start, termMonths) => {
        const startDay = Number(start.slice(8, 10));
        let previous = '';
        for (let month = 0; month < termMonths; month++) {
          const due = dueDateForMonth(start, month);
          const [year, monthOfYear, day] = due.split('-').map(Number) as [number, number, number];
          expect(due > previous).toBe(true);
          // Exactly `month` calendar months after the start: none skipped, none repeated.
          const startMonths = Number(start.slice(0, 4)) * 12 + Number(start.slice(5, 7));
          expect(year * 12 + monthOfYear - startMonths).toBe(month);
          // The start day, or the last day of a shorter month (28 Feb, 29 Feb in leap years).
          expect(day).toBe(Math.min(startDay, lastDay(year, monthOfYear)));
          previous = due;
        }
      }),
      runs
    );
  });

  it('quotes depend only on their inputs: the same contract always gives the same numbers', () => {
    fc.assert(
      fc.property(contract, (c) => {
        const termMonths = c.termMonths();
        const args = [c.priceCents, c.downPaymentCents, termMonths, c.startDate] as const;
        expect(checkoutQuote(...args, table, rates)).toEqual(checkoutQuote(...args, table, rates));
      }),
      { numRuns: 300 }
    );
  });

  it('billing month by month issues exactly the invoices of one catch-up run', () => {
    fc.assert(
      fc.property(
        startDate,
        fc.constantFrom(12, 24, 36),
        fc.integer({ min: 1, max: 500_000 }),
        fc.array(fc.integer({ min: 0, max: 1500 }), { minLength: 1, maxLength: 8 }),
        (start, termMonths, monthlyNetCents, gaps) => {
          const lease = { status: 'active', startDate: start, termMonths, monthlyNetCents };
          const day = (offset: number) => {
            const date = new Date(`${start}T00:00:00Z`);
            date.setUTCDate(date.getUTCDate() + offset);
            return date.toISOString().slice(0, 10);
          };
          // Visits on increasing days, each issuing only what's new since the last one.
          const issued: string[] = [];
          let offset = 0;
          for (const gap of gaps) {
            offset += gap;
            const due = invoicesDue({ ...lease, isDemo: false }, day(offset), rates, issued);
            if (!due.ok) throw new Error(due.reason);
            issued.push(...due.invoices.map((invoice) => invoice.dueDate));
          }
          const once = invoicesDue({ ...lease, isDemo: false }, day(offset), rates, []);
          if (!once.ok) throw new Error(once.reason);
          expect(issued).toEqual(once.invoices.map((invoice) => invoice.dueDate));
          expect(new Set(issued).size).toBe(issued.length);
          expect(issued.length).toBeLessThanOrEqual(termMonths);
        }
      ),
      runs
    );
  });

  it('paying off early never costs more than paying monthly, and equals the buyout at the end', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 500_000 }),
        fc.integer({ min: 0, max: 2_000_000 }),
        fc.integer({ min: 0, max: 60 }),
        fc.integer({ min: 0, max: 2_000 }),
        (monthlyNetCents, buyoutCents, remainingMonths, annualRateBasisPoints) => {
          const quote = settlementQuote({
            monthlyNetCents,
            buyoutCents,
            remainingMonths,
            annualRateBasisPoints,
            recoveryCents: 0,
            vatBasisPoints: 2550,
            outstandingCents: 0,
          });
          expect(Number.isSafeInteger(quote.buyoutNetCents)).toBe(true);
          expect(quote.buyoutNetCents).toBeLessThanOrEqual(
            monthlyNetCents * remainingMonths + buyoutCents
          );
          if (remainingMonths === 0) expect(quote.buyoutNetCents).toBe(buyoutCents);
          expect(quote.buyoutTotalCents).toBe(
            invoiceAmounts(quote.buyoutNetCents, 2550).totalCents
          );
        }
      ),
      runs
    );
  });
});
