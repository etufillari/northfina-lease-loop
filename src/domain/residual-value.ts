import type { AssetCategory, AssetCondition, ResidualCurves } from '@/data/schemas';

export type ResidualValueInput = {
  originalListPriceCents: number;
  category: AssetCategory;
  condition: AssetCondition;
  usageValue: number;
  ageMonths: number;
  curves: ResidualCurves;
};

export type ResidualValueResult =
  | {
      ok: true;
      marketValueCents: number;
      curvePercent: number;
      conditionMultiplier: number;
      usageAdjustmentPercent: number;
    }
  | {
      ok: false;
      reason: 'curve_not_found' | 'condition_multiplier_not_found' | 'usage_adjustment_not_found';
    };

function assertCents(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative whole number of cents, got ${value}`);
  }
}

function assertWholeNumber(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative whole number, got ${value}`);
  }
}

function curvePercentAt(points: readonly [number, number][], ageMonths: number): number {
  const first = points[0];
  if (!first) throw new RangeError('A residual curve must contain at least one point');
  if (ageMonths <= first[0]) return first[1];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (!previous || !current) continue;
    if (ageMonths <= current[0]) {
      const fraction = (ageMonths - previous[0]) / (current[0] - previous[0]);
      return previous[1] + (current[1] - previous[1]) * fraction;
    }
  }

  return points.at(-1)?.[1] ?? first[1];
}

function cappedUsageAdjustmentPercent(
  usageValue: number,
  percentPerStep: number,
  step: number,
  maxTotalPercent: number
): number {
  const rawValue = Math.floor(usageValue / step) * percentPerStep;
  const raw = rawValue === 0 ? 0 : rawValue;
  return maxTotalPercent < 0 ? Math.max(raw, maxTotalPercent) : Math.min(raw, maxTotalPercent);
}

/**
 * Calculates the current net market value from the residual data pack.
 * Percentages are applied to the original net list price and the final euro-cent
 * result is rounded once to the nearest cent.
 */
export function residualValueFor(input: ResidualValueInput): ResidualValueResult {
  assertCents(input.originalListPriceCents, 'originalListPriceCents');
  assertWholeNumber(input.usageValue, 'usageValue');
  assertWholeNumber(input.ageMonths, 'ageMonths');

  const curve = input.curves.curves[input.category];
  if (!curve) return { ok: false, reason: 'curve_not_found' };

  const conditionMultiplier = input.curves.condition_multiplier[input.condition];
  if (conditionMultiplier === undefined) {
    return { ok: false, reason: 'condition_multiplier_not_found' };
  }

  const usageAdjustment = input.curves.usage_adjustment[input.category];
  if (!usageAdjustment) return { ok: false, reason: 'usage_adjustment_not_found' };

  const curvePercent = curvePercentAt(curve, input.ageMonths);
  const usageAdjustmentPercent = cappedUsageAdjustmentPercent(
    input.usageValue,
    usageAdjustment.percent_per_step,
    usageAdjustment.step,
    usageAdjustment.max_total_percent
  );
  const usageMultiplier = Math.max(0, 1 + usageAdjustmentPercent / 100);
  const marketValueCents = Math.round(
    input.originalListPriceCents * (curvePercent / 100) * conditionMultiplier * usageMultiplier
  );

  return {
    ok: true,
    marketValueCents,
    curvePercent,
    conditionMultiplier,
    usageAdjustmentPercent,
  };
}
