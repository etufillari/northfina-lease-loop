// Pure domain logic for end-of-term options:
// 1. Buyout settlement calculation (Spine step 6)
// 2. Residual market value / relist pricing (Spine step 7 & Smart Problem #3)
// 3. Second-life waiting-list matchmaking (Spine step 7 & Smart Problem #3)
// 4. Circular CO2 impact calculation (Smart Problem #7)
//
// Rounding rules (RULES.md):
// All monetary amounts are integer euro cents. Intermediate float math (curves, factors)
// rounds once to the nearest integer cent with Math.round(cents).
// Avoided CO2 is rounded once to one decimal place (e.g. 145.2 kg).
import type {
  AssetCategory,
  AssetCondition,
  CoefficientTable,
  Co2Factors,
  ResidualCurves,
  SecondLifeRequest,
  UsageUnit,
  VatRates,
} from '@/data/schemas';
import { monthlyFactorFor } from './coefficient';
import { vatRateOn } from './contract-pricing';

const CONDITION_RANKS: Record<AssetCondition, number> = {
  poor: 1,
  fair: 2,
  good: 3,
  like_new: 4,
  new: 5,
};

export type BuyoutSettlement = {
  buyoutNetCents: number;
  vatRatePercent: number;
  vatCents: number;
  grossCents: number;
  fictionalVat: boolean;
};

/**
 * Calculates the buyout settlement invoice details as of `asOf`.
 * VAT follows the rate valid on the settlement date.
 */
export function calculateBuyoutSettlement(input: {
  buyoutNetCents: number;
  asOf: string;
  vatRates: VatRates;
}): BuyoutSettlement {
  if (!Number.isInteger(input.buyoutNetCents) || input.buyoutNetCents < 0) {
    throw new RangeError(
      `buyoutNetCents must be a non-negative integer, got ${input.buyoutNetCents}`
    );
  }

  const vat = vatRateOn(input.vatRates, input.asOf);
  if (!vat.ok) {
    throw new Error(`No VAT rate found for date ${input.asOf}`);
  }

  const vatCents = Math.round(input.buyoutNetCents * (vat.ratePercent / 100));
  const grossCents = input.buyoutNetCents + vatCents;

  return {
    buyoutNetCents: input.buyoutNetCents,
    vatRatePercent: vat.ratePercent,
    vatCents,
    grossCents,
    fictionalVat: vat.fictional,
  };
}

/**
 * Linearly interpolates a residual curve of [ageMonths, percent] points.
 * For ages beyond the last point, holds the final value.
 */
export function interpolateResidualCurve(
  points: readonly (readonly [number, number])[],
  ageMonths: number
): number {
  if (points.length === 0) {
    throw new RangeError('Residual curve must have at least one point');
  }
  if (ageMonths < 0) {
    throw new RangeError(`ageMonths must be non-negative, got ${ageMonths}`);
  }

  if (ageMonths <= points[0]![0]) {
    return points[0]![1];
  }

  const lastPoint = points[points.length - 1]!;
  if (ageMonths >= lastPoint[0]) {
    return lastPoint[1];
  }

  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[i + 1]!;
    if (ageMonths >= x0 && ageMonths <= x1) {
      if (x1 === x0) return y0;
      const progress = (ageMonths - x0) / (x1 - x0);
      return y0 + progress * (y1 - y0);
    }
  }

  return lastPoint[1];
}

/**
 * Calculates the residual market value / relist price of a used asset.
 *
 * Formula from data/residual-curves.json and ARCHITECTURE.md §9:
 * firstListPrice x curve(age) x conditionMultiplier x (1 + usageAdjustmentPercent / 100)
 */
