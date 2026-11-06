import { describe, expect, it } from 'vitest';
import type { PriceList } from '@/data/schemas';
import type { ValuationBaseline } from '@/data/valuation-baseline-schemas';
import { wholeMonthsSince, resolveValuationBaseline } from './valuation-baseline';

const priceLists: PriceList[] = [
  {
    version: 1,
    valid_from: '2026-01-01',
    valid_to: '2026-11-05',
    note: 'Synthetic original prices',
    prices: { bike: 549000 },
  },
  {
    version: 2,
    valid_from: '2026-11-06',
    valid_to: null,
    note: 'Synthetic revised prices',
    prices: { bike: 576450 },
  },
];
const input = { asset: { id: 'bike', model_year: 2023 }, saved: null, priceLists };

describe('completed age from an original valuation date', () => {
  it.each([
    ['2023-01-01', '2026-11-06', 46],
    ['2026-11-06', '2026-11-06', 0],
    ['2026-01-31', '2026-02-27', 0],
    ['2026-01-31', '2026-02-28', 1],
    ['2026-01-31', '2026-03-30', 1],
    ['2026-01-31', '2026-03-31', 2],
    ['2024-02-29', '2025-02-28', 12],
    ['0001-01-01', '0001-02-01', 1],
  ])('%s to %s is %i whole months', (start, end, expected) => {
    expect(wholeMonthsSince(start, end)).toBe(expected);
  });
  it.each([
    ['2026-02-30', '2026-03-01'],
    ['2027-01-01', '2026-01-01'],
    ['bad', '2026-11-06'],
    ['2026-11-06', 'bad'],
  ])('rejects invalid or reversed dates: %s, %s', (start, end) => {
    expect(() => wholeMonthsSince(start, end)).toThrow(RangeError);
  });
});

describe('original valuation reference', () => {
  it('uses January 1 of model year and v1 regardless of the current list', () => {
    expect(resolveValuationBaseline(input)).toEqual({
      firstUsedOn: '2023-01-01',
      originalPriceCents: 549000,
      source: 'imported_assumption',
      reason: null,
    });
  });
  it('uses recorded first-lease facts when available', () => {
    expect(
      resolveValuationBaseline({
        ...input,
        firstLease: { startDate: '2026-11-06', originalPriceCents: 576450 },
      })
    ).toMatchObject({
      firstUsedOn: '2026-11-06',
      originalPriceCents: 576450,
      source: 'recorded_lease',
    });
  });
  it('preserves a saved baseline across later leases, models and prices', () => {
    const saved: ValuationBaseline = {
      firstUsedOn: '2020-06-15',
      originalPriceCents: 700000,
      source: 'operator_verified',
      reason: 'Original purchase record inspected.',
    };
    expect(
      resolveValuationBaseline({
        ...input,
        saved,
        firstLease: { startDate: '2030-01-01', originalPriceCents: 50000 },
      })
    ).toEqual(saved);
  });
  it('does not invent a price when v1 or the item is missing', () => {
    expect(resolveValuationBaseline({ ...input, priceLists: priceLists.slice(1) })).toBeNull();
    expect(
      resolveValuationBaseline({ ...input, asset: { ...input.asset, id: 'unknown' } })
    ).toBeNull();
    expect(
      resolveValuationBaseline({
        ...input,
        priceLists: [{ ...priceLists[0]!, prices: { bike: 0 } }],
      })
    ).toBeNull();
    expect(
      resolveValuationBaseline({
        ...input,
        priceLists: [{ ...priceLists[0]!, prices: { bike: -100 } }],
      })
    ).toBeNull();
  });
  it('rejects an invalid model-year assumption without making up a date', () => {
    expect(
      resolveValuationBaseline({ ...input, asset: { ...input.asset, model_year: 0 } })
    ).toBeNull();
  });
  it('does not mutate the source price lists', () => {
    const before = structuredClone(input);
    resolveValuationBaseline(input);
    expect(input).toEqual(before);
  });
});
