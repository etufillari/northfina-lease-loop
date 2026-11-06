// The refurbishment plan of a returned item, read from data/refurbishment-costs.json:
//
// 1. The fixed steps of its category, in the file's order, whose `when` rule holds on the
//    returned usage. The rules are parsed from the data, never hard-coded:
//    - `always`;
//    - `usage.value >= N <unit>`: the usage is at least N;
//    - `per started N <unit> since last service`: one step per started block of N since
//      `usageAtLastService` (the usage of the assessment that last did the step; 0 when there
//      is none, as the pack has no service history). A counter below it (a replaced meter)
//      counts from 0. Review finding 7: a second return billed the lifetime hours again.
//    Any other text is an error, so a new rule in the data cannot be skipped silently.
// 2. The condition upgrades from the returned condition up to `targetCondition`, one step at a
//    time (`poor->fair`, then `fair->good`, …). An item already as good as the target needs
//    none and is never downgraded; a missing step in the data is an error.
//
// Two usage counters (D83, the organisers' answer of 6 Nov 2026): the total (odometer, hours,
// cycles) never resets; the usage since the last step that `resets_usage` (in the pack, only a
// battery replacement) is the total less the reading when that step was last done
// (`usageAtLastReset`, 0 when none is on record). A resetting step's own `usage.value >= N` rule
// reads the usage since the last reset (the next battery is due 15 000 km after the last one),
// and after the plan that usage is 0 when such a step is done, else unchanged. The market value
// takes its usage adjustment on it (assess.ts); the passport and circular impact read the total.
import type { AssetCategory, AssetCondition, RefurbishmentCosts, UsageUnit } from '@/data/schemas';
import { usageUnitSchema } from '@/data/schemas';

/** Worst first, the order the upgrades climb. */
const CLIMB: readonly AssetCondition[] = ['poor', 'fair', 'good', 'like_new', 'new'];

export type WhenRule =
  | { kind: 'always' }
  | { kind: 'usage_at_least'; value: number; unit: UsageUnit }
  | { kind: 'per_started'; block: number; unit: UsageUnit };

export type RefurbishmentStep =
  | { kind: 'fixed'; id: string; costCents: number; resetsUsage: boolean; quantity: number }
  | { kind: 'upgrade'; id: string; from: AssetCondition; to: AssetCondition; costCents: number };

export type RefurbishmentInput = {
  category: AssetCategory;
  condition: AssetCondition;
  usage: { unit: UsageUnit; value: number };
  /** The usage when the per-started-block steps were last done; 0 or absent: never. */
  usageAtLastService?: number;
  /** D83: the total usage when a step that resets usage was last done; 0 or absent: never. */
  usageAtLastReset?: number;
  targetCondition: AssetCondition;
};

export type RefurbishmentPlan = {
  steps: RefurbishmentStep[];
  fixedCents: number;
  upgradeCents: number;
  totalCents: number;
  /** D83: the total usage, which no step resets. */
  usageAfter: { unit: UsageUnit; value: number };
  /** D83: the usage since the last reset after the plan: 0 when a step resets it. */
  usageSinceResetAfter: { unit: UsageUnit; value: number };
  conditionAfter: AssetCondition;
};

const USAGE_AT_LEAST = /^usage\.value >= (\d+) ([a-z_]+)$/;
const PER_STARTED = /^per started (\d+) ([a-z_]+) since last service$/;

function unitOf(text: string, rule: string): UsageUnit {
  const unit = usageUnitSchema.safeParse(text);
  if (!unit.success) throw new RangeError(`unknown refurbishment rule: ${rule}`);
  return unit.data;
}

/** Turns a `when` text of the data into a rule; throws on any text it does not know. */
export function parseWhenRule(when: string): WhenRule {
  const rule = when.trim();
  if (rule === 'always') return { kind: 'always' };
  const atLeast = USAGE_AT_LEAST.exec(rule);
  if (atLeast) {
    return { kind: 'usage_at_least', value: Number(atLeast[1]), unit: unitOf(atLeast[2]!, rule) };
  }
  const perStarted = PER_STARTED.exec(rule);
  if (perStarted && Number(perStarted[1]) > 0) {
    return {
      kind: 'per_started',
      block: Number(perStarted[1]),
      unit: unitOf(perStarted[2]!, rule),
    };
  }
  throw new RangeError(`unknown refurbishment rule: ${when}`);
}

