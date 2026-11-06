import { expect, it } from 'vitest';
import { loadPriceLists } from '@/data/load';
import { withCircularPrices } from './prices';
import { listPriceOn } from '@/domain/price-list';
it('retains historical prices while activating published used-asset offers exactly on their date', async () => {
  const base = await loadPriceLists();
  const original = JSON.stringify(base);
  const combined = withCircularPrices(base, [
    { id: 'offer-1', assetId: 'ebike-003', netListCents: 120000, publishedOn: '2029-11-05' },
  ]);
  expect(listPriceOn(combined, 'ebike-003', '2026-11-05')).toMatchObject({
    ok: true,
    priceCents: 389000,
  });
  expect(listPriceOn(combined, 'ebike-003', '2029-11-04')).toEqual(
    listPriceOn(base, 'ebike-003', '2029-11-04')
  );
  expect(listPriceOn(combined, 'ebike-003', '2029-11-05')).toMatchObject({
    ok: true,
    priceCents: 120000,
  });
  expect(JSON.stringify(base)).toBe(original);
  for (const date of ['2027-01-01', '2028-03-01', '2030-01-01']) {
    const output = withCircularPrices(base, [
      { id: 'o', assetId: 'ebike-003', netListCents: 110000, publishedOn: date },
    ]);
    expect(listPriceOn(output, 'ebike-003', date)).toMatchObject({ priceCents: 110000 });
  }
});
