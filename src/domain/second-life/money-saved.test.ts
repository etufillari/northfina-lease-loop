// Smart problem 7 (circular impact), the money half, and decision D80: a later life saves the
// share of a new item's price it stood in for (pro rata to the design-life months it used, as
// the CO2 of D15) minus the money actually spent getting it ready, from refurbishment-costs.json.
// Card 10 (`ebike-008`, third life) is pinned at the end.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadCo2Factors, loadPriceLists, loadRefurbishmentCosts } from '@/data/load';
import type { Co2Factors, RefurbishmentCosts } from '@/data/schemas';
import { listPriceOn } from '../price-list';
import { ASSUMED_PAST_LIFE_MONTHS, co2Method, type Co2Method } from './co2';
import {
  fleetMoneySaved,
  mandatoryRefurbishmentCents,
  moneySavedByLife,
  moneySavedForAsset,
  refurbishmentByLife,
} from './money-saved';
import type { PassportEvent } from '../passport';

const factors: Co2Factors = {
  note: 'test',
  manufacturing_new_kg: { e_bike: 165, laptop: 330, farm_machine: 18000 },
  refurbishment_share_of_new: 0.12,
  avoided_by_reuse_formula_hint: 'test',
  e_bike_avoided_car_km_kg_per_km: 0.15,
};

/** A 60-month design life for every category, so the fractions read easily. */
const sixty: Co2Method = co2Method(factors, { e_bike: 60, laptop: 60, farm_machine: 60 });

const life = { category: 'e_bike' as const, newPriceCents: 300_000, refurbishmentCents: 4_500 };

describe('moneySavedByLife', () => {
  it('the first life saves nothing: the item was bought new for it', () => {
    expect(moneySavedByLife(sixty, { ...life, lifeIndex: 0, months: 24 })).toBe(0);
  });

  it('a whole design life of later use saves the new price minus what refurbishing cost', () => {
    // 300 000 − 4 500
    expect(moneySavedByLife(sixty, { ...life, lifeIndex: 1, months: 60 })).toBe(295_500);
  });

  it('a short life saves a short share: 7 of 60 months, minus the cost, rounded half up once', () => {
    // 100 001 × 7 / 60 = 11 666.783… − 2 500 = 9 166.783… → 9 167
    expect(
      moneySavedByLife(sixty, {
        category: 'laptop',
        lifeIndex: 1,
        months: 7,
        newPriceCents: 100_001,
        refurbishmentCents: 2_500,
      })
    ).toBe(9_167);
  });

  it('an almost worn-out item saves only what is left of its design life, minus the cost', () => {
    // 54 of 60 months used: a 24-month life counts 6. 300 000 × 6 / 60 − 4 500 = 25 500
    expect(
      moneySavedByLife(sixty, { ...life, lifeIndex: 2, months: 24, monthsUsedBefore: 54 })
    ).toBe(25_500);
  });

  it('a worn-out item, or one whose refurbishment cost more than the use it gave, saves nothing', () => {
    expect(
      moneySavedByLife(sixty, { ...life, lifeIndex: 2, months: 24, monthsUsedBefore: 60 })
    ).toBe(0);
    // 300 000 × 1 / 60 = 5 000 of use against a 35 000 battery and a 4 500 inspection
    expect(
      moneySavedByLife(sixty, { ...life, lifeIndex: 1, months: 1, refurbishmentCents: 39_500 })
    ).toBe(0);
  });

  it('a farm machine at the top of the price list stays exact', () => {
    const big = co2Method(factors, { e_bike: 144, laptop: 144, farm_machine: 144 });
    expect(
      moneySavedByLife(big, {
        category: 'farm_machine',
        lifeIndex: 1,
        months: 144,
        newPriceCents: 26_000_000,
        refurbishmentCents: 490_000,
      })
    ).toBe(25_510_000);
  });

  it('refuses a price, a cost or a month count that is not a whole number of at least 0', () => {
    const one = { ...life, lifeIndex: 1, months: 2 };
    expect(() => moneySavedByLife(sixty, { ...one, newPriceCents: 10.5 })).toThrow(RangeError);
    expect(() => moneySavedByLife(sixty, { ...one, refurbishmentCents: -1 })).toThrow(RangeError);
    expect(() => moneySavedByLife(sixty, { ...one, months: -1 })).toThrow(RangeError);
  });
});

