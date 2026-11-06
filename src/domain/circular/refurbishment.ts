import type { Asset, AssetCondition, RefurbishmentCosts } from '@/data/schemas';
export const conditionOrder: readonly AssetCondition[] = [
  'poor',
  'fair',
  'good',
  'like_new',
  'new',
];
export type WorkStep = { id: string; costCents: number; resetsUsage: boolean };
export type WorkPlan = {
  steps: WorkStep[];
  costCents: number;
  resultingCondition: AssetCondition;
  resultingUsage: number;
};

/** Explicit predicates for this data-pack policy; unknown work fails closed. */
export function planRefurbishment(
  asset: Asset,
  costs: RefurbishmentCosts,
  target: AssetCondition = 'good'
): WorkPlan {
  if (!Number.isSafeInteger(asset.usage.value) || asset.usage.value < 0)
    throw new RangeError('Invalid usage');
  const units = { e_bike: 'km', laptop: 'battery_cycles', farm_machine: 'engine_hours' };
  if (asset.usage.unit !== units[asset.category]) throw new RangeError('Invalid usage unit');
  const policy = costs[asset.category];
  const steps: WorkStep[] = [];
  const from = conditionOrder.indexOf(asset.condition),
    to = conditionOrder.indexOf(target);
  if (from < 0 || to < 0) throw new RangeError('Unknown condition');
  for (let i = from; i < to; i++) {
    const id = `${conditionOrder[i]}->${conditionOrder[i + 1]}`;
    const costCents = policy.condition_upgrades[id];
    if (costCents === undefined) throw new RangeError('Unsupported condition upgrade');
    steps.push({ id, costCents, resetsUsage: false });
  }
  for (const work of policy.fixed) {
    let count: number;
    if (work.id === 'safety_inspection' || work.id === 'certified_data_wipe') count = 1;
    else if (work.id === 'battery_replacement')
      count = asset.usage.value >= (asset.category === 'e_bike' ? 15000 : 500) ? 1 : 0;
    else if (work.id === 'major_service') count = Math.ceil(asset.usage.value / 1000);
    else throw new RangeError('Unsupported refurbishment rule');
    if (count > 0)
      steps.push({
        id: work.id,
        costCents: count * work.cost_cents,
        resetsUsage: work.resets_usage ?? false,
      });
  }
  const costCents = steps.reduce((total, step) => total + step.costCents, 0);
  if (!Number.isSafeInteger(costCents)) throw new RangeError('Cost overflow');
  return {
    steps,
    costCents,
    resultingCondition: from >= to ? asset.condition : target,
    resultingUsage: steps.some((step) => step.resetsUsage) ? 0 : asset.usage.value,
  };
}

export function requiredWorkComplete(plan: WorkPlan, completedIds: readonly string[]): boolean {
  return (
    new Set(completedIds).size === completedIds.length &&
    plan.steps.every((step) => completedIds.includes(step.id)) &&
    completedIds.every((id) => plan.steps.some((step) => step.id === id))
  );
}
