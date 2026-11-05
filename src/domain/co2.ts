// CO2 avoided by a second (or third) life (docs/DECISIONS.md): refurbishing costs a fraction
// of making a new item, and a nearly worn-out item saves less, so the saving is scaled by
// the remaining-value fraction. Not money — plain kg numbers for the passport page.
import type { AssetCategory, Co2Factors } from '@/data/schemas';

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
