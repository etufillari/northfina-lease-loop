// Pure domain logic for end-of-term options:
// 1. Buyout settlement calculation (Spine step 6)
// 2. Residual market value / relist pricing (Spine step 7 & Smart Problem #3)
// 3. Second-life waiting-list matchmaking (Spine step 7 & Smart Problem #3)
// 4. Circular CO2 impact calculation (Smart Problem #7)
//
// Rounding rules (RULES.md, ARCHITECTURE.md §6.1):
// All monetary amounts are integer euro cents and every rate is an integer (basis points,
// parts per million). Each derived amount is computed as one exact ratio and rounded once,
// half up (./rounding). No floating-point money.
// Avoided CO2 is counted in whole grams, rounded once; kg is only for display.
import type {
  Asset,
  AssetCategory,
  AssetCondition,
  CoefficientTable,
  Co2Factors,
  PriceList,
  ResidualCurves,
  SecondLifeRequest,
  UsageUnit,
  VatRates,
} from '@/data/schemas';
import { monthlyFactorFor, monthlyNetRentFor } from './coefficient';
import { listPriceOn } from './price-list';
import { fractionToBp, percentToBp, roundRatio, toWholeNumber } from './rounding';
import { priceLine } from './schedule';
import { vatRateOn } from './vat';

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

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
  const line = priceLine(input.buyoutNetCents, input.asOf, input.vatRates);

  return {
    buyoutNetCents: input.buyoutNetCents,
    vatRatePercent: vat.ratePercent,
    vatCents: line.vatCents,
    grossCents: line.grossCents,
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

  const curve = curvePercentRatio(curvePoints, input.ageMonths);
  const conditionBp = fractionToBp(input.residualCurves.condition_multiplier[input.condition] ?? 1);

  const usageConfig = input.residualCurves.usage_adjustment[input.category];
  let usageBp = 10_000;
  if (usageConfig && input.usage.value > 0) {
    const steps = Math.floor(input.usage.value / usageConfig.step);
    const nominalBp = steps * percentToBp(usageConfig.percent_per_step);
    // max_total_percent is negative (e.g. −20 %), so the larger number is the cap.
    usageBp = 10_000 + Math.max(percentToBp(usageConfig.max_total_percent), nominalBp);
  }

  // price × (curve % / 100) × (condition bp / 10 000) × (usage bp / 10 000), one rounding.
  return roundRatio(
    BigInt(input.firstListPriceCents) *
      curve.num *
      BigInt(conditionBp) *
      BigInt(Math.max(0, usageBp)),
    curve.den * 100n * 10_000n * 10_000n
  );
}

/**
 * The residual curve at a whole-month age as an exact ratio `num / den` in percent:
 * linear between points, the first value before the curve, the last value after it.
 */
function curvePercentRatio(
  points: readonly (readonly [number, number])[],
  ageMonths: number
): { num: bigint; den: bigint } {
  if (!Number.isInteger(ageMonths) || ageMonths < 0) {
    throw new RangeError(`ageMonths must be a non-negative integer, got ${ageMonths}`);
  }
  if (points.length === 0) throw new RangeError('Residual curve must have at least one point');
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (ageMonths <= first[0]) return { num: BigInt(toWholeNumber(first[1])), den: 1n };
  if (ageMonths >= last[0]) return { num: BigInt(toWholeNumber(last[1])), den: 1n };
  const i = points.findIndex((p, k) => k < points.length - 1 && ageMonths <= points[k + 1]![0]);
  const [x0, y0] = points[i]!;
  const [x1, y1] = points[i + 1]!;
  const dx = toWholeNumber(x1 - x0);
  return {
    num: BigInt(toWholeNumber(y0) * dx + (ageMonths - x0) * toWholeNumber(y1 - y0)),
    den: BigInt(dx),
  };
}

export type WaitingListMatch = {
  request: SecondLifeRequest;
  monthlyNetRentCents: number;
  rank: number;
};

export type WaitingListExclusionReason =
  | 'condition_too_low'
  | 'deadline_passed'
  | 'over_budget'
  | 'below_minimum'
  | 'above_maximum'
  | 'unknown_term'
  | 'not_financeable';

export type WaitingListExclusion = {
  request: SecondLifeRequest;
  reason: WaitingListExclusionReason;
  /** Rent at their preferred term, when it could be priced (set for `over_budget`). */
  monthlyNetRentCents?: number;
};

export type ExcludedWaitingListCandidate = WaitingListExclusion;

export type SecondLifeMatchEvaluation = {
  matches: WaitingListMatch[];
  excluded: ExcludedWaitingListCandidate[];
};

export type WaitingListRanking = {
  candidates: WaitingListMatch[];
  excluded: WaitingListExclusion[];
};

export type WaitingListInput = {
  category: AssetCategory;
  condition: AssetCondition;
  relistPriceCents: number;
  demand: readonly SecondLifeRequest[];
  asOf: string;
  coefficientTable: CoefficientTable;
};

