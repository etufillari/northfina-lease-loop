import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import { contractDatesFor } from './contract';
import { addDays, addMonthsClamped } from './calendar';
import { invoiceScheduleFor } from './invoicing';
import { vatOn } from './vat';

let vatRates: VatRates;

beforeAll(async () => {
  vatRates = await loadVatRates();
});

describe('invoiceScheduleFor', () => {
  it('uses the last day of every month for a January 31 start', () => {
    const result = invoiceScheduleFor(
      {
        startsOn: '2026-01-31',
        endsOn: '2026-05-31',
        termMonths: 4,
        monthlyNetRentCents: 10_000,
      },
      vatRates
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.invoices.map((invoice) => invoice.dueOn)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('uses a full rent for a mid-month start', () => {
    const result = invoiceScheduleFor(
      {
        startsOn: '2026-01-17',
        endsOn: '2026-04-17',
        termMonths: 3,
        monthlyNetRentCents: 10_730,
      },
      vatRates
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.invoices.map((invoice) => invoice.dueOn)).toEqual([
      '2026-01-17',
      '2026-02-17',
      '2026-03-17',
    ]);
    expect(result.invoices.map((invoice) => invoice.netRentCents)).toEqual([
      10_730, 10_730, 10_730,
    ]);
  });

  it('uses the invoice date for the VAT rate', () => {
    const result = invoiceScheduleFor(
      {
        startsOn: '2026-12-15',
        endsOn: '2027-02-15',
        termMonths: 2,
        monthlyNetRentCents: 10_730,
      },
      vatRates
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.invoices).toMatchObject([
      { dueOn: '2026-12-15', vatRateBasisPoints: 2_550, vatCents: 2_736 },
      { dueOn: '2027-01-15', vatRateBasisPoints: 2_600, vatCents: 2_790 },
    ]);
  });

  it('reconciles thousands of generated schedules exactly', () => {
    const startOffset = fc.integer({ min: 0, max: 365 * 8 });
    const term = fc.integer({ min: 1, max: 60 });
    const rent = fc.integer({ min: 1, max: 2_000_000 });

    fc.assert(
      fc.property(startOffset, term, rent, (offset, termMonths, monthlyNetRentCents) => {
        const startsOn = addDays('2024-01-01', offset);
        const endsOn = contractDatesFor(startsOn, termMonths).endsOn;
        const result = invoiceScheduleFor(
          { startsOn, endsOn, termMonths, monthlyNetRentCents },
          vatRates
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.invoices).toHaveLength(termMonths);
        expect(result.invoices.reduce((sum, invoice) => sum + invoice.netRentCents, 0)).toBe(
          monthlyNetRentCents * termMonths
        );

        result.invoices.forEach((invoice, index) => {
          const expectedDueOn = addMonthsClamped(startsOn, index);
          const nextDueOn =
            index + 1 === termMonths ? endsOn : addMonthsClamped(startsOn, index + 1);
          const expectedVat = vatOn(vatRates, monthlyNetRentCents, expectedDueOn);

          expect(expectedVat.ok).toBe(true);
          if (!expectedVat.ok) return;
          expect(invoice).toMatchObject({
            sequence: index + 1,
            periodStart: expectedDueOn,
            periodEnd: addDays(nextDueOn, -1),
            dueOn: expectedDueOn,
            netRentCents: monthlyNetRentCents,
            vatCents: expectedVat.vatCents,
            totalCents: monthlyNetRentCents + expectedVat.vatCents,
          });
          expect(Number.isInteger(invoice.totalCents)).toBe(true);
        });
      }),
      { numRuns: 2_000 }
    );
  });

  it('returns a value failure when no VAT rate covers an invoice date', () => {
    const noRates: VatRates = {
      ...vatRates,
      rates: [{ rate_percent: 25.5, valid_from: '2030-01-01', valid_to: null }],
    };
    expect(
      invoiceScheduleFor(
        {
          startsOn: '2026-01-17',
          endsOn: '2026-02-17',
          termMonths: 1,
          monthlyNetRentCents: 10_000,
        },
        noRates
      )
    ).toEqual({
      ok: false,
      reason: 'no_vat_rate_on_date',
      sequence: 1,
      invoiceDate: '2026-01-17',
    });
  });
});
