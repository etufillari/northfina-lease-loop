// CO₂ avoided by reuse (Smart Problem 7, D-036). Pure: the factors, the curves and the item at the
// start of its extra life all come in as arguments.
//
// An extra life (the second, third, …) stands in for part of a new item. How large a part is
// the item's remaining-value share: what it is worth at the start of that life as a share of a
// new one, from the data pack's own residual formula (age curve × condition × usage). A nearly
// worn-out item stands in for little of a new one, so it avoids little. That share of the new
// item's manufacturing is avoided, less the refurbishment's footprint on it (the data's 12 %).
import type { AssetCategory, AssetCondition, Co2Factors, ResidualCurves } from '@/data/schemas';
import { curvePercent, usageAdjustmentPercent } from './market-value';
import { roundHalfUp } from './money';

/** The item as it is handed to the lessee at the start of an extra life. */
export interface ReusedItem {
  category: AssetCategory;
  ageMonths: number;
  condition: AssetCondition;
  usageValue: number;
}

export interface AvoidedCo2 {
  /** kg CO₂e to make one new item of the category. */
  manufacturingKg: number;
  /** Share of a new item's manufacturing footprint that refurbishing costs (0..1). */
  refurbishmentShare: number;
  /** What the item is worth at the start of the life, as a share of a new one (0..1). */
  valueShare: number;
  /** Whole kilograms, rounded once (D-036). */
  avoidedKg: number;
}

/**
 * The item's remaining-value share: curve(age) × condition multiplier × usage adjustment, the
 * residual formula without the price. 1 for a new, unused item at age 0.
 */
export function remainingValueShare(curves: ResidualCurves, item: ReusedItem): number {
  const percent = curvePercent(curves.curves[item.category], item.ageMonths);
  const condition = curves.condition_multiplier[item.condition];
  const usage = 1 + usageAdjustmentPercent(curves, item.category, item.usageValue) / 100;
  return (percent / 100) * condition * usage;
}

/**
 * CO₂ avoided by one extra life: manufacturing × (1 − refurbishment share) × remaining-value
 * share, rounded once to whole kilograms. A new item at age 0 gets the data's hint formula in
 * full; the more worn the item, the less it counts.
 */
export function avoidedByExtraLife(
  factors: Co2Factors,
  curves: ResidualCurves,
  item: ReusedItem
): AvoidedCo2 {
  const manufacturingKg = factors.manufacturing_new_kg[item.category];
  if (manufacturingKg === undefined) {
    throw new RangeError(`no manufacturing footprint for ${item.category}`);
  }
  const refurbishmentShare = factors.refurbishment_share_of_new;
  const valueShare = remainingValueShare(curves, item);
  const avoidedKg = roundHalfUp(manufacturingKg * (1 - refurbishmentShare) * valueShare);
  return { manufacturingKg, refurbishmentShare, valueShare, avoidedKg };
}

/** Totals add the already-rounded lives, so a total always equals the sum of its lines. */
export function sumAvoidedKg(lives: readonly number[]): number {
  return lives.reduce((sum, kg) => sum + kg, 0);
}
