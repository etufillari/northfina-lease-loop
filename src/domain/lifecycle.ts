import type { Asset, AssetCondition, RefurbishmentCosts } from '@/data/schemas';
import { multiplyRatio } from './money-arithmetic';

export type EndChoice = 'buy' | 'return' | 'pass_on';
export type EndReason =
  'not_active' | 'too_early' | 'invoices_missing' | 'usage_decreased' | 'invalid_successor';

export type EndReadinessReason = Extract<
  EndReason,
  'not_active' | 'too_early' | 'invoices_missing'
>;

/** Prerequisites common to every end choice; independent of inspection form values. */
export function endLeaseReadiness(input: {
  status: string;
  endDate: string;
  onDate: string;
  termMonths: number;
  rentalInvoiceCount: number;
  latestInvoiceDate?: string;
}): { ok: true } | { ok: false; reason: EndReadinessReason } {
  if (input.status !== 'active') return { ok: false, reason: 'not_active' };
  if (
    input.onDate < input.endDate ||
    (input.latestInvoiceDate && input.onDate < input.latestInvoiceDate)
  ) {
    return { ok: false, reason: 'too_early' };
  }
  if (input.rentalInvoiceCount !== input.termMonths) {
    return { ok: false, reason: 'invoices_missing' };
  }
  return { ok: true };
}

/** Dates, readings and document ownership must already be validated by the caller. */
export function mayEndLease(input: {
  status: string;
  endDate: string;
  onDate: string;
  termMonths: number;
  rentalInvoiceCount: number;
  choice: EndChoice;
  customerId: string;
  nextCustomerId?: string;
  previousUsageValue: number;
  usageValue: number;
  latestInvoiceDate?: string;
}): { ok: true } | { ok: false; reason: EndReason } {
  const readiness = endLeaseReadiness(input);
  if (!readiness.ok) return readiness;
  if (input.choice !== 'buy' && input.usageValue < input.previousUsageValue) {
    return { ok: false, reason: 'usage_decreased' };
  }
  if (
    input.choice === 'pass_on' &&
    (!input.nextCustomerId || input.nextCustomerId === input.customerId)
  ) {
    return { ok: false, reason: 'invalid_successor' };
  }
  return { ok: true };
}

export type RefurbishmentTask = {
  id: string;
  netCostCents: number;
  units: number;
  resetsUsage: boolean;
};
export type MaintenanceBaselines = {
  batteryReplacementAtUsage?: number;
  lastServiceAtUsage?: number;
};
export type RefurbishmentResult =
  | { ok: true; tasks: RefurbishmentTask[]; totalNetCents: number }
  | {
      ok: false;
      reason:
        | 'condition_too_low'
        | 'unsupported_upgrade'
        | 'missing_service_history'
        | 'unsupported_service_rule';
    };

const conditions: readonly AssetCondition[] = ['new', 'like_new', 'good', 'fair', 'poor'];

/** Readiness checklist; fair condition requires a matching customer's explicit acceptance. */
export function refurbishmentPlan(input: {
  asset: Asset;
  targetCondition: AssetCondition;
  costs: RefurbishmentCosts;
  lastServiceUsage?: number;
  maintenance?: MaintenanceBaselines;
  acceptsFairCondition?: boolean;
}): RefurbishmentResult {
  const { asset, targetCondition, costs } = input;
  const lastServiceUsage = input.maintenance?.lastServiceAtUsage ?? input.lastServiceUsage;
  const target = conditions.indexOf(targetCondition);
  if (target > 2 && !(targetCondition === 'fair' && input.acceptsFairCondition)) {
    return { ok: false, reason: 'condition_too_low' };
  }
  const rules = costs[asset.category];
  const tasks: RefurbishmentTask[] = [];

  for (let rank = conditions.indexOf(asset.condition); rank > target; rank--) {
    const step = `${conditions[rank]}->${conditions[rank - 1]}`;
    const cost = rules.condition_upgrades[step];
    if (cost === undefined) return { ok: false, reason: 'unsupported_upgrade' };
    tasks.push({
      id: `upgrade:${step}`,
      netCostCents: multiplyRatio(cost, 1, 1),
      units: 1,
      resetsUsage: false,
    });
  }

  for (const rule of rules.fixed) {
    let units: number;
    const threshold = /^usage\.value >= (\d+) (km|battery_cycles|engine_hours)$/.exec(rule.when);
    if (rule.when === 'always') {
      units = 1;
    } else if (threshold && threshold[2] === asset.usage.unit) {
      const baseline = rule.resets_usage ? (input.maintenance?.batteryReplacementAtUsage ?? 0) : 0;
      if (!Number.isInteger(baseline) || baseline < 0 || baseline > asset.usage.value) {
        return { ok: false, reason: 'missing_service_history' };
      }
      units = asset.usage.value - baseline >= Number(threshold[1]) ? 1 : 0;
    } else if (rule.when === 'per started 1000 engine_hours since last service') {
      if (
        asset.usage.unit !== 'engine_hours' ||
        lastServiceUsage === undefined ||
        !Number.isInteger(lastServiceUsage) ||
        lastServiceUsage < 0 ||
        lastServiceUsage > asset.usage.value
      ) {
        return { ok: false, reason: 'missing_service_history' };
      }
      units = Math.ceil((asset.usage.value - lastServiceUsage) / 1000);
    } else {
      return { ok: false, reason: 'unsupported_service_rule' };
    }
    if (rule.mandatory_before_next_lease) units = Math.max(1, units);
    if (units > 0) {
      tasks.push({
        id: rule.id,
        // Whole work units need no rounding; reject costs outside safe integer cents.
        netCostCents: multiplyRatio(rule.cost_cents, units, 1),
        units,
        resetsUsage: rule.resets_usage ?? false,
      });
    }
  }
  const totalNetCents = tasks.reduce((sum, task) => sum + task.netCostCents, 0);
  if (!Number.isSafeInteger(totalNetCents)) {
    throw new RangeError('refurbishment total exceeds safe integer cents');
  }
  return { ok: true, tasks, totalNetCents };
}

export function missingReadinessTasks(
  tasks: readonly RefurbishmentTask[],
  completedTaskIds: readonly string[]
): string[] {
  const completed = new Set(completedTaskIds);
  return tasks.filter((task) => !completed.has(task.id)).map((task) => task.id);
}

/** Service resets the component interval, while the item's physical meter keeps its history. */
export function maintenanceAfterWork(input: {
  previous: MaintenanceBaselines;
  tasks: readonly RefurbishmentTask[];
  usageValue: number;
  lastServiceUsage?: number;
}): MaintenanceBaselines {
  const next = { ...input.previous };
  if (next.lastServiceAtUsage === undefined && input.lastServiceUsage !== undefined) {
    next.lastServiceAtUsage = input.lastServiceUsage;
  }
  if (input.tasks.some((task) => task.id === 'battery_replacement')) {
    next.batteryReplacementAtUsage = input.usageValue;
  }
  if (input.tasks.some((task) => task.id === 'major_service')) {
    next.lastServiceAtUsage = input.usageValue;
  }
  return next;
}
