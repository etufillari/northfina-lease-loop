import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadPriceLists } from '@/data/load';
import type { CoefficientTable, PriceList } from '@/data/schemas';
import {
  downPaymentAtPosition,
  lastDownPaymentPosition,
  leaseLimitsFor,
  type LeaseLimits,
} from './lease-limits';
import { leasePriceFor } from './pricing';

let table: CoefficientTable;
let priceLists: PriceList[];

beforeAll(async () => {
  table = await loadCoefficientTable();
  priceLists = await loadPriceLists();
});

function limitsFor(priceCents: number): LeaseLimits {
  const result = leaseLimitsFor(table, priceCents);
  if (!result.ok) throw new Error(`Expected limits for ${priceCents}`);
  return result;
}

describe('leaseLimitsFor', () => {
  it('offers the terms in the coefficient table, defaulting to 36 months', () => {
    expect(limitsFor(389_000)).toMatchObject({
      termOptions: [12, 24, 36, 48],
      defaultTermMonths: 36,
    });
  });

  it('leaves out a term that one band cannot price', () => {
    const [firstBand, ...otherBands] = table.bands;
    if (!firstBand) throw new Error('Expected a band');
    const { 36: _removed, ...factors } = firstBand.monthly_factor_by_term;
    const limits = leaseLimitsFor(
      { ...table, bands: [{ ...firstBand, monthly_factor_by_term: factors }, ...otherBands] },
      389_000
    );

    expect(limits).toMatchObject({ termOptions: [12, 24, 48], defaultTermMonths: 48 });
  });

  it('keeps the financed amount at or above the lowest band', () => {
    expect(limitsFor(14_500_000)).toMatchObject({
      minDownPaymentCents: 0,
      maxDownPaymentCents: 14_470_000,
    });
  });

  it('requires a down payment for an item above the top band', () => {
    expect(limitsFor(26_000_000)).toMatchObject({
      minDownPaymentCents: 1_000_000,
      maxDownPaymentCents: 25_970_000,
    });
  });

  it('treats the top of the highest band as needing no down payment', () => {
    expect(limitsFor(25_000_000).minDownPaymentCents).toBe(0);
    expect(limitsFor(25_000_001).minDownPaymentCents).toBe(1);
  });

  it('rejects an item below the lowest band', () => {
    expect(leaseLimitsFor(table, 29_999)).toEqual({ ok: false, reason: 'below_minimum' });
  });

  it('accepts an item exactly at the lowest band, with no room for a down payment', () => {
    expect(limitsFor(30_000)).toMatchObject({ minDownPaymentCents: 0, maxDownPaymentCents: 0 });
  });

  it('fixes the down payment when the range is under €10', () => {
    expect(limitsFor(30_300)).toMatchObject({ minDownPaymentCents: 0, maxDownPaymentCents: 0 });
    expect(limitsFor(30_999).maxDownPaymentCents).toBe(0);
  });

  it('allows a down payment once the range reaches €10', () => {
    expect(limitsFor(31_000).maxDownPaymentCents).toBe(1_000);
  });

  it('scales the step to the item', () => {
    expect(limitsFor(45_900).downPaymentStepCents).toBe(100);
    expect(limitsFor(321_100).downPaymentStepCents).toBe(1_000);
    expect(limitsFor(576_400).downPaymentStepCents).toBe(5_000);
    expect(limitsFor(14_500_000).downPaymentStepCents).toBe(50_000);
    expect(limitsFor(26_000_000).downPaymentStepCents).toBe(100_000);
  });

  it('lets card 7 choose its €20,000 down payment', () => {
    const limits = limitsFor(14_500_000);
    const position = 2_000_000 / limits.downPaymentStepCents;
    expect(downPaymentAtPosition(limits, position)).toBe(2_000_000);
  });

  it('has no gaps between bands, which the limits rely on', () => {
    const bands = [...table.bands].sort((a, b) => a.min_financed_cents - b.min_financed_cents);
    bands.slice(1).forEach((band, index) => {
      expect(band.min_financed_cents).toBe((bands[index]?.max_financed_cents ?? 0) + 1);
    });
  });
});

describe('down payment positions', () => {
  const limits: LeaseLimits = {
    termOptions: [36],
    defaultTermMonths: 36,
    minDownPaymentCents: 500,
    maxDownPaymentCents: 2_750,
    downPaymentStepCents: 1_000,
  };

  it('starts at the minimum and moves one step at a time', () => {
    expect(downPaymentAtPosition(limits, 0)).toBe(500);
    expect(downPaymentAtPosition(limits, 2)).toBe(2_500);
  });

  it('reaches the maximum even when the range does not divide evenly', () => {
    expect(lastDownPaymentPosition(limits)).toBe(3);
    expect(downPaymentAtPosition(limits, 3)).toBe(2_750);
  });

  it('has a single position when the down payment is fixed', () => {
    const fixed = { ...limits, maxDownPaymentCents: 500 };
    expect(lastDownPaymentPosition(fixed)).toBe(0);
    expect(downPaymentAtPosition(fixed, 0)).toBe(500);
  });
});

describe('every slider choice can be priced', () => {
  function expectPriceable(priceCents: number, limits: LeaseLimits, position: number) {
    const downPaymentCents = downPaymentAtPosition(limits, position);
    for (const termMonths of limits.termOptions) {
      expect(leasePriceFor(table, priceCents, downPaymentCents, termMonths).ok).toBe(true);
    }
  }

  it('holds for both ends of the slider on every item in every price list', () => {
    for (const priceCents of priceLists.flatMap((list) => Object.values(list.prices))) {
      const limits = leaseLimitsFor(table, priceCents);
      if (!limits.ok) continue;
      expectPriceable(priceCents, limits, 0);
      expectPriceable(priceCents, limits, lastDownPaymentPosition(limits));
    }
  });

  it('holds for any position at any price from the lowest band up', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 30_000, max: 100_000_000 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (priceCents, share) => {
          const limits = limitsFor(priceCents);
          const position = Math.round(share * lastDownPaymentPosition(limits));
          expectPriceable(priceCents, limits, position);
        }
      ),
      { numRuns: 2_000 }
    );
  });
});