describe('moneySavedForAsset', () => {
  it('each life uses up the design life in turn; the total is rounded once', () => {
    // 100 001 over 60 months; lives of 24, 7 and 7 months, 2 500 spent before each later life
    const result = moneySavedForAsset(sixty, {
      category: 'laptop',
      newPriceCents: 100_001,
      lives: [
        { months: 24, refurbishmentCents: 0 },
        { months: 7, refurbishmentCents: 2_500 },
        { months: 7, refurbishmentCents: 2_500 },
      ],
    });
    expect(result.perLifeCents).toEqual([0, 9_167, 9_167]);
    // 2 × 9 166.783… = 18 333.566… → 18 334, not 9 167 + 9 167
    expect(result.totalCents).toBe(18_334);
  });

  it('a life that saved nothing does not take away from the others', () => {
    const result = moneySavedForAsset(sixty, {
      category: 'e_bike',
      newPriceCents: 300_000,
      lives: [
        { months: 24, refurbishmentCents: 0 },
        { months: 1, refurbishmentCents: 39_500 },
        { months: 12, refurbishmentCents: 4_500 },
      ],
    });
    expect(result.perLifeCents).toEqual([0, 0, 55_500]);
    expect(result.totalCents).toBe(55_500);
  });

  it('an item with no price on the day saves nothing it can show', () => {
    const result = moneySavedForAsset(sixty, {
      category: 'e_bike',
      newPriceCents: null,
      lives: [
        { months: 24, refurbishmentCents: 0 },
        { months: 24, refurbishmentCents: 4_500 },
      ],
    });
    expect(result).toEqual({ perLifeCents: [0, 0], totalCents: 0 });
  });
});

describe('refurbishmentByLife', () => {
  const event = (kind: PassportEvent['kind'], details: unknown): PassportEvent => ({
    id: 1,
    kind,
    on_date: '2026-11-05',
    contract_id: null,
    details,
  });

  it('the first life costs nothing; a later one costs what the assessment before it spent', () => {
    const lives = [
      { between: [event('assessed', {}), event('refurbished', { costCents: 39_500 })] },
      { between: [] },
    ];
    expect(refurbishmentByLife(lives, 4_500)).toEqual([0, 39_500]);
  });

  it('a later life with no record before it is charged the mandatory steps', () => {
    expect(refurbishmentByLife([{ between: [] }, { between: [] }, { between: [] }], 4_500)).toEqual(
      [0, 4_500, 4_500]
    );
  });

  it('a malformed cost is an error, not a silent zero', () => {
    const lives = [{ between: [event('refurbished', { costCents: -1 })] }, { between: [] }];
    expect(() => refurbishmentByLife(lives, 4_500)).toThrow();
  });
});

describe('fleetMoneySaved', () => {
  it('sums per category, rounding each category once; the total adds the rows', () => {
    const laptop = {
      category: 'laptop' as const,
      newPriceCents: 100_001,
      lives: [
        { months: 24, refurbishmentCents: 0 },
        { months: 7, refurbishmentCents: 2_500 },
      ],
    };
    const fleet = fleetMoneySaved(sixty, [
      laptop,
      laptop,
      {
        category: 'e_bike',
        newPriceCents: 300_000,
        lives: [{ months: 24, refurbishmentCents: 0 }],
      },
    ]);
    expect(fleet.perCategory).toEqual([
      { category: 'e_bike', cents: 0 },
      { category: 'laptop', cents: 18_334 },
      { category: 'farm_machine', cents: 0 },
    ]);
    expect(fleet.totalCents).toBe(18_334);
  });

  it('an empty fleet has saved nothing', () => {
    expect(fleetMoneySaved(sixty, []).totalCents).toBe(0);
  });
});

describe('the data pack', () => {
  let costs: RefurbishmentCosts;
  beforeAll(async () => {
    costs = await loadRefurbishmentCosts();
  });

  it('the steps every relisting pays: e-bike inspection, laptop data wipe, farm inspection', () => {
    expect(mandatoryRefurbishmentCents(costs, 'e_bike')).toBe(4_500);
    expect(mandatoryRefurbishmentCents(costs, 'laptop')).toBe(2_500);
    expect(mandatoryRefurbishmentCents(costs, 'farm_machine')).toBe(40_000);
  });

  it('card 10: ebike-008 on 6 Nov 2026 has saved 332,80 €, and 665,60 € after its third life', async () => {
    const [assets, priceLists, packFactors] = await Promise.all([
      loadAssets(),
      loadPriceLists(),
      loadCo2Factors(),
    ]);
    const ebike = assets.find((asset) => asset.id === 'ebike-008')!;
    expect(listPriceOn(priceLists, 'ebike-008', '2026-11-06')).toEqual({
      ok: true,
      priceCents: 188_900,
      priceListVersion: 2,
    });

    const method = co2Method(packFactors);
    // Two past lives with no records: each later one paid at least the safety inspection.
    const past = Array.from({ length: ebike.previous_lives }, (_, index) => ({
      months: ASSUMED_PAST_LIFE_MONTHS,
      refurbishmentCents: index === 0 ? 0 : mandatoryRefurbishmentCents(costs, 'e_bike'),
    }));
    // 188 900 × 24 / 120 = 37 780 of a new bike's use, minus the 4 500 inspection
    const before = moneySavedForAsset(method, {
      category: 'e_bike',
      newPriceCents: 188_900,
      lives: past,
    });
    expect(before).toEqual({ perLifeCents: [0, 33_280], totalCents: 33_280 });

    // Card 10's assessment: inspection only, 4 500 (the `refurbished` event's costCents)
    const after = moneySavedForAsset(method, {
      category: 'e_bike',
      newPriceCents: 188_900,
      lives: [...past, { months: 24, refurbishmentCents: 4_500 }],
    });
    expect(after).toEqual({ perLifeCents: [0, 33_280, 33_280], totalCents: 66_560 });
  });
});
