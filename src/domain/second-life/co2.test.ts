// Smart problem 7 (circular impact) and decision D15: the CO2 a later life avoids is the
// manufacturing footprint net of refurbishment, pro rata to the months of the design life
// that life used. Card 10 (`ebike-008`, third life) is pinned at the end.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadCo2Factors } from '@/data/load';
import type { Co2Factors } from '@/data/schemas';
import {
  ASSUMED_PAST_LIFE_MONTHS,
  DESIGN_LIFE_MONTHS,
  co2Method,
  co2SavedByLife,
  co2SavedForAsset,
  fleetImpact,
  gramsToKg,
  type Co2Method,
} from './co2';

const factors: Co2Factors = {
  note: 'test',
  manufacturing_new_kg: { e_bike: 165, laptop: 330, farm_machine: 18000 },
  refurbishment_share_of_new: 0.12,
  avoided_by_reuse_formula_hint: 'test',
  e_bike_avoided_car_km_kg_per_km: 0.15,
};

/** A 60-month design life for every category, so the fractions read easily. */
const sixty: Co2Method = co2Method(factors, { e_bike: 60, laptop: 60, farm_machine: 60 });

/** 165 kg × (1 − 0.12) = 145.2 kg avoided by a whole second life of an e-bike. */
const EBIKE_NET_GRAMS = 145_200;

describe('co2SavedByLife', () => {
  it('the first life earns nothing: the item had to be made for it anyway', () => {
    expect(co2SavedByLife(sixty, { category: 'e_bike', lifeIndex: 0, months: 24 })).toBe(0);
  });

  it('an item returned after 2 of 60 months earns 2/60 of the net footprint, not the whole', () => {
    const grams = co2SavedByLife(sixty, {
      category: 'e_bike',
      lifeIndex: 1,
      months: 2,
      monthsUsedBefore: 0,
    });
    expect(grams).toBeCloseTo((EBIKE_NET_GRAMS * 2) / 60, 6);
    expect(gramsToKg(grams)).toBe(5); // 4.84 kg
  });

  it('a whole design life of later use earns the whole net footprint, never the gross', () => {
    const grams = co2SavedByLife(sixty, { category: 'e_bike', lifeIndex: 1, months: 60 });
    expect(grams).toBeCloseTo(EBIKE_NET_GRAMS, 6);
    expect(gramsToKg(grams)).toBe(145);
  });

  it('a worn-out item whose lives already used the design life earns nothing more', () => {
    expect(
      co2SavedByLife(sixty, { category: 'e_bike', lifeIndex: 2, months: 24, monthsUsedBefore: 60 })
    ).toBe(0);
    expect(
      co2SavedByLife(sixty, { category: 'e_bike', lifeIndex: 2, months: 24, monthsUsedBefore: 75 })
    ).toBe(0);
  });

  it('a life longer than the remaining design life is capped at what remains', () => {
    const grams = co2SavedByLife(sixty, {
      category: 'laptop',
      lifeIndex: 1,
      months: 36,
      monthsUsedBefore: 48,
    });
    // 12 months remain: 330 kg × 0.88 × 12 / 60
    expect(grams).toBeCloseTo((330_000 * 0.88 * 12) / 60, 6);
  });

  it('a life of zero months earns nothing', () => {
    expect(co2SavedByLife(sixty, { category: 'e_bike', lifeIndex: 1, months: 0 })).toBe(0);
  });

  it('refuses negative or fractional months and a negative life index', () => {
    expect(() => co2SavedByLife(sixty, { category: 'e_bike', lifeIndex: 1, months: -1 })).toThrow(
      RangeError
    );
    expect(() => co2SavedByLife(sixty, { category: 'e_bike', lifeIndex: 1, months: 1.5 })).toThrow(
      RangeError
    );
    expect(() => co2SavedByLife(sixty, { category: 'e_bike', lifeIndex: -1, months: 1 })).toThrow(
      RangeError
    );
  });

  it('a refurbishment as costly as a new item saves nothing', () => {
    const method = co2Method({ ...factors, refurbishment_share_of_new: 1 }, sixty.designLifeMonths);
    expect(co2SavedByLife(method, { category: 'e_bike', lifeIndex: 1, months: 30 })).toBe(0);
  });
});

describe('gramsToKg', () => {
  it('rounds once, half up, to whole kilograms', () => {
    expect(gramsToKg(0)).toBe(0);
    expect(gramsToKg(499.999)).toBe(0);
    expect(gramsToKg(500)).toBe(1);
    expect(gramsToKg(29_040)).toBe(29);
    expect(gramsToKg(58_080)).toBe(58);
  });
});

