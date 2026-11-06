import { beforeAll, describe, expect, it } from 'vitest';
import { loadPriceLists } from '@/data/load';
import type { PriceList } from '@/data/schemas';
import { quoteStatusOn } from './quote-status';

let priceLists: PriceList[];
beforeAll(async () => {
  priceLists = await loadPriceLists();
});

// Card 2: laptop-004 quoted on 2026-11-05 at list v1 (349 000), valid 14 days.
const card2Quote = {
  assetId: 'laptop-004',
  quoteDate: '2026-11-05',
  validUntil: '2026-11-19',
  priceListVersion: 1,
  unitListPriceCents: 349_000,
};

describe('quoteStatusOn, card 2 (the price is locked; a cheaper list is live the next day)', () => {
  it('on the quote day: valid, same list, nothing cheaper', () => {
    expect(quoteStatusOn(card2Quote, '2026-11-05', priceLists)).toEqual({
      status: 'valid',
      validUntil: '2026-11-19',
      lockedListVersion: 1,
      lockedUnitPriceCents: 349_000,
      todayList: { version: 1, unitPriceCents: 349_000 },
      cheaperListLive: false,
    });
  });

  it('on 2026-11-06: still valid and locked at v1, but v2 is cheaper at 321 100', () => {
    expect(quoteStatusOn(card2Quote, '2026-11-06', priceLists)).toMatchObject({
      status: 'valid',
      lockedListVersion: 1,
      todayList: { version: 2, unitPriceCents: 321_100 },
      cheaperListLive: true,
    });
  });

  it('is valid through the last day and expired the day after', () => {
    expect(quoteStatusOn(card2Quote, '2026-11-19', priceLists).status).toBe('valid');
    expect(quoteStatusOn(card2Quote, '2026-11-20', priceLists).status).toBe('expired');
  });

  it('does not call a dearer new list cheaper (e-bikes went up 5 % in v2)', () => {
    const ebike = { ...card2Quote, assetId: 'ebike-003', unitListPriceCents: 389_000 };
    expect(quoteStatusOn(ebike, '2026-11-06', priceLists)).toMatchObject({
      todayList: { version: 2, unitPriceCents: 408_400 },
      cheaperListLive: false,
    });
  });

  it('reports no list today when no price list covers the day or the asset is gone', () => {
    const gone = { ...card2Quote, assetId: 'retired-001' };
    expect(quoteStatusOn(gone, '2026-11-06', priceLists)).toMatchObject({
      todayList: null,
      cheaperListLive: false,
    });
  });
});