/** How many times a rule applies to `usage`: 0 or 1, or the started blocks. */
function timesApplied(
  rule: WhenRule,
  usage: { unit: UsageUnit; value: number },
  atLastService: number
): number {
  if (rule.kind === 'always') return 1;
  if (rule.unit !== usage.unit) {
    throw new RangeError(`the rule counts ${rule.unit}, the usage is in ${usage.unit}`);
  }
  if (rule.kind === 'usage_at_least') return usage.value >= rule.value ? 1 : 0;
  const since = usage.value >= atLastService ? usage.value - atLastService : usage.value;
  return Math.ceil(since / rule.block);
}

/** The steps and the cost to bring the item to `targetCondition`. */
export function refurbishmentPlan(
  input: RefurbishmentInput,
  costs: RefurbishmentCosts
): RefurbishmentPlan {
  const { category, condition, usage, targetCondition } = input;
  if (!Number.isSafeInteger(usage.value) || usage.value < 0) {
    throw new RangeError(`usage must be a whole number ≥ 0, got ${usage.value}`);
  }
  const data = costs[category];
  const steps: RefurbishmentStep[] = [];
  let resets = false;
  const sinceReset = {
    unit: usage.unit,
    value: usageSinceReset(usage.value, input.usageAtLastReset),
  };

  for (const fixed of data.fixed) {
    const resetsUsage = fixed.resets_usage === true;
    // D83: a resetting step (the battery) is due on the usage since it was last done. That
    // figure already counts from its own reset, so no last-service reading is taken off it.
    const counted = resetsUsage ? sinceReset : usage;
    const quantity = timesApplied(
      parseWhenRule(fixed.when),
      counted,
      resetsUsage ? 0 : (input.usageAtLastService ?? 0)
    );
    if (quantity === 0) continue;
    resets ||= resetsUsage;
    steps.push({
      kind: 'fixed',
      id: fixed.id,
      costCents: fixed.cost_cents * quantity,
      resetsUsage,
      quantity,
    });
  }
  const fixedCents = steps.reduce((sum, step) => sum + step.costCents, 0);

  const from = CLIMB.indexOf(condition);
  const to = CLIMB.indexOf(targetCondition);
  for (let at = from; at < to; at += 1) {
    const lower = CLIMB[at]!;
    const upper = CLIMB[at + 1]!;
    const id = `${lower}->${upper}`;
    const cost = data.condition_upgrades[id];
    if (cost === undefined) throw new RangeError(`the data has no upgrade ${id} for ${category}`);
    steps.push({ kind: 'upgrade', id, from: lower, to: upper, costCents: cost });
  }
  const upgradeCents = steps.reduce(
    (sum, step) => sum + (step.kind === 'upgrade' ? step.costCents : 0),
    0
  );

  return {
    steps,
    fixedCents,
    upgradeCents,
    totalCents: fixedCents + upgradeCents,
    usageAfter: { unit: usage.unit, value: usage.value },
    usageSinceResetAfter: { unit: usage.unit, value: resets ? 0 : sinceReset.value },
    conditionAfter: to > from ? targetCondition : condition,
  };
}

/**
 * D83: the usage since the last reset, the total less the reading at that reset. None on record
 * (absent or 0) is the total; a total below the reading (a replaced meter) counts from 0.
 */
export function usageSinceReset(total: number, atLastReset = 0): number {
  return total >= atLastReset ? total - atLastReset : total;
}

/**
 * D83: the total usage at the last reset: the usage of the newest past assessment whose plan did
 * a step that `resets_usage` (the battery replacement), or 0 when none did. `assessments` newest
 * first, as for `usageAtLastService`.
 */
export function usageAtLastReset(
  assessments: readonly { usageValue: number; stepIds: readonly string[] }[],
  category: AssetCategory,
  costs: RefurbishmentCosts
): number {
  const resetting = new Set(
    costs[category].fixed.filter((fixed) => fixed.resets_usage === true).map((fixed) => fixed.id)
  );
  const reset = assessments.find((a) => a.stepIds.some((id) => resetting.has(id)));
  return reset?.usageValue ?? 0;
}

/**
 * The usage at the last per-block service (review finding 7): the usage of the newest past
 * assessment whose plan did a step with a `per started` rule, or 0 when none did.
 * `assessments` newest first, each with its usage and the ids of its plan's steps.
 */
export function usageAtLastService(
  assessments: readonly { usageValue: number; stepIds: readonly string[] }[],
  category: AssetCategory,
  costs: RefurbishmentCosts
): number {
  const perBlock = new Set(
    costs[category].fixed
      .filter((fixed) => parseWhenRule(fixed.when).kind === 'per_started')
      .map((fixed) => fixed.id)
  );
  const serviced = assessments.find((a) => a.stepIds.some((id) => perBlock.has(id)));
  return serviced?.usageValue ?? 0;
}
