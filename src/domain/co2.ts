// CO2 avoided by a second (or third) life (docs/DECISIONS.md): refurbishing costs a fraction
// of making a new item, and a nearly worn-out item saves less, so the saving is scaled by
// the remaining-value fraction. Not money — plain kg numbers for the passport page.
import type { AssetCategory, AssetCondition, Co2Factors, ResidualCurves } from '@/data/schemas';
import { marketValueCents } from './residual';

/**
 * kg CO2e avoided by starting one more life instead of manufacturing a new item.
 * `remainingValueFraction` is market value / original price, clamped to 0..1.
 */
export function co2AvoidedKg(
  input: { category: AssetCategory; remainingValueFraction: number },
  factors: Co2Factors
): number {
  const manufacturing = factors.manufacturing_new_kg[input.category] ?? 0;
  const fraction = Math.min(1, Math.max(0, input.remainingValueFraction));
  return manufacturing * (1 - factors.refurbishment_share_of_new) * fraction;
}

/**
 * Stand-in for the missing usage history of an item that came into the fleet already used
 * (data pack `previous_lives` ≥ 1) but has no recorded earlier life: its earlier life is taken
 * to have lasted this many months. Used only in the calculation, never stored on the asset.
 */
export const UNRECORDED_PRIOR_LIFE_MONTHS = 6;

/**
 * kg CO2e avoided when a lease starts the current life of an item that arrived used with no
 * recorded history: the remaining value is priced at UNRECORDED_PRIOR_LIFE_MONTHS of age.
 * A first life (`previousLives` 0) avoids nothing. Rounded to 0.1 kg, like a recorded life.
 */
export function unrecordedLifeCo2Kg(
  input: {
    category: AssetCategory;
    condition: AssetCondition;
    usageValue: number;
    previousLives: number;
    originalListPriceCents: number;
  },
  curves: ResidualCurves,
  factors: Co2Factors
): number {
  if (input.previousLives < 1 || input.originalListPriceCents <= 0) return 0;
  const value = marketValueCents(
    {
      originalListPriceCents: input.originalListPriceCents,
      category: input.category,
      condition: input.condition,
      usageValue: input.usageValue,
      ageMonths: UNRECORDED_PRIOR_LIFE_MONTHS,
    },
    curves
  );
  const kg = co2AvoidedKg(
    { category: input.category, remainingValueFraction: value / input.originalListPriceCents },
    factors
  );
  return Math.round(kg * 10) / 10;
}
