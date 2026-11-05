// Market value of a used item (data/residual-curves.json): original net list price × the
// age curve (linear interpolation, last value held) × condition multiplier × a capped usage
// adjustment. Age counts from 1 Jan of the model year (docs/DECISIONS.md). The percentages
// are plain numbers; the one money rounding happens half-up at the very end.
import type { AssetCategory, AssetCondition, ResidualCurves } from '@/data/schemas';

/** Whole months from 1 Jan of `modelYear` to `asOfIso` (never negative). */
export function ageInMonths(modelYear: number, asOfIso: string): number {
  const year = Number(asOfIso.slice(0, 4));
  const month = Number(asOfIso.slice(5, 7));
  return Math.max(0, (year - modelYear) * 12 + (month - 1));
}

/** The curve's percent at `ageMonths`: linear between points, last value held beyond. */
export function curvePercentAt(
  points: ReadonlyArray<readonly [number, number]>,
  ageMonths: number
): number {
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  const first = sorted[0]!;
  if (ageMonths <= first[0]) return first[1];
  for (let i = 1; i < sorted.length; i++) {
    const [age, percent] = sorted[i]!;
    if (ageMonths <= age) {
      const [previousAge, previousPercent] = sorted[i - 1]!;
      const share = (ageMonths - previousAge) / (age - previousAge);
      return previousPercent + (percent - previousPercent) * share;
    }
  }
  return sorted[sorted.length - 1]![1];
}

/** The capped usage adjustment in percent (a negative number, e.g. -20). */
export function usageAdjustmentPercent(
  curves: ResidualCurves,
  category: AssetCategory,
  usageValue: number
): number {
  const adjustment = curves.usage_adjustment[category];
  if (!adjustment) return 0;
  const steps = Math.floor(usageValue / adjustment.step);
  // + 0 normalises the -0 that 0 steps × a negative percent produces.
  return Math.max(adjustment.max_total_percent, steps * adjustment.percent_per_step) + 0;
}

export function marketValueCents(
  input: {
    originalListPriceCents: number;
    category: AssetCategory;
    condition: AssetCondition;
    usageValue: number;
    ageMonths: number;
  },
  curves: ResidualCurves
): number {
  const points = curves.curves[input.category];
  if (!points) throw new RangeError(`no residual curve for ${input.category}`);
  const agePercent = curvePercentAt(points, input.ageMonths);
  const conditionMultiplier = curves.condition_multiplier[input.condition] ?? 1;
  const usagePercent = usageAdjustmentPercent(curves, input.category, input.usageValue);

  const value =
    input.originalListPriceCents *
    (agePercent / 100) *
    conditionMultiplier *
    (1 + usagePercent / 100);
  // The single rounding to whole cents, half-up.
  return Math.floor(value + 0.5);
}
