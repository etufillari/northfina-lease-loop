// Smart Problem #5, "money that adds up", as one suite: integer cents everywhere, the
// calendar traps, full months only, and invoices that sum exactly to the contract total.
//
// The property tests check the real code (quoteFor + scheduleInvoices) against INDEPENDENT
// oracles: money is recomputed with BigInt (no float can sneak in) and dates with a tiny
// calendar written here, not the one in calendar.ts. A shared bug cannot hide in both.
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadVatRates } from '@/data/load';
import type { CoefficientTable, VatRates } from '@/data/schemas';
import { scheduleInvoices, type InvoiceLine } from './invoicing';
import { maxDownPaymentCents, quoteFor, type Quote } from './pricing';
import { vatCents } from './vat';

let table: CoefficientTable;
let vatRates: VatRates;
beforeAll(async () => {
  table = await loadCoefficientTable();
  vatRates = await loadVatRates();
});

/** Random contracts per property: thousands in total across the suite. */
const RUNS = 2_000;
/** Coverage instrumentation slows fast-check down; never let the 5 s default flake. */
const TIMEOUT = 120_000;

// ---- independent oracles ------------------------------------------------------------

/** Half-up division of non-negative BigInts: the one rounding rule, done exactly. */
const halfUp = (numerator: bigint, denominator: bigint) =>
  (2n * numerator + denominator) / (2n * denominator);

