// Property-based tests: instead of a few chosen examples, thousands of random contracts. Each
// property must hold for all of them, and fast-check shrinks any failure to the smallest case.
import fc from 'fast-check';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Invoice } from '@/data/lease-schemas';
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import { addDays, addMonths, dateParts, daysInMonth } from '../dates';
import { BASIS_POINTS_PER_WHOLE } from '../money';
import { leaseTotals } from '../pricing/pricing';
import { futureVatCorrections, invoiceSchedule, invoiceTotals } from './invoicing';

const RUNS = { numRuns: 5_000 };

// Thousands of runs take several seconds on a CI machine, past the default 5 second limit.
vi.setConfig({ testTimeout: 60_000 });

let vatRates: VatRates;
beforeAll(async () => {
  vatRates = await loadVatRates();
});

/** Any start day in ten years, including 29 Feb and every month end. */
const anyContract = fc.record({
  id: fc.constant('con-1'),
  start_on: fc.integer({ min: 0, max: 3_650 }).map((days) => addDays('2026-01-01', days)),
  term_months: fc.constantFrom(12, 24, 36, 48),
  down_payment_cents: fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 5_000_000 })),
  monthly_net_rent_cents: fc.integer({ min: 1, max: 2_000_000 }),
});

const rentsOf = (invoices: readonly Pick<Invoice, 'kind'>[]) =>
  invoices.filter((invoice) => invoice.kind === 'rent') as ReturnType<typeof invoiceSchedule>;

describe('invoiceSchedule, for any contract', () => {
  it('bills exactly the contract total, to the cent', () => {
    fc.assert(
      fc.property(anyContract, (contract) => {
        const totals = invoiceTotals(invoiceSchedule(contract, vatRates));
        const expected = leaseTotals({ ...contract, buyout_cents: 0 });

        expect(totals.total_net_cents).toBe(expected.total_if_returned_cents);
        expect(totals.total_cents).toBe(totals.total_net_cents + totals.total_vat_cents);
      }),
      RUNS
    );
  });

  it('keeps every amount in whole cents, and every total equal to net plus VAT', () => {
    fc.assert(
      fc.property(anyContract, (contract) => {
        for (const invoice of invoiceSchedule(contract, vatRates)) {
          expect(Number.isInteger(invoice.net_cents)).toBe(true);
          expect(Number.isInteger(invoice.vat_cents)).toBe(true);
          expect(invoice.total_cents).toBe(invoice.net_cents + invoice.vat_cents);
        }
      }),
      RUNS
    );
  });

  it('rounds VAT once, to the nearest cent, half up', () => {
    fc.assert(
      fc.property(anyContract, (contract) => {
        for (const invoice of invoiceSchedule(contract, vatRates)) {
          const exact = invoice.net_cents * invoice.vat_rate_basis_points;
          const error = invoice.vat_cents * BASIS_POINTS_PER_WHOLE - exact;

          expect(error * 2).toBeLessThanOrEqual(BASIS_POINTS_PER_WHOLE);
          expect(error * 2).toBeGreaterThan(-BASIS_POINTS_PER_WHOLE);
        }
      }),
      RUNS
    );
  });

  it('never changes the net rent, whatever VAT does', () => {
    fc.assert(
      fc.property(anyContract, (contract) => {
        for (const rent of rentsOf(invoiceSchedule(contract, vatRates))) {
          expect(rent.net_cents).toBe(contract.monthly_net_rent_cents);
        }
      }),
      RUNS
    );
  });

  it('gives one rent a month, on the start day or the last day of a shorter month', () => {
    fc.assert(
      fc.property(anyContract, (contract) => {
        const rents = rentsOf(invoiceSchedule(contract, vatRates));
        const startDay = dateParts(contract.start_on).day;

        expect(rents).toHaveLength(contract.term_months);
        for (const rent of rents) {
          const { year, month, day } = dateParts(rent.due_date);
          expect(day).toBe(Math.min(startDay, daysInMonth(year, month)));
        }
      }),
      RUNS
    );
  });

  it('covers every day of the lease, with no gap and no overlap', () => {
    fc.assert(
      fc.property(anyContract, (contract) => {
        const rents = rentsOf(invoiceSchedule(contract, vatRates));

        expect(rents[0]?.period_start).toBe(contract.start_on);
        rents.slice(1).forEach((rent, index) => {
          expect(rent.period_start).toBe(addDays(rents[index]?.period_end ?? '', 1));
        });
        expect(rents.at(-1)?.period_end).toBe(
          addDays(addMonths(contract.start_on, contract.term_months), -1)
        );
      }),
      RUNS
    );
  });

  it('uses the VAT rate of each invoice date', () => {
    fc.assert(
      fc.property(anyContract, (contract) => {
        for (const invoice of invoiceSchedule(contract, vatRates)) {
          const expected = invoice.invoice_date >= '2027-01-01' ? 2_600 : 2_550;
          expect(invoice.vat_rate_basis_points).toBe(expected);
        }
      }),
      RUNS
    );
  });
});

describe('futureVatCorrections, for any contract', () => {
  const stored = (contract: Parameters<typeof invoiceSchedule>[0]) =>
    invoiceSchedule(contract, vatRates).map((invoice, index) => ({
      ...invoice,
      id: `inv-${index}`,
    }));

  it('finds nothing to do while the rates are unchanged', () => {
    fc.assert(
      fc.property(anyContract, (contract) => {
        expect(futureVatCorrections(stored(contract), vatRates, contract.start_on)).toEqual([]);
      }),
      RUNS
    );
  });

  it('only ever moves invoices dated after today, and keeps totals adding up', () => {
    const newRate: VatRates = {
      ...vatRates,
      rates: [{ rate_percent: 30, valid_from: '2000-01-01', valid_to: null }],
    };

    fc.assert(
      fc.property(anyContract, fc.integer({ min: 0, max: 400 }), (contract, daysLater) => {
        const invoices = stored(contract);
        const today = addDays(contract.start_on, daysLater);

        for (const correction of futureVatCorrections(invoices, newRate, today)) {
          const invoice = invoices.find(({ id }) => id === correction.id);
          expect((invoice?.invoice_date ?? '') > today).toBe(true);
          expect(correction.total_cents).toBe((invoice?.net_cents ?? 0) + correction.vat_cents);
        }
      }),
      RUNS
    );
  });
});
