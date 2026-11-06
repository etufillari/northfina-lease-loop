// The CO2 a second or third life avoids (smart problem 7, decision D15).
//
// The method: making a new item emits its manufacturing footprint; refurbishing a returned one
// costs `refurbishment_share_of_new` of that. So a later life avoids
//   footprint × (1 − refurbishment share) × months of the life ÷ design life months,
// i.e. the net footprint spread evenly over the months the item is built to last, counted for
// the months that life actually used. The first life earns nothing (the item was made for it),
// and every life, the first included, uses up design life: once an item's lives add up to its
// design life, a further life earns nothing, because a worn-out item replaces no new one.
// This answers the challenge's question ("is the saving the same when an item was almost worn
// out?"): no, a short or late life earns a small share, never a whole footprint.
//
// Not counted: transport, use-phase emissions and the e-bike's avoided car kilometres (the
// usage in the data pack is a lifetime total, not per life). Money saved is in money-saved.ts
// (D80), by the same method.
//
// Rounding: every figure is computed in grams, unrounded, and rounded once, half up, to whole
// kilograms by `gramsToKg` where it is shown. The fleet total is the sum of the rounded
// category rows, so the breakdown on a page always adds up.
import type { AssetCategory, Co2Factors } from '@/data/schemas';

/**
 * The months each category is built to last. The data pack gives no design life, so these are
 * the team's assumptions (docs/decisions.md D15): an e-bike 10 years, a laptop 4 (the usual
 * manufacturer's footprint basis), a farm machine 12.
 */
export const DESIGN_LIFE_MONTHS: Readonly<Record<AssetCategory, number>> = {
  e_bike: 120,
  laptop: 48,
  farm_machine: 144,
};

/**
 * The months a past life counts when the data pack only says it happened (`previous_lives`)
 * and the event log has no dates for it: one 24-month lease, the middle of the price list's
 * terms. Shown on the passport as an estimate.
 */
export const ASSUMED_PAST_LIFE_MONTHS = 24;

/** The factors of the data pack and the design lives they are spread over. */
export type Co2Method = {
  factors: Co2Factors;
  designLifeMonths: Readonly<Record<AssetCategory, number>>;
};

export function co2Method(
  factors: Co2Factors,
  designLifeMonths: Readonly<Record<AssetCategory, number>> = DESIGN_LIFE_MONTHS
): Co2Method {
  return { factors, designLifeMonths };
}

export type LifeInput = {
  category: AssetCategory;
  /** 0 for the first life, 1 for the second, … */
  lifeIndex: number;
  /** Whole months the life lasted (or has lasted so far). */
  months: number;
  /** Months of design life the earlier lives already used; 0 when not given. */
  monthsUsedBefore?: number;
};

const assertWholeNonNegative = (name: string, value: number) => {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a whole number of at least 0, got ${value}`);
  }
};

/**
 * The months of a life that earn a saving: none for the first life, and at most what is left of
 * the design life. Shared with the money saved (money-saved.ts, D80).
 */
export function countedMonths(method: Co2Method, life: LifeInput): number {
  const usedBefore = life.monthsUsedBefore ?? 0;
  assertWholeNonNegative('lifeIndex', life.lifeIndex);
  assertWholeNonNegative('months', life.months);
  assertWholeNonNegative('monthsUsedBefore', usedBefore);
  if (life.lifeIndex === 0) return 0;
  const designLife = method.designLifeMonths[life.category];
  return Math.min(life.months, Math.max(0, designLife - usedBefore));
}

/** Grams of CO2e one life avoided, unrounded. 0 for the first life and past the design life. */
export function co2SavedByLife(method: Co2Method, life: LifeInput): number {
  const counted = countedMonths(method, life);
  if (counted === 0) return 0;
  const designLife = method.designLifeMonths[life.category];

  const footprintGrams = method.factors.manufacturing_new_kg[life.category] * 1000;
  const netGrams = footprintGrams * (1 - method.factors.refurbishment_share_of_new);
  return (netGrams * counted) / designLife;
}

/** The one rounding rule: grams to whole kilograms, half up. */
export function gramsToKg(grams: number): number {
  return Math.floor(grams / 1000 + 0.5);
}

/** One item as the counter reads it: its category and its lives in order, first life first. */
export type AssetLives = {
  category: AssetCategory;
  lives: readonly { months: number }[];
};

export type AssetCo2 = {
  /** Per life, in the order given, unrounded grams. */
  perLifeGrams: number[];
  /** Per life, each rounded to whole kg (for display; the total is not their sum). */
  perLifeKg: number[];
  totalGrams: number;
  /** The total rounded once. */
  totalKg: number;
};

/** The CO2 an item's later lives avoided; each life uses up the design life in turn. */
export function co2SavedForAsset(method: Co2Method, asset: AssetLives): AssetCo2 {
  const perLifeGrams: number[] = [];
  let monthsUsedBefore = 0;
  asset.lives.forEach((life, lifeIndex) => {
    perLifeGrams.push(
      co2SavedByLife(method, {
        category: asset.category,
        lifeIndex,
        months: life.months,
        monthsUsedBefore,
      })
    );
    monthsUsedBefore += life.months;
  });
  const totalGrams = perLifeGrams.reduce((sum, grams) => sum + grams, 0);
  return {
    perLifeGrams,
    perLifeKg: perLifeGrams.map(gramsToKg),
    totalGrams,
    totalKg: gramsToKg(totalGrams),
  };
}

export type CategoryImpact = {
  category: AssetCategory;
  /** Items with at least one life after their first. */
  assetsWithLaterLife: number;
  kg: number;
};

export type FleetImpact = {
  /** Every category, in the order of `designLifeMonths`, even an empty one. */
  perCategory: CategoryImpact[];
  assetsWithLaterLife: number;
  /** The sum of the category rows. */
  totalKg: number;
};

/** The CO2 the whole fleet's later lives avoided, per category and overall. */
export function fleetImpact(method: Co2Method, assets: readonly AssetLives[]): FleetImpact {
  const categories = Object.keys(method.designLifeMonths) as AssetCategory[];
  const perCategory = categories.map((category) => {
    let grams = 0;
    let assetsWithLaterLife = 0;
    for (const asset of assets) {
      if (asset.category !== category) continue;
      if (asset.lives.length > 1) assetsWithLaterLife += 1;
      grams += co2SavedForAsset(method, asset).totalGrams;
    }
    return { category, assetsWithLaterLife, kg: gramsToKg(grams) };
  });
  return {
    perCategory,
    assetsWithLaterLife: perCategory.reduce((sum, row) => sum + row.assetsWithLaterLife, 0),
    totalKg: perCategory.reduce((sum, row) => sum + row.kg, 0),
  };
}
