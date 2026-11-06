import { beforeAll, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { loadResidualCurves } from '@/data/load';
import type { ResidualCurves } from '@/data/schemas';
import { addMonthsClamped } from '../calendar';
import { earlyExitQuoteFor, nextInvoiceDateAfter } from './early-exit';

let curves: ResidualCurves;

beforeAll(async () => {
  curves = await loadResidualCurves();
});

const contract = {
  startsOn: '2026-01-31',
  endsOn: '2029-01-31',
  termMonths: 36,
  monthlyNetRentCents: 10_000,
  buyoutCents: 50_000,
  annualInterestBasisPoints: 0,
};

const asset = {
  category: 'e_bike' as const,
  condition: 'good' as const,
  usageValue: 0,
  firstLeasedOn: '2026-01-31',
  originalListPriceCents: 300_000,
};

describe('nextInvoiceDateAfter', () => {
  it('clamps the next anniversary for a January 31 start', () => {
    expect(nextInvoiceDateAfter('2026-01-31', 36, '2026-01-31')).toBe('2026-02-28');
    expect(nextInvoiceDateAfter('2026-01-31', 36, '2026-02-28')).toBe('2026-03-31');
  });
});

describe('earlyExitQuoteFor', () => {
  it('values a used item by its age since the first lease, not since this contract', () => {
    const quoteFor = (firstLeasedOn: string) =>
      earlyExitQuoteFor({
        action: 'returned',
        effectiveOn: '2026-02-28',
        contract,
        asset: { ...asset, firstLeasedOn },
        residualCurves: curves,
      });

    expect(quoteFor('2023-01-31')).toMatchObject({
      ok: true,
      quote: { completedMonths: 1, marketValueCents: 100_088 },
    });
  });

  it('refuses a first lease after the contract start', () => {
    expect(
      earlyExitQuoteFor({
        action: 'returned',
        effectiveOn: '2026-02-28',
        contract,
        asset: { ...asset, firstLeasedOn: '2026-02-01' },
        residualCurves: curves,
      })
    ).toEqual({
      ok: false,
      reason: 'residual_value_unavailable',
      detail: 'first_lease_after_start',
    });
  });

  it('includes month seven through the end and the locked buyout', () => {
    const result = earlyExitQuoteFor({
      action: 'returned',
      effectiveOn: '2026-07-31',
      contract,
      asset,
      residualCurves: curves,
    });

    expect(result).toMatchObject({
      ok: true,
      quote: {
        completedMonths: 6,
        remainingMonths: 30,
        remainingRentCents: 300_000,
        discountedBalanceCents: 350_000,
        settlementNetCents: 140_900,
      },
    });
  });

  it('uses the market value only for a return, not a buyout', () => {
    const returned = earlyExitQuoteFor({
      action: 'returned',
      effectiveOn: '2026-07-31',
      contract,
      asset,
      residualCurves: curves,
    });
    const bought = earlyExitQuoteFor({
      action: 'bought',
      effectiveOn: '2026-07-31',
      contract,
      asset,
      residualCurves: curves,
    });

    expect(returned).toMatchObject({ ok: true, quote: { marketValueCreditCents: 209_100 } });
    expect(bought).toMatchObject({
      ok: true,
      quote: { marketValueCreditCents: 0, settlementNetCents: 350_000 },
    });
  });

  it('rejects the term boundary and non-anniversary dates', () => {
    expect(
      earlyExitQuoteFor({
        action: 'returned',
        effectiveOn: '2029-01-31',
        contract,
        asset,
        residualCurves: curves,
      })
    ).toEqual({ ok: false, reason: 'term_finished' });
    expect(
      earlyExitQuoteFor({
        action: 'returned',
        effectiveOn: '2026-07-30',
        contract,
        asset,
        residualCurves: curves,
      })
    ).toEqual({ ok: false, reason: 'effective_date_not_invoice_anniversary' });
  });

  it('keeps generated settlements non-negative and return settlements no higher than buyouts', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 35 }),
        fc.integer({ min: 1, max: 2_000_000 }),
        fc.integer({ min: 1, max: 500_000 }),
        fc.integer({ min: 0, max: 2_000 }),
        (completedMonths, monthlyRentCents, buyoutCents, annualInterestBasisPoints) => {
          const effectiveOn = addMonthsClamped(contract.startsOn, completedMonths);
          const input = {
            effectiveOn,
            contract: {
              ...contract,
              monthlyNetRentCents: monthlyRentCents,
              buyoutCents,
              annualInterestBasisPoints,
            },
            asset,
            residualCurves: curves,
          };
          const returned = earlyExitQuoteFor({ ...input, action: 'returned' });
          const bought = earlyExitQuoteFor({ ...input, action: 'bought' });

          expect(returned.ok).toBe(true);
          expect(bought.ok).toBe(true);
          if (!returned.ok || !bought.ok) return;
          expect(returned.quote.settlementNetCents).toBeGreaterThanOrEqual(0);
          expect(bought.quote.settlementNetCents).toBeGreaterThanOrEqual(0);
          expect(returned.quote.settlementNetCents).toBeLessThanOrEqual(
            bought.quote.settlementNetCents
          );
          expect(Number.isInteger(returned.quote.settlementNetCents)).toBe(true);
          expect(Number.isInteger(bought.quote.settlementNetCents)).toBe(true);
        }
      ),
      { numRuns: 2_000 }
    );
  }, 15_000);
});
