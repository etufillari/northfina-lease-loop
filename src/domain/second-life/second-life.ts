// What a used item is worth: first-lease price × age curve × condition × usage. Each factor
// becomes whole basis points first, and the product is rounded once, half up, at the end.
// BigInt carries the product, because three factors of 10 000 overflow a normal number.
import type { AssetLife } from '@/data/lease-schemas';
import type {
  Asset,
  AssetCategory,
  AssetCondition,
  CoefficientTable,
  ResidualCurves,
} from '@/data/schemas';
import { roundedDivide } from '../money';
import { downPaymentLimits } from '../pricing/pricing';

type AssetLifeFirstLease = Pick<AssetLife, 'started_on' | 'first_lease_price_cents'>;

const BASIS_POINTS_PER_WHOLE = 10_000;
const MONTHS_PER_YEAR = 12;

/** Whole months from one ISO date to a later one, and 0 if `to` is earlier. */
export function ageInMonths(from: string, to: string): number {
  const months = (date: string) =>
    Number(date.slice(0, 4)) * MONTHS_PER_YEAR + Number(date.slice(5, 7));
  const whole = months(to) - months(from) - (to.slice(8) < from.slice(8) ? 1 : 0);
  return Math.max(whole, 0);
}

/** The curve's percent at an age, as basis points. Straight lines between points. */
export function curveBasisPoints(
  points: ResidualCurves['curves'][AssetCategory],
  ageMonths: number
): number {
  const toBasisPoints = (percent: number) => Math.round(percent * 100);
  const [first] = points;
  if (!first) throw new RangeError('a residual curve needs at least one point');

  let previous = first;
  for (const point of points) {
    const [age, percent] = point;
    if (ageMonths <= age) {
      const [previousAge, previousPercent] = previous;
      if (age === previousAge) return toBasisPoints(percent);
      const span = age - previousAge;
      const start = toBasisPoints(previousPercent) * span;
      const change =
        (toBasisPoints(percent) - toBasisPoints(previousPercent)) * (ageMonths - previousAge);
      return roundedDivide(start + change, span);
    }
    previous = point;
  }
  return toBasisPoints(previous[1]);
}

/** What usage leaves of the value, as basis points. Only whole steps count, up to the cap. */
export function usageBasisPoints(
  adjustment: ResidualCurves['usage_adjustment'][AssetCategory],
  usageValue: number
): number {
  const steps = Math.floor(usageValue / adjustment.step);
  const percent = Math.max(steps * adjustment.percent_per_step, adjustment.max_total_percent);
  return BASIS_POINTS_PER_WHOLE + Math.round(percent * 100);
}

export type MarketValue = {
  market_value_cents: number;
  age_months: number;
  curve_basis_points: number;
  condition_basis_points: number;
  usage_basis_points: number;
};

export function marketValue(
  curves: ResidualCurves,
  item: {
    category: AssetCategory;
    condition: AssetCondition;
    usageValue: number;
    firstLeasePriceCents: number;
    ageMonths: number;
  }
): MarketValue {
  const curve = curves.curves[item.category];
  const adjustment = curves.usage_adjustment[item.category];
  const curvePoints = curveBasisPoints(curve, item.ageMonths);
  const conditionPoints = Math.round(curves.condition_multiplier[item.condition] * 10_000);
  const usagePoints = usageBasisPoints(adjustment, item.usageValue);

  const whole = BigInt(BASIS_POINTS_PER_WHOLE) ** 3n;
  const product =
    BigInt(item.firstLeasePriceCents) *
    BigInt(curvePoints) *
    BigInt(conditionPoints) *
    BigInt(usagePoints);

  return {
    market_value_cents: Number((product * 2n + whole) / (whole * 2n)),
    age_months: item.ageMonths,
    curve_basis_points: curvePoints,
    condition_basis_points: conditionPoints,
    usage_basis_points: usagePoints,
  };
}

/** The item's first lease: from its first recorded life, or the asset for an older item. */
export function firstLease(
  asset: Pick<Asset, 'first_leased_on' | 'first_lease_price_cents'>,
  firstLife: AssetLifeFirstLease | null
): { date: string; priceCents: number } | null {
  const date = firstLife?.started_on ?? asset.first_leased_on;
  const priceCents = firstLife?.first_lease_price_cents ?? asset.first_lease_price_cents;
  return date === undefined || date === null || priceCents === undefined || priceCents === null
    ? null
    : { date, priceCents };
}

export type RelistProblem = 'condition_too_low' | 'below_minimum';

/**
 * Why an item cannot go back on the market, or `null` if it can. It must reach at least good
 * (data/refurbishment-costs.json). That file lets a waiting-list entry accept fair, which
 * belongs with matching, so for now fair is refused like poor.
 */
export function relistProblem(
  condition: AssetCondition,
  priceCents: number,
  table: CoefficientTable
): RelistProblem | null {
  if (condition === 'fair' || condition === 'poor') return 'condition_too_low';
  return downPaymentLimits(table, priceCents).ok ? null : 'below_minimum';
}
