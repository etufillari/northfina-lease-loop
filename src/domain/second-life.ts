// Spine step 7: a returned item's second life. What it is worth now, what refurbishing it
// costs, what to lease it for next, and who on the waiting list it suits.
//
// Rules (from data/residual-curves.json, data/refurbishment-costs.json and DATA.md):
// - Market value = net list price at its first lease × age curve × condition × usage.
//   Curves are linear between their points and hold the last value after the last point.
// - Age: we only know the model year, so an item counts as first leased on 1 July of that year
//   (the middle of the year); age is whole months from then.
// - Usage: every full `step` of usage changes the value by `percent_per_step`, capped at
//   `max_total_percent`. A battery replacement resets the usage counter.
// - Refurbishment = condition upgrades (one step at a time, poor → fair → good → like new) plus
//   the fixed jobs whose `when` applies. Nothing can be upgraded to "new".
// - The suggested second-life price is the market value after refurbishment, rounded to whole
//   euros (a list price people can read). Money is integer cents throughout.
// - An item must reach at least "good" to be leased again, unless someone on the waiting list
//   accepts "fair".
import type {
  AssetCategory,
  AssetCondition,
  RefurbishmentCosts,
  ResidualCurves,
  SecondLifeRequest,
} from '@/data/schemas';
import { multiplyCents } from './money';

/** Worst first, so a higher index is a better condition. */
export const CONDITIONS: readonly AssetCondition[] = ['poor', 'fair', 'good', 'like_new', 'new'];

export function conditionRank(condition: AssetCondition): number {
  return CONDITIONS.indexOf(condition);
}

/** Linear interpolation on `[age_months, percent]` points; holds the ends. */
export function residualPercent(points: readonly [number, number][], ageMonths: number): number {
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  const first = sorted[0];
  const last = sorted.at(-1);
  if (!first || !last) throw new RangeError('a residual curve needs at least one point');
  if (ageMonths <= first[0]) return first[1];
  if (ageMonths >= last[0]) return last[1];
  for (let i = 1; i < sorted.length; i++) {
    const [x1, y1] = sorted[i - 1] as [number, number];
    const [x2, y2] = sorted[i] as [number, number];
    if (ageMonths <= x2) return y1 + ((ageMonths - x1) / (x2 - x1)) * (y2 - y1);
  }
  return last[1];
}

/** Whole months from 1 July of the model year to the given ISO date (never negative). */
export function ageInMonths(modelYear: number, today: string): number {
  const [year, month] = today.split('-').map(Number) as [number, number];
  return Math.max(0, (year - modelYear) * 12 + (month - 7));
}

/** The usage adjustment in percent (negative): full steps × percent, capped. */
export function usagePercent(
  curves: ResidualCurves,
  category: AssetCategory,
  usage: number
): number {
  const rule = curves.usage_adjustment[category];
  if (!rule) return 0;
  const steps = Math.floor(usage / rule.step);
  return Math.max(rule.max_total_percent, steps * rule.percent_per_step);
}

export type ValueInput = {
  originalNetCents: number;
  category: AssetCategory;
  ageMonths: number;
  condition: AssetCondition;
  usage: number;
};

/** What the item is worth on the market, in net cents, rounded once. */
export function marketValueCents(input: ValueInput, curves: ResidualCurves): number {
  const curve = curves.curves[input.category] ?? [];
  const percent = residualPercent(curve, input.ageMonths);
  const conditionFactor = curves.condition_multiplier[input.condition] ?? 0;
  const usageFactor = 1 + usagePercent(curves, input.category, input.usage) / 100;
  return multiplyCents(input.originalNetCents, (percent / 100) * conditionFactor * usageFactor);
}

export type RefurbishmentStep = {
  id: string;
  costCents: number;
  /** Why it is needed: a condition upgrade, always, above a usage, per service interval. */
  reason: 'upgrade' | 'always' | 'usage' | 'service' | 'mandatory';
  resetsUsage: boolean;
};

export type RefurbishmentPlan =
  | { ok: true; steps: RefurbishmentStep[]; costCents: number; usageAfter: number }
  | { ok: false; reason: 'cannot_downgrade' | 'cannot_reach_new' };

