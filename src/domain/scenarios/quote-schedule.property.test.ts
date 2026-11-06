// Smart problems 5 and 6 together: the quote the customer reads and the invoices they get
// agree, for random deals priced by `priceQuote` on the real data pack. The schedule's own
// invariants (sums, real dates, the leap February) are proved in
// src/domain/invoicing/schedule.property.test.ts; this file proves the bridge between them.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addDays, buildSchedule, scheduleTotals, termEndDate } from '../invoicing';
import { pricing, pack, quoteFor } from './fixtures';

const NUM_RUNS = 1_000;
const TIMEOUT_MS = 60_000;
const DAY_MS = 86_400_000;

const dayBetween = (from: string, to: string) =>
  fc
    .integer({ min: 0, max: (Date.parse(to) - Date.parse(from)) / DAY_MS })
    .map((offset) => addDays(from, offset));

const dealArb = fc.record({
  assetId: fc.constantFrom(...pack.assets.map((a) => a.id)),
  termMonths: fc.constantFrom(12, 24, 36, 48),
  /** Share of the list price paid down, in basis points (0 … 99.99 %). */
  downShareBp: fc.integer({ min: 0, max: 9_999 }),
  isoDate: dayBetween('2026-01-01', '2028-12-31'),
});

type Deal = typeof dealArb extends fc.Arbitrary<infer T> ? T : never;

function pricedSchedule(deal: Deal) {
  const listed = quoteFor({ ...deal, downPaymentCents: 0 });
  if (!listed.ok) return null;
  const downPaymentCents = Math.floor((listed.quote.listPriceCents * deal.downShareBp) / 10_000);
  const q = quoteFor({ ...deal, downPaymentCents });
  if (!q.ok) return null;
  const s = buildSchedule({
    signedOn: deal.isoDate,
    startDate: deal.isoDate,
    termMonths: deal.termMonths,
    downPaymentCents,
    monthlyNetCents: q.quote.monthlyNetCents,
    vatRates: pricing.vatRates,
  });
  if (!s.ok) throw new Error(`no VAT rate on ${s.date}`);
  return { quote: q.quote, invoices: s.invoices };
}

describe('the quote and the invoices agree (property)', () => {
  it(
    'the invoices net exactly the down payment plus term × the quoted rent, and gross = net + VAT',
    () => {
      fc.assert(
        fc.property(dealArb, (deal) => {
          const priced = pricedSchedule(deal);
          fc.pre(priced !== null);
          const { quote, invoices } = priced!;
          const totals = scheduleTotals(invoices);
          expect(totals.netCents).toBe(
            quote.downPaymentCents + quote.monthlyNetCents * quote.termMonths
          );
          expect(totals.grossCents).toBe(totals.netCents + totals.vatCents);
        }),
        { numRuns: NUM_RUNS }
      );
    },
    TIMEOUT_MS
  );

  it(
    "when one VAT rate covers the whole term, the invoices' gross is the quote's total if returned",
    () => {
      fc.assert(
        fc.property(dealArb, (deal) => {
          const priced = pricedSchedule(deal);
          fc.pre(priced !== null);
          const { quote, invoices } = priced!;
          const lastIssue = invoices.at(-1)!.issueDate;
          fc.pre(lastIssue <= '2026-12-31' || deal.isoDate >= '2027-01-01');
          expect(scheduleTotals(invoices).grossCents).toBe(quote.totalIfReturnCents);
        }),
        { numRuns: NUM_RUNS }
      );
    },
    TIMEOUT_MS
  );

  it(
    'the last rent period ends on the term end date, a real day',
    () => {
      fc.assert(
        fc.property(dealArb, (deal) => {
          const priced = pricedSchedule(deal);
          fc.pre(priced !== null);
          expect(priced!.invoices.at(-1)!.periodEnd).toBe(
            termEndDate(deal.isoDate, deal.termMonths)
          );
        }),
        { numRuns: NUM_RUNS }
      );
    },
    TIMEOUT_MS
  );

  // Card 7 with its down payment: invoice 0 and the quote's down-payment line carry the same
  // VAT (D5/D6). A hardening finding before the pricing slice put VAT on it (4ec3b2e).
  it('card 7: invoice 0 is the quote down payment with its VAT, 2 000 000 + 510 000', () => {
    const deal = { assetId: 'farm-002', termMonths: 48, isoDate: '2026-11-05' };
    const q = quoteFor({ ...deal, downPaymentCents: 2_000_000 });
    if (!q.ok) throw new Error('card 7 does not price');
    const s = buildSchedule({
      signedOn: deal.isoDate,
      startDate: deal.isoDate,
      termMonths: 48,
      downPaymentCents: 2_000_000,
      monthlyNetCents: q.quote.monthlyNetCents,
      vatRates: pricing.vatRates,
    });
    if (!s.ok) throw new Error(s.reason);
    expect(s.invoices[0]).toMatchObject({
      kind: 'down_payment',
      netCents: 2_000_000,
      vatCents: 510_000,
      grossCents: q.quote.downPaymentGrossCents,
    });
    expect(q.quote.downPaymentGrossCents).toBe(2_510_000);
  });
});
