import type { Asset, AssetCondition, RefurbishmentCosts } from '@/data/schemas';

export type RefurbishmentAction = {
  id: string;
  costCents: number;
  quantity: number;
};

export type RefurbishmentResult =
  | {
      ok: true;
      totalCostCents: number;
      resultingCondition: AssetCondition;
      resultingUsage: number;
      usageReset: boolean;
      actions: RefurbishmentAction[];
    }
  | {
      ok: false;
      reason: 'missing_service_history' | 'missing_cost_rule';
    };

export type RefurbishmentInput = {
  asset: Asset;
  costs: RefurbishmentCosts;
  targetCondition: AssetCondition;

  // Farm-machine service costs depend on hours since the last service.
  // The supplied asset data does not contain this history.
  usageSinceLastService?: number;
};

const CONDITION_ORDER: AssetCondition[] = ['poor', 'fair', 'good', 'like_new', 'new'];

export function calculateRefurbishment(input: RefurbishmentInput): RefurbishmentResult {
  const { asset, costs, targetCondition } = input;
  const categoryCosts = costs[asset.category];

  const actions: RefurbishmentAction[] = [];
  let resultingUsage = asset.usage.value;
  let usageReset = false;

  const addAction = (id: string, quantity = 1): boolean => {
    const rule = categoryCosts.fixed.find((item) => item.id === id);

    if (!rule) return false;

    actions.push({
      id,
      costCents: rule.cost_cents * quantity,
      quantity,
    });

    if (rule.resets_usage) {
      resultingUsage = 0;
      usageReset = true;
    }

    return true;
  };

  // 1. Upgrade condition only as much as the next customer requires.
  const currentIndex = CONDITION_ORDER.indexOf(asset.condition);
  const targetIndex = CONDITION_ORDER.indexOf(targetCondition);

  for (let index = currentIndex + 1; index <= targetIndex; index++) {
    const from = CONDITION_ORDER[index - 1];
    const to = CONDITION_ORDER[index];

    if (!from || !to) continue;

    const upgradeKey = `${from}->${to}`;
    const cost = categoryCosts.condition_upgrades[upgradeKey];

    if (cost === undefined) {
      return { ok: false, reason: 'missing_cost_rule' };
    }

    actions.push({
      id: `condition_upgrade_${upgradeKey}`,
      costCents: cost,
      quantity: 1,
    });
  }

  // 2. Category-specific mandatory work and usage thresholds.
  if (asset.category === 'e_bike') {
    if (!addAction('safety_inspection')) {
      return { ok: false, reason: 'missing_cost_rule' };
    }

    if (asset.usage.value >= 15_000) {
      if (!addAction('battery_replacement')) {
        return { ok: false, reason: 'missing_cost_rule' };
      }
    }
  }

  if (asset.category === 'laptop') {
    if (!addAction('certified_data_wipe')) {
      return { ok: false, reason: 'missing_cost_rule' };
    }

    if (asset.usage.value >= 500) {
      if (!addAction('battery_replacement')) {
        return { ok: false, reason: 'missing_cost_rule' };
      }
    }
  }

  if (asset.category === 'farm_machine') {
    if (!addAction('safety_inspection')) {
      return { ok: false, reason: 'missing_cost_rule' };
    }

    const hours = input.usageSinceLastService;

    if (hours === undefined && asset.usage.value > 0) {
      return { ok: false, reason: 'missing_service_history' };
    }

    if (hours !== undefined && hours > 0) {
      const startedThousands = Math.ceil(hours / 1_000);

      if (!addAction('major_service', startedThousands)) {
        return { ok: false, reason: 'missing_cost_rule' };
      }
    }
  }

  const resultingCondition = targetIndex > currentIndex ? targetCondition : asset.condition;

  const totalCostCents = actions.reduce((total, action) => total + action.costCents, 0);

  return {
    ok: true,
    totalCostCents,
    resultingCondition,
    resultingUsage,
    usageReset,
    actions,
  };
}
