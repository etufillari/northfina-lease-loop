// Refurbishment plan for a returned item (data/refurbishment-costs.json, D-032).
// Pure: the cost data comes in as an argument. All amounts are whole cents from the data,
// multiplied by whole counts, so nothing here ever needs rounding.

import type { AssetCategory, AssetCondition, RefurbishmentCosts, UsageUnit } from '@/data/schemas';

/** Worst to best. Upgrades go one step at a time along this list. */
export const CONDITION_ORDER: readonly AssetCondition[] = [
  'poor',
  'fair',
  'good',
  'like_new',
  'new',
];

export const conditionRank = (condition: AssetCondition): number =>
  CONDITION_ORDER.indexOf(condition);

export interface ReturnedItem {
  category: AssetCategory;
  condition: AssetCondition;
  usage: { unit: UsageUnit; value: number };
}

export interface RefurbishStep {
  /** The fixed cost's id (e.g. "battery_replacement") or the upgrade key (e.g. "fair->good"). */
  id: string;
  kind: 'fixed' | 'upgrade';
  /** How many times it is done: 1, or the number of started service intervals. */
  quantity: number;
  costCents: number;
}

export type RefurbishPlan =
  | {
      ok: true;
      steps: RefurbishStep[];
      totalCents: number;
      /** The condition-upgrade part of the total. The fixed part depends only on the item. */
      upgradeCents: number;
      conditionAfter: AssetCondition;
      usageAfter: { unit: UsageUnit; value: number };
    }
  | { ok: false; reason: 'condition_unreachable' };

/**
 * The condition a returned item must reach for a waiting-list entry with this minimum.
 * The data says an item must reach `good` unless the entry accepts `fair`, so `fair` is the
 * floor: an entry that would take `poor` still gets at least a `fair` item.
 */
export function leasableTargetFor(minCondition: AssetCondition): AssetCondition {
  return conditionRank(minCondition) < conditionRank('fair') ? 'fair' : minCondition;
}

/** How many times a fixed cost applies to this usage reading (0 = not at all). */
function timesApplies(when: string, usage: ReturnedItem['usage']): number {
  if (when === 'always') return 1;

  const checkUnit = (unit: string | undefined) => {
    if (unit !== usage.unit) {
      throw new Error(`Rule "${when}" is in ${unit}, but the usage unit is ${usage.unit}`);
    }
  };

  const threshold = /^usage\.value >= (\d+) (\w+)$/.exec(when);
  if (threshold) {
    checkUnit(threshold[2]);
    return usage.value >= Number(threshold[1]) ? 1 : 0;
  }

  // We have no service history, so all usage counts as "since last service" (D-032).
  const perStarted = /^per started (\d+) (\w+) since last service$/.exec(when);
  if (perStarted) {
    checkUnit(perStarted[2]);
    return Math.ceil(usage.value / Number(perStarted[1]));
  }

  throw new Error(`Unknown refurbishment rule: "${when}"`);
}

/**
 * What it takes to get a returned item ready for its next lease at `target` condition:
 * every fixed cost whose rule applies (in data order), then one upgrade per condition step.
 * An item already at or above the target is never downgraded. Returns
 * `condition_unreachable` when the data has no upgrade step on the way (e.g. like_new->new).
 */
export function refurbishPlan(
  costs: RefurbishmentCosts,
  item: ReturnedItem,
  target: AssetCondition
): RefurbishPlan {
  const rules = costs[item.category];
  const steps: RefurbishStep[] = [];
  let resetsUsage = false;

  for (const fixed of rules.fixed) {
    const quantity = timesApplies(fixed.when, item.usage);
    if (quantity === 0) continue;
    steps.push({ id: fixed.id, kind: 'fixed', quantity, costCents: quantity * fixed.cost_cents });
    resetsUsage ||= fixed.resets_usage === true;
  }

  let upgradeCents = 0;
  for (let rank = conditionRank(item.condition); rank < conditionRank(target); rank += 1) {
    const key = `${CONDITION_ORDER[rank]}->${CONDITION_ORDER[rank + 1]}`;
    const cost = rules.condition_upgrades[key];
    if (cost === undefined) return { ok: false, reason: 'condition_unreachable' };
    steps.push({ id: key, kind: 'upgrade', quantity: 1, costCents: cost });
    upgradeCents += cost;
  }

  const better = conditionRank(item.condition) > conditionRank(target);
  return {
    ok: true,
    steps,
    totalCents: steps.reduce((sum, step) => sum + step.costCents, 0),
    upgradeCents,
    conditionAfter: better ? item.condition : target,
    usageAfter: { unit: item.usage.unit, value: resetsUsage ? 0 : item.usage.value },
  };
}
