import { expect, it } from 'vitest';
import { assetOfferPrice } from './asset-offer';
it('uses an assessed offer before current catalogue prices', () => {
  expect(
    assetOfferPrice(
      { id: 'item', secondLifePriceCents: 125000, priceRevision: 3 },
      [],
      '2026-11-06'
    )
  ).toEqual({ ok: true, priceCents: 125000, priceListVersion: 3 });
});
it('falls back to the dated price list and rejects invalid prices', () => {
  expect(
    assetOfferPrice({ id: 'item', secondLifePriceCents: null, priceRevision: 1 }, [], '2026-11-06')
      .ok
  ).toBe(false);
  expect(() =>
    assetOfferPrice({ id: 'item', secondLifePriceCents: 1.5, priceRevision: 1 }, [], '2026-11-06')
  ).toThrow();
});
