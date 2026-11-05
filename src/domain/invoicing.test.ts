import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import type { CoefficientTable, PriceList, VatRates } from '@/data/schemas';
import { addMonthsClamped, daysInMonth } from './calendar';
import { scheduleInvoices } from './invoicing';
import { listPriceOn } from './price-list';
import { quoteFor } from './pricing';
import { vatRateOn } from './vat';

let table: CoefficientTable;
let priceLists: PriceList[];
let vatRates: VatRates;
beforeAll(async () => {
  table = await loadCoefficientTable();
  priceLists = await loadPriceLists();
  vatRates = await loadVatRates();
});

function mustQuote(listPriceCents: number, termMonths: number, startDate: string) {
  const result = quoteFor({ listPriceCents, downPaymentCents: 0, termMonths, table });
  if (!result.ok) throw new Error(`expected a quote, got ${result.reason}`);
  const schedule = scheduleInvoices(
    {
      startDate,
      termMonths,
      monthlyNetRentCents: result.quote.monthlyNetRentCents,
      netTotalCents: result.quote.netTotalCents,
    },
    vatRates
  );
  if (!schedule.ok) throw new Error(`expected a schedule, got ${schedule.reason}`);
  return { quote: result.quote, invoices: schedule.invoices };
}

describe('scheduleInvoices', () => {
  it('reproduces scenario card 1: the first three invoices of Aino’s lease', () => {
    const { invoices } = mustQuote(389_000, 36, '2026-11-05');
    expect(invoices.slice(0, 3)).toEqual([
      expect.objectContaining({
        number: 1,
        dueDate: '2026-11-05',
        periodEnd: '2026-12-04',
        netCents: 10_730,
        vatRatePercent: 25.5,
        vatCents: 2_736,
        totalCents: 13_466,
        vatRateChanged: false,
      }),
      expect.objectContaining({ number: 2, dueDate: '2026-12-05', totalCents: 13_466 }),
      expect.objectContaining({
        number: 3,
        dueDate: '2027-01-05',
        netCents: 10_730,
        vatRatePercent: 26,
        vatCents: 2_790,
        totalCents: 13_520,
        vatRateChanged: true,
      }),
    ]);
  });

  it('reproduces scenario card 3: the VAT change hits ebike-001 between December and January', () => {
    const price = listPriceOn(priceLists, 'ebike-001', '2026-09-15');
    if (!price.ok) throw new Error('expected a price');
    const { invoices } = mustQuote(price.priceCents, 24, '2026-09-15');

    const december = invoices.find((i) => i.dueDate === '2026-12-15');
    const january = invoices.find((i) => i.dueDate === '2027-01-15');
    expect(december).toMatchObject({ vatRatePercent: 25.5, vatRateChanged: false });
    expect(january).toMatchObject({ vatRatePercent: 26, vatRateChanged: true });
    expect(december!.netCents).toBe(january!.netCents); // the net rent is locked
    expect(january!.totalCents).toBeGreaterThan(december!.totalCents);
  });

  it('reproduces scenario card 4: a 31 January start is due on 28 Feb 2026 and 29 Feb 2028', () => {
    const price = listPriceOn(priceLists, 'laptop-001', '2026-01-31');
    if (!price.ok) throw new Error('expected a price');
    const { invoices } = mustQuote(price.priceCents, 36, '2026-01-31');

    expect(invoices[1]!.dueDate).toBe('2026-02-28');
    expect(invoices[25]!.dueDate).toBe('2028-02-29');
    expect(invoices[2]!.dueDate).toBe('2026-03-31'); // the anchor day comes back
  });

  it('property: every schedule adds up exactly and matches the calendar and VAT rules', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 30_000, max: 25_000_000 }),
        fc.constantFrom(12, 24, 36, 48),
        fc.integer({ min: 2025, max: 2027 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 31 }),
        (financed, term, year, month, rawDay) => {
          const day = Math.min(rawDay, daysInMonth(year, month));
          const start = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const { quote, invoices } = mustQuote(financed, term, start);

          // Exactly one invoice per month of the term.
          expect(invoices).toHaveLength(term);
          // The nets add up to the contract total to the cent.
          const netSum = invoices.reduce((sum, i) => sum + i.netCents, 0);
          expect(netSum).toBe(quote.netTotalCents);
          // Every amount is whole positive cents and total = net + VAT.
          for (const invoice of invoices) {
            expect(Number.isInteger(invoice.netCents)).toBe(true);
            expect(invoice.netCents).toBeGreaterThan(0);
            expect(invoice.totalCents).toBe(invoice.netCents + invoice.vatCents);
            // The due date is the anchored, clamped calendar date...
            expect(invoice.dueDate).toBe(addMonthsClamped(start, invoice.number - 1));
            // ...and the VAT rate is the one valid on that date.
            const rate = vatRateOn(vatRates, invoice.dueDate);
            expect(rate).toMatchObject({ ok: true, ratePercent: invoice.vatRatePercent });
          }
          // Due dates strictly increase (ISO strings compare correctly).
          for (let i = 1; i < invoices.length; i++) {
            expect(invoices[i]!.dueDate > invoices[i - 1]!.dueDate).toBe(true);
          }
        }
      ),
      { numRuns: 300 }
    );
  });
});