/**
 * Ranks every waiting-list entry in the item's category (data/second-life-demand.json).
 * Each entry is a candidate or excluded with a reason, checked in this order:
 * - item condition >= entry's min_condition, else `condition_too_low`
 * - needed_by >= asOf, else `deadline_passed`
 * - the relist price fits a band at their term, else the band reason (`below_minimum`, …)
 * - monthly net rent at their preferred term <= their budget, else `over_budget`
 *
 * Tie-breaking: earliest needed_by first, then earlier signup. There is no signup date,
 * so file order is signup order.
 */
export function rankWaitingList(input: WaitingListInput): WaitingListRanking {
  const assetRank = CONDITION_RANKS[input.condition] ?? 0;
  const eligible: { request: SecondLifeRequest; monthlyNetRentCents: number; fileIndex: number }[] =
    [];
  const excluded: WaitingListExclusion[] = [];

  input.demand.forEach((request, fileIndex) => {
    if (request.category !== input.category) return;

    if (assetRank < (CONDITION_RANKS[request.min_condition] ?? 0)) {
      excluded.push({ request, reason: 'condition_too_low' });
      return;
    }
    if (request.needed_by < input.asOf) {
      excluded.push({ request, reason: 'deadline_passed' });
      return;
    }
    const factor = monthlyFactorFor(
      input.coefficientTable,
      input.relistPriceCents,
      request.preferred_term_months
    );
    if (!factor.ok) {
      excluded.push({ request, reason: factor.reason });
      return;
    }
    const monthlyNetRentCents = monthlyNetRentFor(input.relistPriceCents, factor.factor);
    if (monthlyNetRentCents > request.max_monthly_net_rent_cents) {
      excluded.push({ request, reason: 'over_budget', monthlyNetRentCents });
      return;
    }
    eligible.push({ request, monthlyNetRentCents, fileIndex });
  });

  eligible.sort((a, b) => {
    const dateCmp = a.request.needed_by.localeCompare(b.request.needed_by);
    return dateCmp !== 0 ? dateCmp : a.fileIndex - b.fileIndex;
  });

  return {
    candidates: eligible.map((item, index) => ({
      request: item.request,
      monthlyNetRentCents: item.monthlyNetRentCents,
      rank: index + 1,
    })),
    excluded,
  };
}

/** The ranked candidates only. See `rankWaitingList` for the excluded entries and why. */
export function matchSecondLifeWaitingList(input: WaitingListInput): WaitingListMatch[] {
  return rankWaitingList(input).candidates;
}

/**
 * Evaluates all waiting-list entries in `demand` for the asset's category, returning both
 * ranked eligible matches and excluded candidates with their exclusion reason.
 */
export function evaluateSecondLifeCandidates(input: WaitingListInput): SecondLifeMatchEvaluation {
  const ranking = rankWaitingList(input);
  return {
    matches: ranking.candidates,
    excluded: ranking.excluded,
  };
}

/**
 * Computes whole calendar months elapsed between `startIso` (`YYYY-MM-DD`) and `endIso`
 * (`YYYY-MM-DD`), floored at 0.
 */
export function monthsBetweenIso(startIso: string, endIso: string): number {
  const startMatch = ISO_DATE_PATTERN.exec(startIso);
  if (!startMatch) {
    throw new RangeError(`startIso must look like YYYY-MM-DD, got "${startIso}"`);
  }
  const endMatch = ISO_DATE_PATTERN.exec(endIso);
  if (!endMatch) {
    throw new RangeError(`endIso must look like YYYY-MM-DD, got "${endIso}"`);
  }

  const startMonths = Number(startMatch[1]) * 12 + (Number(startMatch[2]) - 1);
  const endMonths = Number(endMatch[1]) * 12 + (Number(endMatch[2]) - 1);
  return Math.max(0, endMonths - startMonths);
}

export type SecondLifeValuation = {
  firstLeaseDate: string;
  firstListPriceCents: number;
  currentNewListPriceCents: number | null;
  ageMonths: number;
  curvePercent: number;
  relistPriceCents: number;
  customerSavingsCents: number;
  avoidedCo2Kg: number;
  matches: WaitingListMatch[];
  excluded: ExcludedWaitingListCandidate[];
  canRelist: boolean;
  cannotRelistReason?: 'condition_too_low' | 'below_minimum';
};

/**
 * Computes the complete second-life valuation, matchmaking, and circular impact for a
 * returned or multi-life asset as of `asOf` (ARCHITECTURE.md §9).
 *
 * Seeded assets with `previous_lives > 0` and no recorded `first_lease_date` use
 * `${model_year}-01-01` and the earliest price list in `priceLists`.
 */
