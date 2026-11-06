// firstLeaseCurve (D60, review finding 1 and 3): the list price and the age inputs the residual
// curve reads for an item, the same for the assessment and the exit; livesSoFar: the current
// life from the pack's count plus our ended contracts.
import { describe, expect, it } from 'vitest';
import type { PriceList } from '@/data/schemas';
import { firstLeaseCurve, livesSoFar } from './first-lease';

const priceLists: PriceList[] = [
  { version: 2, valid_from: '2027-01-01', prices: { 'ebike-007': 600_000 } },
  { version: 1, valid_from: '2026-01-01', prices: { 'ebike-007': 549_000, 'ebike-003': 389_000 } },
] as unknown as PriceList[];

describe('firstLeaseCurve', () => {
  it('card 9 relisted and leased: the earliest price list, D11 from the model year, never the second-life contract price', () => {
    const curve = firstLeaseCurve({
      assetId: 'ebike-007',
      modelYear: 2023,
      previousLives: 1,
      contracts: [{ startDate: '2026-11-06', unitListPriceCents: 172_829 }],
      priceLists,
      today: '2027-11-06',
    });
    expect(curve).toEqual({
      listPriceCents: 549_000,
      age: { modelYear: 2023, previousLives: 1, leaseStart: '2027-11-06' },
    });
  });

  it('ours from new (card 1 → card 8): the first contract price and start, on every later lease too', () => {
    const curve = firstLeaseCurve({
      assetId: 'ebike-003',
      modelYear: 2026,
      previousLives: 0,
      contracts: [
        { startDate: '2026-11-05', unitListPriceCents: 389_000 },
        { startDate: '2027-07-01', unitListPriceCents: 250_000 },
      ],
      priceLists,
      today: '2027-11-06',
    });
    expect(curve).toEqual({
      listPriceCents: 389_000,
      age: { modelYear: 2026, previousLives: 0, leaseStart: '2026-11-05' },
    });
  });

  it('no past life and no contract (an item seeded as returned): the price list, aged from the model year', () => {
    const curve = firstLeaseCurve({
      assetId: 'ebike-003',
      modelYear: 2026,
      previousLives: 0,
      contracts: [],
      priceLists,
      today: '2026-11-06',
    });
    expect(curve).toEqual({
      listPriceCents: 389_000,
      age: { modelYear: 2026, previousLives: 1, leaseStart: '2026-11-06' },
    });
  });

  it('null when no price list has the item and it is not ours', () => {
    expect(
      firstLeaseCurve({
        assetId: 'laptop-1',
        modelYear: 2024,
        previousLives: 1,
        contracts: [],
        priceLists,
        today: '2026-11-06',
      })
    ).toBeNull();
  });
});

describe('livesSoFar', () => {
  it('card 10: two past lives in the pack, leased: the third life', () => {
    expect(livesSoFar(2, [{ status: 'active' }])).toEqual({ previousLives: 2, currentLife: 3 });
  });

  it('card 1 → card 8 → relisted: one ended contract makes the next lease the second life', () => {
    expect(livesSoFar(0, [{ status: 'returned' }])).toEqual({ previousLives: 1, currentLife: 2 });
  });

  it('passed-on and early-ended contracts count, an active one does not', () => {
    expect(
      livesSoFar(1, [{ status: 'passed_on' }, { status: 'ended_early' }, { status: 'active' }])
    ).toEqual({ previousLives: 3, currentLife: 4 });
  });

  it('a new item: life 1', () => {
    expect(livesSoFar(0, [])).toEqual({ previousLives: 0, currentLife: 1 });
  });
});
