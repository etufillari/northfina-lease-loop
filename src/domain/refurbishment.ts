import type { AssetCategory, AssetCondition, RefurbishmentCosts, UsageUnit } from '@/data/schemas';

const conditionOrder: readonly AssetCondition[] = ['poor', 'fair', 'good', 'like_new', 'new'];
const readyCondition = 'good' satisfies AssetCondition;

export type RefurbishmentPlanInput = Readonly<{
  category: AssetCategory;
  condition: AssetCondition;
  usage: Readonly<{ unit: UsageUnit; value: number }>;
  usageSinceLastService?: Readonly<{ unit: UsageUnit; value: number }>;
}>;

export type PlannedRefurbishmentWork = Readonly<{
  code: string;
  kind: 'condition_upgrade' | 'fixed';
  costCents: number;
  mandatory: boolean;
  resetsUsage: boolean;
  fromCondition?: AssetCondition;
  toCondition?: AssetCondition;
}>;

export type RefurbishmentPlan = Readonly<{
  targetCondition: typeof readyCondition;
  work: readonly PlannedRefurbishmentWork[];
  totalCostCents: number;
  mandatoryCostCents: number;
}>;

export type RefurbishmentPlanResult =
  | {
      ok: false;
      reason:
        | 'invalid_usage'
        | 'invalid_usage_unit'
        | 'missing_service_baseline'
        | 'invalid_service_baseline'
        | 'unsupported_refurbishment_rule'
        | 'condition_upgrade_unavailable'
        | 'cost_overflow';
    }
  | { ok: true; value: RefurbishmentPlan };

export function planRefurbishment(
  input: RefurbishmentPlanInput,
  costs: RefurbishmentCosts
): RefurbishmentPlanResult {
  if (!Number.isSafeInteger(input.usage.value) || input.usage.value < 0) {
    return { ok: false, reason: 'invalid_usage' };
  }
  const expectedUnit: Record<AssetCategory, UsageUnit> = {
    e_bike: 'km',
    laptop: 'battery_cycles',
    farm_machine: 'engine_hours',
  };
  if (input.usage.unit !== expectedUnit[input.category]) {
    return { ok: false, reason: 'invalid_usage_unit' };
  }

  if (input.category === 'farm_machine') {
    const baseline = input.usageSinceLastService;
    if (!baseline) return { ok: false, reason: 'missing_service_baseline' };
    if (
      baseline.unit !== 'engine_hours' ||
      !Number.isSafeInteger(baseline.value) ||
      baseline.value < 0 ||
      baseline.value > input.usage.value
    ) {
      return { ok: false, reason: 'invalid_service_baseline' };
    }
  }

  const work: PlannedRefurbishmentWork[] = [];
  let condition = input.condition;
  while (conditionOrder.indexOf(condition) < conditionOrder.indexOf(readyCondition)) {
    const nextCondition = conditionOrder[conditionOrder.indexOf(condition) + 1];
    if (!nextCondition) return { ok: false, reason: 'condition_upgrade_unavailable' };
    const code = `${condition}->${nextCondition}`;
    const costCents = costs[input.category].condition_upgrades[code];
    if (costCents === undefined) return { ok: false, reason: 'condition_upgrade_unavailable' };
    work.push({
      code: `condition:${code}`,
      kind: 'condition_upgrade',
      costCents,
      mandatory: true,
      resetsUsage: false,
      fromCondition: condition,
      toCondition: nextCondition,
    });
    condition = nextCondition;
  }

  for (const fixed of costs[input.category].fixed) {
    const applicability = fixedWorkCost(input, fixed.id, fixed.cost_cents);
    if (!applicability.ok) return applicability;
    if (applicability.costCents === undefined) continue;
    work.push({
      code: `fixed:${fixed.id}`,
      kind: 'fixed',
      costCents: applicability.costCents,
      mandatory: fixed.mandatory_before_next_lease ?? false,
      resetsUsage: fixed.resets_usage ?? false,
    });
  }

  const totalCostCents = work.reduce((total, item) => total + item.costCents, 0);
  const mandatoryCostCents = work.reduce(
    (total, item) => (item.mandatory ? total + item.costCents : total),
    0
  );
  if (!Number.isSafeInteger(totalCostCents) || !Number.isSafeInteger(mandatoryCostCents)) {
    return { ok: false, reason: 'cost_overflow' };
  }

  return {
    ok: true,
    value: {
      targetCondition: readyCondition,
      work,
      totalCostCents,
      mandatoryCostCents,
    },
  };
}

function fixedWorkCost(
  input: RefurbishmentPlanInput,
  workId: string,
  baseCostCents: number
): { ok: true; costCents?: number } | { ok: false; reason: 'unsupported_refurbishment_rule' } {
  if (!Number.isSafeInteger(baseCostCents) || baseCostCents < 0) {
    return { ok: false, reason: 'unsupported_refurbishment_rule' };
  }

  if (workId === 'safety_inspection' || workId === 'certified_data_wipe') {
    return { ok: true, costCents: baseCostCents };
  }
  if (workId === 'battery_replacement') {
    const threshold = input.category === 'e_bike' ? 15_000 : 500;
    return {
      ok: true,
      costCents: input.usage.value >= threshold ? baseCostCents : undefined,
    };
  }
  if (workId === 'major_service' && input.category === 'farm_machine') {
    const baseline = input.usageSinceLastService;
    if (!baseline) return { ok: false, reason: 'unsupported_refurbishment_rule' };
    const hoursSinceService = input.usage.value - baseline.value;
    const startedServiceIntervals = Math.ceil(hoursSinceService / 1_000);
    return { ok: true, costCents: startedServiceIntervals * baseCostCents };
  }
  return { ok: false, reason: 'unsupported_refurbishment_rule' };
}
