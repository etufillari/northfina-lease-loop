// What a used item is worth on the market (data/residual-curves.json): net list price at its
// first lease × age curve × condition multiplier × usage adjustment. Early exit (D-033) uses it.
import type { AssetCategory, AssetCondition, ResidualCurves } from '@/data/schemas';
import { roundHalfUp } from './money';

export type CurvePoint = readonly [ageMonths: number, percent: number];

export interface ValuedItem {
  category: AssetCategory;
  /** Net list price when the item was first leased. */
  listPriceCents: number;
  ageMonths: number;
  condition: AssetCondition;
  usageValue: number;
}

/**
 * The curve's percent at `ageMonths`: linear between points, the last value beyond the last
 * point (as the data pack says). Points are sorted by age in the data.
 */
export function curvePercent(curve: readonly CurvePoint[], ageMonths: number): number {
  if (!Number.isInteger(ageMonths) || ageMonths < 0) {
    throw new RangeError(`ageMonths must be a whole number ≥ 0, got ${ageMonths}`);
  }
  for (let i = 1; i < curve.length; i++) {
    const [fromAge, fromPercent] = curve[i - 1]!;
    const [toAge, toPercent] = curve[i]!;
    if (ageMonths <= toAge) {
      if (ageMonths <= fromAge) return fromPercent;
      return fromPercent + ((toPercent - fromPercent) * (ageMonths - fromAge)) / (toAge - fromAge);
    }
  }
  return curve[curve.length - 1]![1];
}

/** Usage counts in full steps (9 800 km is 9 steps of 1 000), capped at the category's limit. */
function usagePercent(curves: ResidualCurves, item: ValuedItem): number {
  const rule = curves.usage_adjustment[item.category];
  const steps = Math.floor(item.usageValue / rule.step);
  return Math.max(steps * rule.percent_per_step, rule.max_total_percent);
}

/** Market value in cents, rounded once (D-005). */
export function marketValue(curves: ResidualCurves, item: ValuedItem): number {
  const percent = curvePercent(curves.curves[item.category], item.ageMonths);
  const condition = curves.condition_multiplier[item.condition];
  const usage = 1 + usagePercent(curves, item) / 100;
  return roundHalfUp((item.listPriceCents * percent * condition * usage) / 100);
}
