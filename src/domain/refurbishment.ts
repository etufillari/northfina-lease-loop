import {
  assetConditionSchema,
  type Asset,
  type AssetCondition,
  type RefurbishmentCosts,
} from '@/data/schemas';

const conditionOrder: AssetCondition[] = ['poor', 'fair', 'good', 'like_new', 'new'];

export type RefurbishmentLineItem = {
  id: string;
  description: string;
  quantity: number;
  unitCostCents: number;
  costCents: number;
  resetsUsage: boolean;
  mandatoryBeforeNextLease: boolean;
};

export type RefurbishmentQuote = {
  currentCondition: AssetCondition;
  targetCondition: AssetCondition;
  conditionUpgradeCents: number;
  fixedWork: RefurbishmentLineItem[];
  totalCostCents: number;
  usageAfterValue: number;
  usageReset: boolean;
};

export type RefurbishmentFailure =
  | { ok: false; reason: 'minimum_condition_required'; targetCondition: AssetCondition }
  | {
      ok: false;
      reason: 'target_condition_not_reachable';
      currentCondition: AssetCondition;
      targetCondition: AssetCondition;
    }
  | { ok: false; reason: 'unsupported_refurbishment_rule'; rule: string };

export type RefurbishmentResult = { ok: true; quote: RefurbishmentQuote } | RefurbishmentFailure;

type FixedCost = RefurbishmentCosts[Asset['category']]['fixed'][number];

function conditionIndex(condition: AssetCondition): number {
  return conditionOrder.indexOf(condition);
}

function parseThresholdRule(rule: string): { threshold: number; unit: string } | null {
  const match = /^usage\.value >= (\d+) ([a-z_]+)$/.exec(rule);
  if (!match) return null;
  return { threshold: Number(match[1]), unit: match[2] ?? '' };
}

function parsePerStartedRule(rule: string): { step: number; unit: string } | null {
  const match = /^per started (\d+) ([a-z_]+) since last service$/.exec(rule);
  if (!match) return null;
  return { step: Number(match[1]), unit: match[2] ?? '' };
}

function quantityForFixedCost(
  fixed: FixedCost,
  asset: Pick<Asset, 'usage'>
): number | RefurbishmentFailure {
  if (fixed.when === 'always') return 1;

  const thresholdRule = parseThresholdRule(fixed.when);
  if (thresholdRule) {
    if (thresholdRule.unit !== asset.usage.unit) return 0;
    return asset.usage.value >= thresholdRule.threshold ? 1 : 0;
  }

  const perStartedRule = parsePerStartedRule(fixed.when);
  if (perStartedRule) {
    if (perStartedRule.unit !== asset.usage.unit) return 0;
    return Math.ceil(asset.usage.value / perStartedRule.step);
  }

  return { ok: false, reason: 'unsupported_refurbishment_rule', rule: fixed.when };
}

function conditionUpgradeFor(
  costs: RefurbishmentCosts[Asset['category']],
  currentCondition: AssetCondition,
  targetCondition: AssetCondition
): number | RefurbishmentFailure {
  if (targetCondition === 'fair') {
    return { ok: false, reason: 'minimum_condition_required', targetCondition };
  }
  if (conditionIndex(targetCondition) < conditionIndex(currentCondition)) {
    return {
      ok: false,
      reason: 'target_condition_not_reachable',
      currentCondition,
      targetCondition,
    };
  }

  let total = 0;
  for (
    let index = conditionIndex(currentCondition);
    index < conditionIndex(targetCondition);
    index++
  ) {
    const from = conditionOrder[index];
    const to = conditionOrder[index + 1];
    if (!from || !to) {
      return {
        ok: false,
        reason: 'target_condition_not_reachable',
        currentCondition,
        targetCondition,
      };
    }
    const cost = costs.condition_upgrades[`${from}->${to}`];
    if (cost === undefined) {
      return {
        ok: false,
        reason: 'target_condition_not_reachable',
        currentCondition,
        targetCondition,
      };
    }
    total += cost;
  }
  return total;
}

/**
 * Calculates the deterministic work needed to make a returned asset leasable again.
 * The target defaults to `good`, the minimum condition in the data pack for a new lease.
 * All monetary values are integer cents and are summed without floating-point arithmetic.
 */
export function refurbishmentQuoteFor(
  asset: Pick<Asset, 'category' | 'condition' | 'usage'>,
  refurbishmentCosts: RefurbishmentCosts,
  targetCondition: AssetCondition = 'good'
): RefurbishmentResult {
  const parsedTarget = assetConditionSchema.safeParse(targetCondition);
  if (!parsedTarget.success) {
    throw new RangeError(
      `targetCondition must be a valid asset condition, got "${targetCondition}"`
    );
  }

  const categoryCosts = refurbishmentCosts[asset.category];
  const conditionUpgradeCents = conditionUpgradeFor(
    categoryCosts,
    asset.condition,
    parsedTarget.data
  );
  if (typeof conditionUpgradeCents !== 'number') return conditionUpgradeCents;

  const fixedWork: RefurbishmentLineItem[] = [];
  let usageReset = false;
  for (const fixed of categoryCosts.fixed) {
    const quantity = quantityForFixedCost(fixed, asset);
    if (typeof quantity !== 'number') return quantity;
    if (quantity === 0) continue;

    const costCents = fixed.cost_cents * quantity;
    fixedWork.push({
      id: fixed.id,
      description: fixed.when,
      quantity,
      unitCostCents: fixed.cost_cents,
      costCents,
      resetsUsage: fixed.resets_usage ?? false,
      mandatoryBeforeNextLease: fixed.mandatory_before_next_lease ?? false,
    });
    usageReset ||= fixed.resets_usage === true;
  }

  const fixedWorkCents = fixedWork.reduce((total, item) => total + item.costCents, 0);
  return {
    ok: true,
    quote: {
      currentCondition: asset.condition,
      targetCondition: parsedTarget.data,
      conditionUpgradeCents,
      fixedWork,
      totalCostCents: conditionUpgradeCents + fixedWorkCents,
      usageAfterValue: usageReset ? 0 : asset.usage.value,
      usageReset,
    },
  };
}
