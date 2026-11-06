// The market value of a used item, read from data/residual-curves.json exactly as its
// `how_to_use` says: net list price at the first lease × curve(age in months) × condition
// multiplier × usage adjustment.
//
// - The curve: linear interpolation between the two points around the age; before the first
//   point the first value, beyond the last point the last value is held.
// - The usage adjustment: `percent_per_step` for every whole `step` of usage (1 800 km is one
//   step of 1 000 km), never beyond `max_total_percent`. The unit must be the category's.
// - Rounding (D1): every factor is turned into an exact integer (the curve percent as a
//   fraction of basis points, the condition multiplier in millionths, the usage adjustment in
//   basis points), the product is taken in BigInt, and the one division rounds half up to the
//   cent. Nothing is rounded in between.
import type { AssetCategory, AssetCondition, ResidualCurves, UsageUnit } from '@/data/schemas';
import { factorToMillionths, percentToBasisPoints, roundHalfUpDivBig } from '../money-math';

type CurvePoint = readonly [number, number];
type UsageRule = ResidualCurves['usage_adjustment'][AssetCategory];
export type Usage = { unit: UsageUnit; value: number };

/** A percent in basis points as an exact fraction: 62.5 % is 6250 / 1, 62.25 % is 74 700 / 12. */
export type CurvePercent = { numerator: number; denominator: number };

export type MarketValueInput = {
  /** Net list price of one unit at its first lease. */
  listPriceCents: number;
  category: AssetCategory;
  /** D11: whole months, `ageInMonths`. */
  ageMonths: number;
  condition: AssetCondition;
  usage: Usage;
};

export type MarketValue = {
  valueCents: number;
  ageMonths: number;
  /** For the page only, e.g. 62.5; the value uses the exact fraction. */
  curvePercent: number;
  conditionMultiplier: number;
  usageSteps: number;
  /** For the page only, e.g. −2. */
  usageAdjustmentPercent: number;
};

function signedBasisPoints(percent: number): number {
  const magnitude = percentToBasisPoints(Math.abs(percent));
  return percent < 0 ? -magnitude : magnitude;
}

/** The curve at `ageMonths`, interpolated linearly, the last value held beyond the last point. */
export function curvePercent(points: readonly CurvePoint[], ageMonths: number): CurvePercent {
  if (!Number.isSafeInteger(ageMonths) || ageMonths < 0) {
    throw new RangeError(`ageMonths must be a whole number ≥ 0, got ${ageMonths}`);
  }
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) throw new RangeError('a residual curve needs at least one point');
  if (ageMonths <= first[0]) return { numerator: percentToBasisPoints(first[1]), denominator: 1 };
  if (ageMonths >= last[0]) return { numerator: percentToBasisPoints(last[1]), denominator: 1 };
  const upper = sorted.findIndex(([age]) => age >= ageMonths);
  const [a1, p1] = sorted[upper]!;
  const [a0, p0] = sorted[upper - 1]!;
  const bp0 = percentToBasisPoints(p0);
  const bp1 = percentToBasisPoints(p1);
  if (a1 === ageMonths) return { numerator: bp1, denominator: 1 };
  return { numerator: bp0 * (a1 - a0) + (bp1 - bp0) * (ageMonths - a0), denominator: a1 - a0 };
}

/** The usage adjustment in basis points (−200 = −2 %), whole steps only, capped. */
export function usageAdjustment(
  rule: UsageRule,
  usage: Usage
): { steps: number; basisPoints: number } {
  if (usage.unit !== rule.unit) {
    throw new RangeError(`usage is in ${usage.unit}, the curve counts ${rule.unit}`);
  }
  if (!Number.isSafeInteger(usage.value) || usage.value < 0) {
    throw new RangeError(`usage must be a whole number ≥ 0, got ${usage.value}`);
  }
  const steps = Math.floor(usage.value / rule.step);
  // No step is 0, never −0 (0 × −200): the page would print "−0 %" after a new battery (D83).
  const uncapped = steps === 0 ? 0 : steps * signedBasisPoints(rule.percent_per_step);
  const cap = signedBasisPoints(rule.max_total_percent);
  const basisPoints = cap < 0 ? Math.max(uncapped, cap) : Math.min(uncapped, cap);
  return { steps, basisPoints };
}

const BP = 10_000n;
const MILLION = 1_000_000n;

/** The market value of one unit by the curve, the condition and the usage. */
export function marketValueCents(input: MarketValueInput, curves: ResidualCurves): MarketValue {
  const { listPriceCents, category, ageMonths, condition, usage } = input;
  if (!Number.isSafeInteger(listPriceCents) || listPriceCents < 0) {
    throw new RangeError(`listPriceCents must be whole cents ≥ 0, got ${listPriceCents}`);
  }
  const points = curves.curves[category];
  const rule = curves.usage_adjustment[category];
  const multiplier = curves.condition_multiplier[condition];
  if (!points || !rule || multiplier === undefined) {
    throw new RangeError(`the residual curves have no ${category} / ${condition} entry`);
  }

  const curve = curvePercent(points, ageMonths);
  const conditionMillionths = factorToMillionths(multiplier);
  const usageAdj = usageAdjustment(rule, usage);
  const usageBasisPoints = Math.max(0, 10_000 + usageAdj.basisPoints);

  const numerator =
    BigInt(listPriceCents) *
    BigInt(curve.numerator) *
    BigInt(conditionMillionths) *
    BigInt(usageBasisPoints);
  const denominator = BigInt(curve.denominator) * BP * MILLION * BP;

  return {
    valueCents: Number(roundHalfUpDivBig(numerator, denominator)),
    ageMonths,
    curvePercent: Math.round(curve.numerator / curve.denominator) / 100,
    conditionMultiplier: multiplier,
    usageSteps: usageAdj.steps,
    usageAdjustmentPercent: usageAdj.basisPoints / 100,
  };
}