const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const monthLength = (y: number, m: number) =>
  [31, leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;
const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const parse = (s: string) => s.split('-').map(Number) as [number, number, number];

/** Invoice k (0-based) is due k months after the start, on the start day or the month's last. */
function dueOracle(start: string, k: number): string {
  const [y, m, d] = parse(start);
  const index = y * 12 + (m - 1) + k;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return iso(year, month, Math.min(d, monthLength(year, month)));
}

function dayBefore(date: string): string {
  const [y, m, d] = parse(date);
  if (d > 1) return iso(y, m, d - 1);
  const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
  return iso(py, pm, monthLength(py, pm));
}

/** The VAT rate in basis points on a date, read straight from the data file. */
function rateBpOn(date: string): number {
  const rate = vatRates.rates.find(
    (r) => r.valid_from <= date && (r.valid_to === null || date <= r.valid_to)
  );
  if (!rate) throw new Error(`no VAT rate on ${date}`);
  return Math.round(rate.rate_percent * 100);
}

// ---- generators ---------------------------------------------------------------------

/** Start dates over 2024–2028: all three VAT rates, two leap years, every month end. */
const startDate = fc
  .record({
    year: fc.integer({ min: 2024, max: 2028 }),
    // Lean on the trap months: January (→ short February) and February itself.
    month: fc.oneof(fc.integer({ min: 1, max: 12 }), fc.constantFrom(1, 2)),
    // Lean on the trap days: the 28th–31st clamp in short months.
    day: fc.oneof(fc.integer({ min: 1, max: 31 }), fc.constantFrom(28, 29, 30, 31)),
  })
  .map(({ year, month, day }) => iso(year, month, Math.min(day, monthLength(year, month))));

/** Any list price the table can finance, any allowed down payment, any priced term. */
const deal = () =>
  fc.integer({ min: 30_000, max: 25_000_000 }).chain((listPriceCents) =>
    fc.record({
      listPriceCents: fc.constant(listPriceCents),
      downPaymentCents: fc.integer({ min: 0, max: maxDownPaymentCents(listPriceCents, table) }),
      termMonths: fc.constantFrom(
        ...Object.keys(table.end_of_term_buyout_percent_of_financed).map(Number)
      ),
      startDate,
    })
  );

function contractFor(input: {
  listPriceCents: number;
  downPaymentCents: number;
  termMonths: number;
  startDate: string;
}): { quote: Quote; invoices: InvoiceLine[] } {
  const quoted = quoteFor({ ...input, table });
  if (!quoted.ok) throw new Error(`expected a quote, got ${quoted.reason}`);
  const schedule = scheduleInvoices({ ...quoted.quote, startDate: input.startDate }, vatRates);
  if (!schedule.ok) throw new Error(`expected a schedule, got ${schedule.reason}`);
  return { quote: quoted.quote, invoices: schedule.invoices };
}

const isCents = (value: number) => Number.isSafeInteger(value) && value >= 0;

// ---- properties ---------------------------------------------------------------------

describe('money that adds up: thousands of random contracts', () => {
  it(
    'every amount is whole cents, rounded half-up once, exactly as BigInt maths says',
    { timeout: TIMEOUT },
    () => {
      fc.assert(
        fc.property(deal(), (input) => {
          const { quote, invoices } = contractFor(input);
          const financed = BigInt(input.listPriceCents - input.downPaymentCents);
          const ppm = BigInt(quote.factorPpm);
          const term = BigInt(input.termMonths);

          expect(quote.financedCents).toBe(Number(financed));
          expect(quote.monthlyNetRentCents).toBe(Number(halfUp(financed * ppm, 1_000_000n)));
          expect(quote.netTotalCents).toBe(Number(halfUp(financed * ppm * term, 1_000_000n)));
          for (const amount of [
            quote.monthlyNetRentCents,
            quote.netTotalCents,
            quote.lastMonthNetRentCents,
            quote.buyoutNetCents,
          ]) {
            expect(isCents(amount)).toBe(true);
          }
          for (const invoice of invoices) {
            const bp = BigInt(rateBpOn(invoice.dueDate));
            expect(isCents(invoice.netCents)).toBe(true);
            expect(invoice.netCents).toBeGreaterThan(0);
            // VAT on each invoice, half-up, at the rate valid on its due date.
            expect(invoice.vatCents).toBe(Number(halfUp(BigInt(invoice.netCents) * bp, 10_000n)));
            expect(invoice.totalCents).toBe(invoice.netCents + invoice.vatCents);
          }
        }),
        { numRuns: RUNS }
      );
    }
  );

  it(
    'the invoices add up exactly to the contract total, and the last one absorbs the cents',
    { timeout: TIMEOUT },
    () => {
      fc.assert(
        fc.property(deal(), (input) => {
          const { quote, invoices } = contractFor(input);
          const sum = (pick: (i: InvoiceLine) => number) =>
            invoices.reduce((total, invoice) => total + pick(invoice), 0);

          expect(invoices).toHaveLength(input.termMonths);
          // Net: to the cent, whatever the rounding of each month.
          expect(sum((i) => i.netCents)).toBe(quote.netTotalCents);
          // Gross: the customer pays exactly the sum of what each invoice says.
          expect(sum((i) => i.totalCents)).toBe(sum((i) => i.netCents) + sum((i) => i.vatCents));
          // Every month but the last is the same rounded rent...
          for (const invoice of invoices.slice(0, -1)) {
            expect(invoice.netCents).toBe(quote.monthlyNetRentCents);
          }
          // ...and the last carries the leftover: never more than ⌈term / 2⌉ cents off,
          // because each of the two roundings is at most half a cent per month.
          const last = invoices.at(-1)!;
          expect(last.netCents).toBe(quote.lastMonthNetRentCents);
          expect(Math.abs(last.netCents - quote.monthlyNetRentCents)).toBeLessThanOrEqual(
            Math.ceil(input.termMonths / 2)
          );
        }),
        { numRuns: RUNS }
      );
    }
  );

  it(
    'due dates are anchored and clamped, and every period is one full, gap-free month',
    { timeout: TIMEOUT },
    () => {
      fc.assert(
        fc.property(deal(), (input) => {
          const { invoices } = contractFor(input);
          const start = input.startDate;
          const [, , startDay] = parse(start);

          invoices.forEach((invoice, k) => {
            // Invoice k+1 is due k months after the start; the 31st becomes the month's last
            // day, and the anchor never drifts (31 Jan → 28 Feb → 31 Mar).
            expect(invoice.dueDate).toBe(dueOracle(start, k));
            const [y, m, d] = parse(invoice.dueDate);
            expect(d).toBe(Math.min(startDay, monthLength(y, m)));
            // Billing in advance: a period starts on its due date...
            expect(invoice.periodStart).toBe(invoice.dueDate);
            // ...and ends the day before the next one starts, so no day is billed twice
            // or skipped, and the first month is a full month even from mid-month.
            expect(invoice.periodEnd).toBe(dayBefore(dueOracle(start, k + 1)));
          });
          expect(invoices[0]!.periodStart).toBe(start);
          expect(invoices.at(-1)!.periodEnd).toBe(dayBefore(dueOracle(start, input.termMonths)));
        }),
        { numRuns: RUNS }
      );
    }
  );
});

// ---- the named traps ----------------------------------------------------------------

describe('money that adds up: the traps by name', () => {
  const card1 = () =>
    contractFor({
      listPriceCents: 389_000,
      downPaymentCents: 0,
      termMonths: 36,
      startDate: '2026-11-05',
    });

  it('a lease from 31 January is due on 28 February, then back on 31 March', () => {
    const { invoices } = contractFor({
      listPriceCents: 249_900,
      downPaymentCents: 0,
      termMonths: 36,
      startDate: '2026-01-31',
    });
    expect(invoices.slice(0, 3).map((i) => i.dueDate)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ]);
  });

  it('a leap-year February: the same lease is due on 29 February 2028', () => {
    const { invoices } = contractFor({
      listPriceCents: 249_900,
      downPaymentCents: 0,
      termMonths: 36,
      startDate: '2026-01-31',
    });
    const february2028 = invoices.find((i) => i.dueDate.startsWith('2028-02'));
    expect(february2028?.dueDate).toBe('2028-02-29');
  });

  it('a lease that starts on 29 February keeps the 29th, and uses the 28th in 2029', () => {
    const { invoices } = contractFor({
      listPriceCents: 249_900,
      downPaymentCents: 0,
      termMonths: 24,
      startDate: '2028-02-29',
    });
    expect(invoices[1]!.dueDate).toBe('2028-03-29');
    expect(invoices[12]!.dueDate).toBe('2029-02-28');
    expect(invoices[13]!.dueDate).toBe('2029-03-29');
  });

  it('a mid-month start bills a full first month: no pro-rata, period 15 Sep – 14 Oct', () => {
    const { quote, invoices } = contractFor({
      listPriceCents: 189_900,
      downPaymentCents: 0,
      termMonths: 24,
      startDate: '2026-09-15',
    });
    expect(invoices[0]).toMatchObject({
      dueDate: '2026-09-15',
      periodStart: '2026-09-15',
      periodEnd: '2026-10-14',
      netCents: quote.monthlyNetRentCents,
    });
  });

  it('scenario card 1 to the cent: 10 730.18 → 10 730, and the last invoice takes +6 cents', () => {
    const { quote, invoices } = card1();
    // 389 000 × 0.027584 = 10 730.176 → 10 730 (half-up, once).
    expect(quote.monthlyNetRentCents).toBe(10_730);
    // 389 000 × 0.027584 × 36 = 386 286.336 → 386 286 for the whole contract.
    expect(quote.netTotalCents).toBe(386_286);
    expect(invoices.slice(0, 35).every((i) => i.netCents === 10_730)).toBe(true);
    expect(invoices[35]!.netCents).toBe(10_736);
    expect(invoices.reduce((s, i) => s + i.netCents, 0)).toBe(386_286);
  });

  it('VAT follows the due date across 1 Jan 2027, and the totals still add up', () => {
    const { invoices } = card1();
    expect(invoices.slice(0, 3).map((i) => [i.vatRatePercent, i.totalCents])).toEqual([
      [25.5, 13_466],
      [25.5, 13_466],
      [26, 13_520],
    ]);
    expect(invoices.reduce((s, i) => s + i.totalCents, 0)).toBe(486_619);
  });

  it('half a cent of VAT rounds up, less than half rounds down', () => {
    expect(vatCents(2, 2_500)).toBe(1); // 0.5 → 1
    expect(vatCents(6, 2_500)).toBe(2); // 1.5 → 2
    expect(vatCents(1, 2_550)).toBe(0); // 0.255 → 0
    expect(vatCents(10_730, 2_550)).toBe(2_736); // 2 736.15 → 2 736 (card 1)
  });

  it('the biggest contract stays exact: no float overflow at €250,000 over 48 months', () => {
    const { quote, invoices } = contractFor({
      listPriceCents: 25_000_000,
      downPaymentCents: 0,
      termMonths: 48,
      startDate: '2026-12-31',
    });
    const exact = halfUp(25_000_000n * BigInt(quote.factorPpm) * 48n, 1_000_000n);
    expect(quote.netTotalCents).toBe(Number(exact));
    expect(invoices.reduce((s, i) => s + i.netCents, 0)).toBe(Number(exact));
  });

  it('refuses fractional cents outright: a float in is a bug, not a price', () => {
    expect(() =>
      quoteFor({ listPriceCents: 389_000.5, downPaymentCents: 0, termMonths: 36, table })
    ).toThrow(RangeError);
    expect(() =>
      quoteFor({ listPriceCents: 389_000, downPaymentCents: 0.01, termMonths: 36, table })
    ).toThrow(RangeError);
  });
});