describe('co2SavedForAsset', () => {
  it('sums the later lives and counts every earlier life, the first included, as design life used', () => {
    const result = co2SavedForAsset(sixty, {
      category: 'e_bike',
      lives: [{ months: 40 }, { months: 15 }, { months: 15 }],
    });
    // Life 1 uses months 40–55 (15 months); life 2 has only 5 of the 60 left.
    expect(result.perLifeGrams[0]).toBe(0);
    expect(result.perLifeGrams[1]).toBeCloseTo((EBIKE_NET_GRAMS * 15) / 60, 6);
    expect(result.perLifeGrams[2]).toBeCloseTo((EBIKE_NET_GRAMS * 5) / 60, 6);
    expect(result.totalGrams).toBeCloseTo((EBIKE_NET_GRAMS * 20) / 60, 6);
    expect(result.totalKg).toBe(48); // 48.4
  });

  it('an item with no lives, or only its first, has saved nothing', () => {
    expect(co2SavedForAsset(sixty, { category: 'laptop', lives: [] }).totalKg).toBe(0);
    expect(co2SavedForAsset(sixty, { category: 'laptop', lives: [{ months: 30 }] }).totalKg).toBe(
      0
    );
  });

  it('rounds the total once, not each life: three lives of 0.4 kg add up to 1 kg, not 0', () => {
    // 145.2 kg × 1/360 per month ≈ 0.403 kg: use a 360-month design life.
    const long = co2Method(factors, { e_bike: 360, laptop: 360, farm_machine: 360 });
    const result = co2SavedForAsset(long, {
      category: 'e_bike',
      lives: [{ months: 1 }, { months: 1 }, { months: 1 }, { months: 1 }],
    });
    expect(result.perLifeKg).toEqual([0, 0, 0, 0]);
    expect(result.totalKg).toBe(1); // 1.21 kg
  });
});

describe('fleetImpact', () => {
  it('totals per category and overall, the overall being the sum of the category rows', () => {
    const impact = fleetImpact(sixty, [
      { category: 'e_bike', lives: [{ months: 24 }, { months: 30 }] }, // 72.6 kg
      { category: 'e_bike', lives: [{ months: 24 }] }, // first life only
      { category: 'laptop', lives: [{ months: 36 }, { months: 12 }] }, // 58.08 kg
    ]);
    expect(impact.perCategory).toEqual([
      { category: 'e_bike', assetsWithLaterLife: 1, kg: 73 },
      { category: 'laptop', assetsWithLaterLife: 1, kg: 58 },
      { category: 'farm_machine', assetsWithLaterLife: 0, kg: 0 },
    ]);
    expect(impact.totalKg).toBe(131);
    expect(impact.assetsWithLaterLife).toBe(2);
  });

  it('an empty fleet has saved nothing', () => {
    const impact = fleetImpact(sixty, []);
    expect(impact.totalKg).toBe(0);
    expect(impact.perCategory.every((row) => row.kg === 0)).toBe(true);
  });
});

describe('the data pack', () => {
  let packFactors: Co2Factors;
  beforeAll(async () => {
    packFactors = await loadCo2Factors();
  });

  it('every category has a design life and a footprint', () => {
    for (const category of ['e_bike', 'laptop', 'farm_machine'] as const) {
      expect(DESIGN_LIFE_MONTHS[category]).toBeGreaterThan(0);
      expect(packFactors.manufacturing_new_kg[category]).toBeGreaterThan(0);
    }
  });

  it('card 10: ebike-008, two past lives and a 24-month third life, has saved 58 kg', async () => {
    const assets = await loadAssets();
    const ebike = assets.find((asset) => asset.id === 'ebike-008');
    expect(ebike?.previous_lives).toBe(2);

    const method = co2Method(packFactors);
    // The two past lives have no dates in the data pack: each counts the assumed term.
    const past = Array.from({ length: ebike!.previous_lives }, () => ({
      months: ASSUMED_PAST_LIFE_MONTHS,
    }));
    const before = co2SavedForAsset(method, { category: 'e_bike', lives: past });
    // 165 kg × 0.88 = 145.2 kg over 120 months = 1.21 kg a month; life 2 of 24 months.
    expect(before.perLifeKg).toEqual([0, 29]);
    expect(before.totalKg).toBe(29);

    const after = co2SavedForAsset(method, {
      category: 'e_bike',
      lives: [...past, { months: 24 }],
    });
    expect(after.perLifeKg).toEqual([0, 29, 29]);
    expect(after.totalGrams).toBeCloseTo(58_080, 6);
    expect(after.totalKg).toBe(58);
  });
});
