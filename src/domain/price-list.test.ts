import { beforeAll, describe, expect, it } from 'vitest';
import { loadPriceLists } from '@/data/load';
import type { PriceList } from '@/data/schemas';
import { contractListPrice, effectiveAssetPriceOn, listPriceOn } from './price-list';

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

describe('effectiveAssetPriceOn', () => {
  it('uses relist_price_cents when present on a relisted asset', () => {
    expect(
      effectiveAssetPriceOn(
        priceLists,
        { id: 'ebike-007', relist_price_cents: 92_781 },
        '2026-11-05'
      )
    ).toEqual({
      ok: true,
      priceCents: 92_781,
      priceListVersion: 1,
      isRelisted: true,
    });
  });

  it('falls back to listPriceOn when relist_price_cents is absent or null', () => {
    expect(
      effectiveAssetPriceOn(priceLists, { id: 'ebike-003', relist_price_cents: null }, '2026-11-05')
    ).toEqual({
      ok: true,
      priceCents: 389_000,
      priceListVersion: 1,
    });
  });

  it('rejects invalid dates or non-integer relist_price_cents', () => {
    expect(() => effectiveAssetPriceOn(priceLists, { id: 'ebike-003' }, 'bad-date')).toThrow(
      RangeError
    );
    expect(() =>
      effectiveAssetPriceOn(priceLists, { id: 'ebike-003', relist_price_cents: -10 }, '2026-11-05')
    ).toThrow(RangeError);
  });
});

describe('contractListPrice', () => {
  const catalogue = { ok: true, priceCents: 262_400, priceListVersion: 2 } as const;
  const offer = { priceCents: 249_900, priceListVersion: 1 };

  it('uses the price locked in the offer when the contract was signed under one', () => {
    expect(contractListPrice({ offer, catalogue })).toEqual({
      ok: true,
      priceCents: 249_900,
      priceListVersion: 1,
    });
  });

  it('uses the catalogue price without an offer, failures included', () => {
    expect(contractListPrice({ offer: null, catalogue })).toEqual(catalogue);
    const missing = { ok: false, reason: 'unknown_asset' } as const;
    expect(contractListPrice({ offer: null, catalogue: missing })).toEqual(missing);
  });

  it('keeps an offer price even when the catalogue has no price for that day', () => {
    const missing = { ok: false, reason: 'no_price_list_on_date' } as const;
    expect(contractListPrice({ offer, catalogue: missing })).toMatchObject({ ok: true });
  });
});
