// Properties every early exit must keep, over random contracts priced from the real table
// (D-017 style). Each walks every exit month of the contract.
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadResidualCurves, loadVatRates } from '@/data/load';
import type { CoefficientTable, ResidualCurves, VatRates } from '@/data/schemas';
import { addDays } from './calendar';
import { earlyExitQuote, type EarlyExitQuote, type ExitContext } from './early-exit';
import { buyoutInvoice } from './end-of-term';
import { roundHalfUp } from './money';

let vatRates: VatRates;
let curves: ResidualCurves;
let table: CoefficientTable;
beforeAll(async () => {
  [vatRates, curves, table] = await Promise.all([
    loadVatRates(),
    loadResidualCurves(),
    loadCoefficientTable(),
  ]);
});

/**
 * Three amounts are rounded once each (D-005), so a difference of two months can be off by at
 * most 3 × ½ cent either way. The true margin is at least the interest on what is still owed.
 */
const ROUNDING_SLACK_CENTS = 3;

const anyLease = fc.record({
  bandIndex: fc.integer({ min: 0, max: 3 }),
  position: fc.double({ min: 0, max: 1, noNaN: true }),
  term: fc.constantFrom('12', '24', '36', '48'),
  start: fc.integer({ min: 0, max: 365 * 4 }).map((offset) => addDays('2026-01-01', offset)),
  category: fc.constantFrom('e_bike', 'laptop', 'farm_machine'),
  condition: fc.constantFrom('new', 'like_new', 'good', 'fair', 'poor'),
  usageValue: fc.integer({ min: 0, max: 30_000 }),
  ageAtStartMonths: fc.integer({ min: 0, max: 120 }),
});

type Lease = typeof anyLease extends fc.Arbitrary<infer T> ? T : never;

function everyExit(lease: Lease) {
  const band = table.bands[lease.bandIndex]!;
  const financed = Math.round(
    band.min_financed_cents + lease.position * (band.max_financed_cents - band.min_financed_cents)
  );
  const termMonths = Number(lease.term);
  const contract = {
    customerId: 'cust-any',
    startDate: lease.start,
    termMonths,
    monthlyNetRentCents: roundHalfUp(financed * band.monthly_factor_by_term[lease.term]!),
    buyoutCents: roundHalfUp(
      (financed * table.end_of_term_buyout_percent_of_financed[lease.term]!) / 100
    ),
    listPriceCents: financed,
    billing: 'start_day_full_months' as const,
  };
  const context: ExitContext = {
    vatRates,
    curves,
    annualInterestPercent: band.annual_interest_percent,
    item: {
      category: lease.category,
      ageAtStartMonths: lease.ageAtStartMonths,
      condition: lease.condition,
      usageValue: lease.usageValue,
    },
  };
  const quotes: EarlyExitQuote[] = [];
  for (let k = 1; k <= termMonths; k++) {
    const result = earlyExitQuote(contract, context, k);
    if (!result.ok) throw new Error(result.reason);
    quotes.push(result.quote);
  }
  return { contract, quotes };
}

describe('early exit properties', () => {
  it('never costs less than zero, and handing back never costs more than buying', () => {
    fc.assert(
      fc.property(anyLease, (lease) => {
        for (const q of everyExit(lease).quotes) {
          expect(q.handBack.netCents).toBeGreaterThanOrEqual(0);
          expect(q.handBack.netCents).toBeLessThanOrEqual(q.buy.netCents);
          expect(q.buy.discountCents).toBeGreaterThanOrEqual(0);
        }
      })
    );
  });

  it('buying out gets cheaper every month you stay', () => {
    fc.assert(
      fc.property(anyLease, (lease) => {
        const { quotes } = everyExit(lease);
        for (let i = 1; i < quotes.length; i++) {
          expect(quotes[i]!.buy.netCents).toBeLessThan(quotes[i - 1]!.buy.netCents);
        }
      })
    );
  });

  it('leaving later never makes the whole lease cheaper (rents paid + exit cost)', () => {
    fc.assert(
      fc.property(anyLease, (lease) => {
        const { contract, quotes } = everyExit(lease);
        const total = (q: EarlyExitQuote, exit: 'buy' | 'handBack') =>
          q.exitMonth * contract.monthlyNetRentCents + q[exit].netCents;
        for (let i = 1; i < quotes.length; i++) {
          for (const exit of ['buy', 'handBack'] as const) {
            expect(total(quotes[i]!, exit)).toBeGreaterThanOrEqual(
              total(quotes[i - 1]!, exit) - ROUNDING_SLACK_CENTS
            );
          }
        }
      })
    );
  });

  it('in the final month is exactly the end-of-term buyout, and handing back is free', () => {
    fc.assert(
      fc.property(anyLease, (lease) => {
        const { contract, quotes } = everyExit(lease);
        const last = quotes[quotes.length - 1]!;
        const invoice = buyoutInvoice(contract, vatRates, last.effectiveDate)!;
        expect(last.buy).toMatchObject({
          netCents: invoice.netCents,
          vatCents: invoice.vatCents,
          grossCents: invoice.grossCents,
          discountCents: 0,
        });
        expect(last.handBack.grossCents).toBe(0);
      })
    );
  });
});
