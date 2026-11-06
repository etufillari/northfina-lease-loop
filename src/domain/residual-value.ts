import type { Asset, ResidualCurves } from '@/data/schemas';
import { decimalToScaled } from './money-arithmetic';

export type ResidualValueInput = {
  asset: Pick<Asset, 'category' | 'condition' | 'usage'>;
  /** Whole months from the original reference; imported assumptions must be labelled by callers. */
  ageMonths: number | null;
  /** Original net reference price (recorded or labelled v1 assumption), not today's resale price. */
  originalPriceCents: number | null;
  rules: ResidualCurves;
};

export type ResidualValueResult =
  | {
      ok: true;
      marketValueCents: number;
      ageMonths: number;
      originalPriceCents: number;
      ageBracket: { from: [number, number]; to: [number, number] };
      conditionMultiplier: number;
      usageSteps: number;
      usageReductionPercent: number;
    }
  | { ok: false; reason: 'age_unknown' | 'original_price_unknown' | 'usage_unit_mismatch' };

function requireWhole(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be non-negative safe integer units`);
  }
}

/**
 * Linear age interpolation; hold endpoint values outside the curve.
 * Wear uses completed usage steps, capped at the supplied maximum reduction.
 * Multiply all factors as exact rational integers, then round half-up ONCE to cents.
 * Refurbishment costs are separate: this estimates market value, not an asking price.
 */
export function residualValue(input: ResidualValueInput): ResidualValueResult {
  const { asset, rules, ageMonths, originalPriceCents } = input;
  if (ageMonths === null) return { ok: false, reason: 'age_unknown' };
  if (originalPriceCents === null) return { ok: false, reason: 'original_price_unknown' };
  requireWhole(ageMonths, 'age');
  requireWhole(originalPriceCents, 'original price');
  requireWhole(asset.usage.value, 'usage');

  const wear = rules.usage_adjustment[asset.category];
  if (wear.unit !== asset.usage.unit) return { ok: false, reason: 'usage_unit_mismatch' };
  requireWhole(wear.step, 'usage step');
  if (wear.step === 0 || wear.percent_per_step > 0 || wear.max_total_percent > 0) {
    throw new RangeError('usage rules must describe depreciation with a positive step');
  }
  const curve = rules.curves[asset.category];
  if (curve.length === 0) throw new RangeError('residual curve must not be empty');
  for (const [index, point] of curve.entries()) {
    requireWhole(point[0], 'curve age');
    if (point[1] < 0 || point[1] > 100 || (index > 0 && point[0] <= curve[index - 1]![0])) {
      throw new RangeError('residual points must have increasing ages and 0..100 percentages');
    }
  }
  let from = curve[0]!;
  let to = from;
  for (const point of curve) {
    if (point[0] <= ageMonths) {
      from = point;
      to = point;
    } else {
      to = ageMonths < from[0] ? from : point;
      break;
    }
  }

  const scale = 1_000_000n;
  const span = BigInt(to[0] - from[0] || 1);
  const elapsed = BigInt(from === to ? 0 : ageMonths - from[0]);
  const fromPercent = BigInt(decimalToScaled(from[1], 6));
  const toPercent = BigInt(decimalToScaled(to[1], 6));
  const ageNumerator = fromPercent * span + (toPercent - fromPercent) * elapsed;
  const conditionMultiplier = rules.condition_multiplier[asset.condition];
  if (conditionMultiplier > 1) throw new RangeError('condition multiplier must be at most one');
  const condition = BigInt(decimalToScaled(conditionMultiplier, 6));
  const usageSteps = Number(BigInt(asset.usage.value) / BigInt(wear.step));
  const cap = BigInt(decimalToScaled(-wear.max_total_percent, 6));
  if (cap > 100n * scale) throw new RangeError('usage reduction must not exceed 100 percent');
  const rawReduction = BigInt(usageSteps) * BigInt(decimalToScaled(-wear.percent_per_step, 6));
  const reduction = rawReduction < cap ? rawReduction : cap;
  const numerator =
    BigInt(originalPriceCents) * ageNumerator * condition * (100n * scale - reduction);
  const denominator = span * 100n * scale * scale * 100n * scale;
  const marketValueCents = Number((2n * numerator + denominator) / (2n * denominator));
  requireWhole(marketValueCents, 'market value');
  return {
    ok: true,
    marketValueCents,
    ageMonths,
    originalPriceCents,
    ageBracket: { from: [...from], to: [...to] },
    conditionMultiplier,
    usageSteps,
    usageReductionPercent: Number(reduction) / Number(scale),
  };
}
