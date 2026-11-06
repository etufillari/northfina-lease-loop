import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadPriceLists } from '@/data/load';
import type { CoefficientTable, PriceList } from '@/data/schemas';
import { calculateQuote } from './pricing';
import {
  clampDownPayment,
  downPaymentRange,
  lowerRentOption,
  offeredTerms,
  type DownPaymentRange,
} from './quote-options';

let table: CoefficientTable;
let priceLists: PriceList[];
beforeAll(async () => {
  [table, priceLists] = await Promise.all([loadCoefficientTable(), loadPriceLists()]);
});

const rangeOf = (listPriceCents: number): DownPaymentRange => {
  const result = downPaymentRange(table, listPriceCents);
  if (!result.ok) throw new Error(result.reason);
  return result.range;
};

const quote = (listPriceCents: number, downPaymentCents: number, termMonths: number) => {
  const result = calculateQuote(table, { listPriceCents, downPaymentCents, termMonths });
  if (!result.ok) throw new Error(result.reason);
  return result.quote;
};

describe('offeredTerms', () => {
  it('lists the terms in the table, shortest first', () => {
    expect(offeredTerms(table)).toEqual([12, 24, 36, 48]);
  });

  it('sorts numerically, not as text', () => {
    const terms = offeredTerms({
      ...table,
      end_of_term_buyout_percent_of_financed: { '120': 5, '9': 50 },
    });
    expect(terms).toEqual([9, 120]);
  });
});

describe('downPaymentRange', () => {
  it('refuses a price one cent under the lowest band', () => {
    expect(downPaymentRange(table, 29_999)).toEqual({ ok: false, reason: 'below_minimum' });
  });

  it('allows only 0 down on a price exactly at the minimum', () => {
    expect(rangeOf(30_000)).toMatchObject({ minCents: 0, maxCents: 0 });
  });

  it('never rounds the maximum up past the financing minimum', () => {
    expect(rangeOf(30_050)).toMatchObject({ minCents: 0, maxCents: 0 });
  });

  it('gives a 303 € item a 1 € step, since it can only take 3 € down', () => {
    expect(rangeOf(30_300)).toEqual({ minCents: 0, maxCents: 300, stepCents: 100 });
  });

  it('needs no down payment on a price exactly at the maximum', () => {
    expect(rangeOf(25_000_000).minCents).toBe(0);
  });

  it('requires 10 000 € down on a 260 000 € item', () => {
    expect(rangeOf(26_000_000)).toEqual({
      minCents: 1_000_000,
      maxCents: 25_970_000,
      stepCents: 50_000,
    });
  });

  it('rounds a minimum with cents up, so the financed amount stays under the maximum', () => {
    expect(rangeOf(25_000_050).minCents).toBe(100);
  });

  it('rounds a maximum with cents down', () => {
    expect(rangeOf(199_999).maxCents).toBe(169_900);
  });

  it.each([
    [40_000, 100],
    [40_100, 1_000],
    [530_000, 1_000],
    [530_100, 10_000],
    [5_030_000, 10_000],
    [5_030_100, 50_000],
  ])('picks the step for a price of %i cents', (listPriceCents, stepCents) => {
    expect(rangeOf(listPriceCents).stepCents).toBe(stepCents);
  });

  it('gives a financeable minimum and maximum for every price in the data pack', () => {
    for (const list of priceLists) {
      for (const priceCents of Object.values(list.prices)) {
        const range = downPaymentRange(table, priceCents);
        if (!range.ok) continue;
        for (const down of [range.range.minCents, range.range.maxCents]) {
          expect(
            calculateQuote(table, {
              listPriceCents: priceCents,
              downPaymentCents: down,
              termMonths: 36,
            }).ok
          ).toBe(true);
        }
      }
    }
  });

  it('makes every whole-euro amount in the range financeable', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 30_000, max: 40_000_000 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (listPriceCents, position) => {
          const { minCents, maxCents } = rangeOf(listPriceCents);
          const down = clampDownPayment(
            { minCents, maxCents, stepCents: 100 },
            minCents + Math.floor((maxCents - minCents) * position)
          );
          const result = calculateQuote(table, {
            listPriceCents,
            downPaymentCents: down,
            termMonths: 24,
          });
          return result.ok && down % 100 === 0;
        }
      )
    );
  });
});

describe('clampDownPayment', () => {
  const range = { minCents: 1_000, maxCents: 5_000, stepCents: 100 };

  it('keeps a whole-euro amount inside the range', () => {
    expect(clampDownPayment(range, 2_300)).toBe(2_300);
  });

  it('drops cents', () => {
    expect(clampDownPayment(range, 2_399)).toBe(2_300);
  });

  it('raises an amount under the minimum', () => {
    expect(clampDownPayment(range, 0)).toBe(1_000);
  });

  it('lowers an amount over the maximum', () => {
    expect(clampDownPayment(range, 999_999)).toBe(5_000);
  });
});

describe('lowerRentOption', () => {
  it('finds the lower rent when 1 € down crosses into a dearer band', () => {
    expect(lowerRentOption(table, quote(200_000, 100, 36))).toEqual({
      downPaymentCents: 0,
      monthlyNetRentCents: 5_517,
    });
  });

  it('means a lower contract total as well', () => {
    const current = quote(200_000, 100, 36);
    const option = lowerRentOption(table, current);
    const better = quote(200_000, option?.downPaymentCents ?? -1, 36);
    expect(better.contractNetTotalCents).toBeLessThan(current.contractNetTotalCents);
  });

  it('stops once the extra down payment has paid for the dearer band', () => {
    expect(lowerRentOption(table, quote(200_000, 10_000, 36))).toBeNull();
  });

  it('finds nothing when already at the bottom of a band', () => {
    expect(lowerRentOption(table, quote(200_000, 0, 36))).toBeNull();
  });

  it('finds nothing in the top band', () => {
    expect(lowerRentOption(table, quote(6_000_000, 0, 36))).toBeNull();
  });

  it('finds nothing when the price never reaches the next band', () => {
    expect(lowerRentOption(table, quote(150_000, 1_000, 36))).toBeNull();
  });

  it('rounds to whole euros, staying in the cheaper band', () => {
    expect(lowerRentOption(table, quote(200_050, 100, 36))).toEqual({
      downPaymentCents: 0,
      monthlyNetRentCents: quote(200_050, 0, 36).monthlyNetRentCents,
    });
  });

  it('finds nothing when the option would go over the financing maximum', () => {
    const narrowTop: CoefficientTable = {
      ...table,
      bands: table.bands.map((band) => {
        if (band.band === 'C') return { ...band, max_financed_cents: 24_999_999 };
        if (band.band === 'D') return { ...band, min_financed_cents: 25_000_000 };
        return band;
      }),
    };
    const result = calculateQuote(narrowTop, {
      listPriceCents: 25_000_050,
      downPaymentCents: 100,
      termMonths: 36,
    });
    if (!result.ok) throw new Error(result.reason);
    expect(lowerRentOption(narrowTop, result.quote)).toBeNull();
  });

  it('finds nothing for a band the table does not have', () => {
    expect(lowerRentOption(table, { ...quote(200_000, 100, 36), band: 'Z' })).toBeNull();
  });
});