/** The jobs a refurbishment from `before` to `after` needs, and what they cost. */
export function refurbishmentPlan(
  input: { category: AssetCategory; before: AssetCondition; after: AssetCondition; usage: number },
  costs: RefurbishmentCosts
): RefurbishmentPlan {
  if (conditionRank(input.after) < conditionRank(input.before)) {
    return { ok: false, reason: 'cannot_downgrade' };
  }
  if (input.after === 'new' && input.before !== 'new')
    return { ok: false, reason: 'cannot_reach_new' };
  const table = costs[input.category];
  const steps: RefurbishmentStep[] = [];

  for (let rank = conditionRank(input.before); rank < conditionRank(input.after); rank++) {
    const key = `${CONDITIONS[rank]}->${CONDITIONS[rank + 1]}`;
    const cost = table?.condition_upgrades[key];
    if (cost === undefined) return { ok: false, reason: 'cannot_reach_new' };
    steps.push({ id: key, costCents: cost, reason: 'upgrade', resetsUsage: false });
  }

  for (const job of table?.fixed ?? []) {
    const atLeast = /usage\.value >= (\d+)/.exec(job.when);
    const perService = /per started (\d+)/.exec(job.when);
    if (job.when === 'always') {
      steps.push({
        id: job.id,
        costCents: job.cost_cents,
        reason: job.mandatory_before_next_lease ? 'mandatory' : 'always',
        resetsUsage: job.resets_usage ?? false,
      });
    } else if (atLeast && input.usage >= Number(atLeast[1])) {
      steps.push({
        id: job.id,
        costCents: job.cost_cents,
        reason: 'usage',
        resetsUsage: job.resets_usage ?? false,
      });
    } else if (perService && input.usage > 0) {
      // We don't track the last service, so every started interval of the total counts.
      const intervals = Math.ceil(input.usage / Number(perService[1]));
      steps.push({
        id: job.id,
        costCents: job.cost_cents * intervals,
        reason: 'service',
        resetsUsage: false,
      });
    }
  }

  return {
    ok: true,
    steps,
    costCents: steps.reduce((sum, step) => sum + step.costCents, 0),
    usageAfter: steps.some((step) => step.resetsUsage) ? 0 : input.usage,
  };
}

/** Rounds a net price to whole euros: the suggested second-life list price. */
export function roundToEuros(cents: number): number {
  return Math.round(cents / 100) * 100;
}

/** Whether the item may be leased again in `condition`: good or better, or fair if wanted. */
export function leasableCondition(
  condition: AssetCondition,
  category: AssetCategory,
  demand: readonly SecondLifeRequest[],
  today: string
): boolean {
  if (conditionRank(condition) >= conditionRank('good')) return true;
  return (
    condition === 'fair' &&
    demand.some(
      (r) => r.category === category && r.min_condition === 'fair' && r.needed_by >= today
    )
  );
}

export type WaitingListFit = {
  request: SecondLifeRequest;
  fits: boolean;
  /** Why it doesn't fit (empty when it does). */
  problems: ('condition' | 'budget' | 'deadline' | 'price')[];
  /** The net monthly rent at their preferred term, or null if it can't be priced. */
  monthlyNetCents: number | null;
};

/**
 * Everyone waiting for this kind of item, best match first: those it fits before those it
 * doesn't, then the earliest deadline, then who signed up first (their place on the list).
 */
export function rankWaitingList(
  item: { category: AssetCategory; condition: AssetCondition },
  monthlyNetFor: (termMonths: number) => number | null,
  demand: readonly SecondLifeRequest[],
  today: string
): WaitingListFit[] {
  return demand
    .map((request, order) => ({ request, order }))
    .filter(({ request }) => request.category === item.category)
    .map(({ request, order }) => {
      const monthlyNetCents = monthlyNetFor(request.preferred_term_months);
      const problems: WaitingListFit['problems'] = [];
      if (conditionRank(item.condition) < conditionRank(request.min_condition))
        problems.push('condition');
      if (monthlyNetCents === null) problems.push('price');
      else if (monthlyNetCents > request.max_monthly_net_rent_cents) problems.push('budget');
      if (request.needed_by < today) problems.push('deadline');
      return { fit: { request, fits: problems.length === 0, problems, monthlyNetCents }, order };
    })
    .sort(
      (a, b) =>
        Number(b.fit.fits) - Number(a.fit.fits) ||
        a.fit.request.needed_by.localeCompare(b.fit.request.needed_by) ||
        a.order - b.order
    )
    .map(({ fit }) => fit);
}