export function deriveAssetSecondLifeValuation(input: {
  asset: Pick<
    Asset,
    | 'id'
    | 'category'
    | 'model_year'
    | 'condition'
    | 'usage'
    | 'previous_lives'
    | 'relist_price_cents'
    | 'first_lease_date'
    | 'first_list_price_cents'
  > & { status?: Asset['status'] };
  priceLists: readonly PriceList[];
  residualCurves: ResidualCurves;
  coefficientTable: CoefficientTable;
  secondLifeDemand: readonly SecondLifeRequest[];
  co2Factors: Co2Factors;
  asOf: string;
}): SecondLifeValuation {
  const {
    asset,
    priceLists,
    residualCurves,
    coefficientTable,
    secondLifeDemand,
    co2Factors,
    asOf,
  } = input;

  const firstLeaseDate =
    asset.first_lease_date ?? `${String(asset.model_year).padStart(4, '0')}-01-01`;
  const earliestList = [...priceLists].sort((a, b) => a.version - b.version)[0];
  const firstListPriceCents = asset.first_list_price_cents ?? earliestList?.prices[asset.id] ?? 0;

  const currentList = listPriceOn(priceLists, asset.id, asOf);
  const currentNewListPriceCents = currentList.ok ? currentList.priceCents : null;

  const ageMonths = monthsBetweenIso(firstLeaseDate, asOf);
  const curvePoints = residualCurves.curves[asset.category];
  if (!curvePoints) {
    throw new Error(`No residual curve found for category "${asset.category}"`);
  }
  const curvePercent = interpolateResidualCurve(curvePoints, ageMonths);

  // Returned assets always recalculate residual market value as of `asOf` so a stale
  // relist_price_cents from a previous life is never reused when relisting for a third life.
  const computedMarketValueCents = calculateResidualMarketValue({
    firstListPriceCents,
    ageMonths,
    category: asset.category,
    condition: asset.condition,
    usage: asset.usage,
    residualCurves,
  });
  const relistPriceCents =
    asset.status && asset.status !== 'returned' && asset.relist_price_cents != null
      ? asset.relist_price_cents
      : computedMarketValueCents;

  const referenceNewPrice = currentNewListPriceCents ?? firstListPriceCents;
  const customerSavingsCents = Math.max(0, referenceNewPrice - relistPriceCents);

  const avoidedCo2Kg = calculateAvoidedCo2({
    category: asset.category,
    co2Factors,
    relistPriceCents,
    firstListPriceCents,
  });

  const { matches, excluded } = evaluateSecondLifeCandidates({
    category: asset.category,
    condition: asset.condition,
    relistPriceCents,
    demand: secondLifeDemand,
    asOf,
    coefficientTable,
  });

  const lowestBandMinCents = Math.min(...coefficientTable.bands.map((b) => b.min_financed_cents));

  // Who may lease it (ARCHITECTURE.md §9): at least `good`, unless a matched waiting-list entry
  // accepts `fair`. A `poor` item is never relisted. Relist price must also meet minimum band.
  if (asset.condition === 'poor' || (asset.condition === 'fair' && matches.length === 0)) {
    return {
      firstLeaseDate,
      firstListPriceCents,
      currentNewListPriceCents,
      ageMonths,
      curvePercent,
      relistPriceCents,
      customerSavingsCents,
      avoidedCo2Kg,
      matches,
      excluded,
      canRelist: false,
      cannotRelistReason: 'condition_too_low',
    };
  }

  if (relistPriceCents < lowestBandMinCents) {
    return {
      firstLeaseDate,
      firstListPriceCents,
      currentNewListPriceCents,
      ageMonths,
      curvePercent,
      relistPriceCents,
      customerSavingsCents,
      avoidedCo2Kg,
      matches,
      excluded,
      canRelist: false,
      cannotRelistReason: 'below_minimum',
    };
  }

  return {
    firstLeaseDate,
    firstListPriceCents,
    currentNewListPriceCents,
    ageMonths,
    curvePercent,
    relistPriceCents,
    customerSavingsCents,
    avoidedCo2Kg,
    matches,
    excluded,
    canRelist: true,
  };
}

export type AvoidedCo2Input = {
  category: AssetCategory;
  co2Factors: Co2Factors;
  relistPriceCents: number;
  firstListPriceCents: number;
};

/**
 * CO2 avoided by giving an item a second life, in whole grams, rounded once (half up):
 *   manufacturing_new_kg × 1000 × (1 − refurbishment_share_of_new) × valueRatio
 * where valueRatio = relistPrice / firstListPrice, capped at 1 (a second life never
 * avoids more than one new item) and floored at 5 % (a working item still avoids some).
 * A nearly worn-out item is worth less, so it saves less.
 */
export function avoidedCo2Grams(input: AvoidedCo2Input): number {
  if (input.firstListPriceCents <= 0) return 0;
  const grams = BigInt(
    toWholeNumber((input.co2Factors.manufacturing_new_kg[input.category] ?? 0) * 1000)
  );
  const reuseBp = BigInt(10_000 - fractionToBp(input.co2Factors.refurbishment_share_of_new));
  const first = BigInt(input.firstListPriceCents);
  // Ratio floor 5 % = 1/20, cap 1: clamp the numerator between first/20 and first.
  let relist = BigInt(input.relistPriceCents) * 20n;
  const floor = first;
  const cap = first * 20n;
  if (relist < floor) relist = floor;
  if (relist > cap) relist = cap;
  return roundRatio(grams * reuseBp * relist, 10_000n * first * 20n);
}

/** Avoided CO2 in kg with one decimal, for display (24 539 g → 24.5). */
export function calculateAvoidedCo2(input: AvoidedCo2Input): number {
  return roundRatio(BigInt(avoidedCo2Grams(input)), 100n) / 10;
}