export function calculateResidualMarketValue(input: {
  firstListPriceCents: number;
  ageMonths: number;
  category: AssetCategory;
  condition: AssetCondition;
  usage: { unit: UsageUnit; value: number };
  residualCurves: ResidualCurves;
}): number {
  if (!Number.isInteger(input.firstListPriceCents) || input.firstListPriceCents < 0) {
    throw new RangeError(
      `firstListPriceCents must be a non-negative integer, got ${input.firstListPriceCents}`
    );
  }

  const curvePoints = input.residualCurves.curves[input.category];
  if (!curvePoints) {
    throw new Error(`No residual curve found for category "${input.category}"`);
  }

  const curvePercent = interpolateResidualCurve(curvePoints, input.ageMonths);
  const conditionMultiplier = input.residualCurves.condition_multiplier[input.condition] ?? 1.0;

  const usageConfig = input.residualCurves.usage_adjustment[input.category];
  let usageMultiplier = 1.0;
  if (usageConfig && input.usage.value > 0) {
    const steps = Math.floor(input.usage.value / usageConfig.step);
    const nominalPercent = steps * usageConfig.percent_per_step;
    // max_total_percent is negative (e.g. -20%), so Math.max(-20, -36) = -20
    const clampedPercent = Math.max(usageConfig.max_total_percent, nominalPercent);
    usageMultiplier = 1 + clampedPercent / 100;
  }

  const rawValue =
    input.firstListPriceCents * (curvePercent / 100) * conditionMultiplier * usageMultiplier;

  return Math.round(rawValue);
}

export type WaitingListMatch = {
  request: SecondLifeRequest;
  monthlyNetRentCents: number;
  rank: number;
};

/**
 * Matches a returned asset to candidates waiting in data/second-life-demand.json.
 *
 * Requirements:
 * - Category must match.
 * - Asset condition >= candidate's min_condition.
 * - needed_by >= asOf.
 * - Monthly net rent at candidate's preferred_term_months <= max_monthly_net_rent_cents.
 *
 * Tie-breaking:
 * 1. Earliest needed_by date first.
 * 2. Earlier signup (original file order in demand array).
 */
export function matchSecondLifeWaitingList(input: {
  category: AssetCategory;
  condition: AssetCondition;
  relistPriceCents: number;
  demand: readonly SecondLifeRequest[];
  asOf: string;
  coefficientTable: CoefficientTable;
}): WaitingListMatch[] {
  const assetRank = CONDITION_RANKS[input.condition] ?? 0;

  const eligible: {
    request: SecondLifeRequest;
    monthlyNetRentCents: number;
    fileIndex: number;
  }[] = [];

  for (let idx = 0; idx < input.demand.length; idx += 1) {
    const req = input.demand[idx]!;

    if (req.category !== input.category) continue;

    const minRank = CONDITION_RANKS[req.min_condition] ?? 0;
    if (assetRank < minRank) continue;

    if (req.needed_by < input.asOf) continue;

    const factorResult = monthlyFactorFor(
      input.coefficientTable,
      input.relistPriceCents,
      req.preferred_term_months
    );
    if (!factorResult.ok) continue;

    const monthlyNetRentCents = Math.round(input.relistPriceCents * factorResult.factor);
    if (monthlyNetRentCents > req.max_monthly_net_rent_cents) continue;

    eligible.push({
      request: req,
      monthlyNetRentCents,
      fileIndex: idx,
    });
  }

  eligible.sort((a, b) => {
    const dateCmp = a.request.needed_by.localeCompare(b.request.needed_by);
    if (dateCmp !== 0) return dateCmp;
    return a.fileIndex - b.fileIndex;
  });

  return eligible.map((item, index) => ({
    request: item.request,
    monthlyNetRentCents: item.monthlyNetRentCents,
    rank: index + 1,
  }));
}

/**
 * Calculates avoided CO2 in kg from passing an item to a second life.
 *
 * Formula from data/co2-factors.json and ARCHITECTURE.md §9:
 * manufacturing_new_kg x (1 - refurbishment_share_of_new) x (relistPrice / firstListPrice)
 * Rounded to 1 decimal place.
 */
export function calculateAvoidedCo2(input: {
  category: AssetCategory;
  co2Factors: Co2Factors;
  relistPriceCents: number;
  firstListPriceCents: number;
}): number {
  if (input.firstListPriceCents <= 0) return 0;

  const newMfgKg = input.co2Factors.manufacturing_new_kg[input.category] ?? 0;
  const reuseFactor = 1 - input.co2Factors.refurbishment_share_of_new;
  const valueRatio = Math.min(
    1.0,
    Math.max(0.05, input.relistPriceCents / input.firstListPriceCents)
  );

  const avoidedKg = newMfgKg * reuseFactor * valueRatio;
  return Math.round(avoidedKg * 10) / 10;
}
