import { beforeAll, describe, expect, it } from 'vitest';
import { loadPriceLists } from '@/data/load';
import type { PriceList } from '@/data/schemas';
import { differentPriceOn, listPriceOn, nextPriceChange } from './price-list';

let priceLists: PriceList[];
beforeAll(async () => {
  priceLists = await loadPriceLists();
});

describe('listPriceOn', () => {
  it('uses price list 1 up to and including its last day, 2026-11-05', () => {
    expect(listPriceOn(priceLists, 'ebike-001', '2026-11-05')).toEqual({
      ok: true,
      priceCents: 189_900,
      priceListVersion: 1,
    });
  });

  it('switches to price list 2 on 2026-11-06', () => {
    expect(listPriceOn(priceLists, 'ebike-001', '2026-11-06')).toEqual({
      ok: true,
      priceCents: 199_400,
      priceListVersion: 2,
    });
  });

  it('applies price list 1 from its first day', () => {
    expect(listPriceOn(priceLists, 'laptop-002', '2026-01-01')).toMatchObject({
      ok: true,
      priceListVersion: 1,
    });
  });

  it('keeps using the open-ended list 2 far in the future', () => {
    expect(listPriceOn(priceLists, 'farm-002', '2030-01-01')).toEqual({
      ok: true,
      priceCents: 14_500_000,
      priceListVersion: 2,
    });
  });

  it('has no price before the first list starts', () => {
    expect(listPriceOn(priceLists, 'ebike-001', '2025-12-31')).toEqual({
      ok: false,
      reason: 'no_price_list_on_date',
    });
  });

  it('does not know assets that are not in the price list', () => {
    expect(listPriceOn(priceLists, 'ebike-999', '2026-11-05')).toEqual({
      ok: false,
      reason: 'unknown_asset',
    });
  });

  it('works without any price lists', () => {
    expect(listPriceOn([], 'ebike-001', '2026-11-05')).toEqual({
      ok: false,
      reason: 'no_price_list_on_date',
    });
  });

  it('throws on a date that is not YYYY-MM-DD, because that is a bug in the caller', () => {
    expect(() => listPriceOn(priceLists, 'ebike-001', '6.11.2026')).toThrow(RangeError);
  });
});

describe('nextPriceChange', () => {
  it('sees price list 2 coming on the last day of list 1', () => {
    expect(nextPriceChange(priceLists, 'laptop-004', '2026-11-05')).toEqual({
      validFrom: '2026-11-06',
      priceCents: 321_100,
      priceListVersion: 2,
    });
  });

  it('has nothing scheduled once the newest list applies', () => {
    expect(nextPriceChange(priceLists, 'laptop-004', '2026-11-06')).toBeNull();
  });

  it('picks the earliest of several future lists', () => {
    const lists = [
      { version: 3, valid_from: '2027-06-01', valid_to: null, note: '', prices: { x: 300 } },
      {
        version: 2,
        valid_from: '2027-01-01',
        valid_to: '2027-05-31',
        note: '',
        prices: { x: 200 },
      },
    ];
    expect(nextPriceChange(lists, 'x', '2026-11-05')).toMatchObject({ priceListVersion: 2 });
  });

  it('ignores a new list that keeps the price the same (farm machines in list 2)', () => {
    expect(nextPriceChange(priceLists, 'farm-005', '2026-11-05')).toBeNull();
  });

  it('skips a same-price list and finds the later real change', () => {
    const lists = [
      {
        version: 1,
        valid_from: '2026-01-01',
        valid_to: '2026-12-31',
        note: '',
        prices: { x: 100 },
      },
      {
        version: 2,
        valid_from: '2027-01-01',
        valid_to: '2027-05-31',
        note: '',
        prices: { x: 100 },
      },
      { version: 3, valid_from: '2027-06-01', valid_to: null, note: '', prices: { x: 120 } },
    ];
    expect(nextPriceChange(lists, 'x', '2026-11-05')).toEqual({
      validFrom: '2027-06-01',
      priceCents: 120,
      priceListVersion: 3,
    });
  });

  it('skips future lists that do not price the asset', () => {
    expect(nextPriceChange(priceLists, 'ebike-999', '2026-11-05')).toBeNull();
  });

  it('throws on a date that is not YYYY-MM-DD', () => {
    expect(() => nextPriceChange(priceLists, 'ebike-001', '2026-11')).toThrow(RangeError);
  });
});

describe('differentPriceOn', () => {
  it('shows list 2’s laptop price next to a contract locked at list 1 (scenario card 2)', () => {
    expect(differentPriceOn(priceLists, 'laptop-004', '2026-11-06', 349_000)).toEqual({
      priceCents: 321_100,
      priceListVersion: 2,
    });
  });

  it('is null when today’s price is the locked one', () => {
    expect(differentPriceOn(priceLists, 'laptop-004', '2026-11-05', 349_000)).toBeNull();
    expect(differentPriceOn(priceLists, 'farm-001', '2026-11-06', 8_900_000)).toBeNull();
  });

  it('is null when there is no price today', () => {
    expect(differentPriceOn(priceLists, 'ebike-999', '2026-11-06', 100)).toBeNull();
  });
});
