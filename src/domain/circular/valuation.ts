import type {
  Asset,
  ResidualCurves,
  SecondLifeRequest,
  CoefficientTable,
  Co2Factors,
} from '@/data/schemas';
import { isDateOnly } from '@/domain/lease-engine/calendar';
import { monthlyFactorFor } from '@/domain/coefficient';
import { decimalRatio, multiplyCents, roundRatio } from './money';
import { conditionOrder } from './refurbishment';

/** Jan1 model-year age is an explicit conservative proxy: the pack has no manufacture dates. */
export function assetAgeMonths(modelYear: number, asOf: string): number {
  if (!isDateOnly(asOf) || !Number.isInteger(modelYear)) throw new RangeError('Invalid age input');
  return Math.max(0, (Number(asOf.slice(0, 4)) - modelYear) * 12 + Number(asOf.slice(5, 7)) - 1);
}

/** Linear age interpolation; full usage steps; bounded wear. Round once after all factors. */
export function residualValue(
  asset: Asset,
  originalNetCents: number,
  ageMonths: number,
  rules: ResidualCurves
): number {
  if (
    !Number.isSafeInteger(originalNetCents) ||
    originalNetCents < 0 ||
    !Number.isInteger(ageMonths) ||
    ageMonths < 0
  )
    throw new RangeError('Invalid valuation');
  const curve = rules.curves[asset.category];
  const first = curve[0],
    last = curve[curve.length - 1];
  if (!first || !last) throw new RangeError('Empty curve');
  let left = first,
    right = first;
  if (ageMonths >= last[0]) left = right = last;
  else
    for (let i = 1; i < curve.length; i++) {
      const point = curve[i];
      if (point && point[0] >= ageMonths) {
        right = point;
        left = curve[i - 1] ?? first;
        break;
      }
    }
  const [ln, ld] = decimalRatio(left[1]);
  const [rn, rd] = decimalRatio(right[1]);
  const span = BigInt(Math.max(1, right[0] - left[0]));
  const offset = BigInt(left === right ? 0 : Math.max(0, ageMonths - left[0]));
  const ageN = ln * rd * (span - offset) + rn * ld * offset;
  const ageD = ld * rd * span * 100n;
  const [cn, cd] = decimalRatio(rules.condition_multiplier[asset.condition]);
  const wear = rules.usage_adjustment[asset.category];
  if (
    asset.usage.unit !== wear.unit ||
    !Number.isSafeInteger(asset.usage.value) ||
    asset.usage.value < 0
  )
    throw new RangeError('Invalid usage');
  const penalty = Math.min(
    Math.abs(wear.max_total_percent),
    Math.floor(asset.usage.value / wear.step) * Math.abs(wear.percent_per_step)
  );
  const [wn, wd] = decimalRatio(Math.max(0, 100 - penalty));
  return roundRatio(BigInt(originalNetCents) * ageN * cn * wn, ageD * cd * wd * 100n);
}

export function matchSecondLife(
  asset: Asset,
  netListCents: number,
  requests: readonly SecondLifeRequest[],
  table: CoefficientTable,
  availableOn: string
) {
  if (!isDateOnly(availableOn)) throw new RangeError('Invalid availability date');
  return requests
    .flatMap((request) => {
      if (
        request.category !== asset.category ||
        request.needed_by < availableOn ||
        conditionOrder.indexOf(asset.condition) < conditionOrder.indexOf(request.min_condition)
      )
        return [];
      const factor = monthlyFactorFor(table, netListCents, request.preferred_term_months);
      if (!factor.ok) return [];
      const monthlyNetCents = multiplyCents(netListCents, factor.factor);
      return monthlyNetCents <= request.max_monthly_net_rent_cents
        ? [
            {
              requestId: request.id,
              neededBy: request.needed_by,
              termMonths: request.preferred_term_months,
              monthlyNetCents,
              reason: 'FEASIBLE_EARLIEST_DEADLINE_THEN_ID',
            },
          ]
        : [];
    })
    .sort((a, b) => a.neededBy.localeCompare(b.neededBy) || a.requestId.localeCompare(b.requestId));
}

/** Fictional avoided manufacturing only; no double counting of commuting claims. */
export function impactGrams(asset: Asset, completedReuses: number, factors: Co2Factors): number {
  if (!Number.isInteger(completedReuses) || completedReuses < 0)
    throw new RangeError('Invalid reuse count');
  // Remaining-condition weighting is a conservative explicit assumption.
  const weight = asset.condition === 'poor' ? 0.25 : asset.condition === 'fair' ? 0.5 : 1;
  return (
    multiplyCents(
      factors.manufacturing_new_kg[asset.category] * 1000,
      (1 - factors.refurbishment_share_of_new) * weight
    ) * completedReuses
  );
}
