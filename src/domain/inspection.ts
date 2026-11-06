// The return inspection's suggestion (docs/DECISIONS.md "Return inspection"): what condition a
// returned item is probably in, from how it went out and how much it was used on the lease.
// Staff confirm or correct it at the second-life desk; this only pre-fills the grade.
// - A used item is never "new" again: at best "like new".
// - It drops one grade per full step of use during the lease. The data pack has no wear rule,
//   so the steps are ours, chosen so a typical year of use costs about one grade.
// - Never below "poor", and never better than it went out (an inspection does not repair).
import type { AssetCategory, AssetCondition } from '@/data/schemas';

/** Best to worst. */
export const CONDITION_ORDER: readonly AssetCondition[] = [
  'new',
  'like_new',
  'good',
  'fair',
  'poor',
];

/** One grade of wear per this much use during a lease (km, battery cycles, engine hours). */
export const WEAR_STEP: Record<AssetCategory, number> = {
  e_bike: 5000,
  laptop: 300,
  farm_machine: 1000,
};

const index = (c: AssetCondition) => CONDITION_ORDER.indexOf(c);

/** The worse of two conditions. */
export function worseOf(a: AssetCondition, b: AssetCondition): AssetCondition {
  return index(a) >= index(b) ? a : b;
}

export type ConditionSuggestion = {
  condition: AssetCondition;
  /** Grades lost to use (on top of "no longer new"). */
  gradesForUse: number;
};

export function suggestReturnCondition(input: {
  category: AssetCategory;
  /** The condition it went out in. */
  conditionOut: AssetCondition;
  /** Usage during the lease: the return reading minus the lifetime total before it. */
  usedDuringLease: number;
}): ConditionSuggestion {
  const used = Math.max(0, input.usedDuringLease);
  const start = worseOf(input.conditionOut, 'like_new');
  const gradesForUse = Math.floor(used / WEAR_STEP[input.category]);
  const at = Math.min(index(start) + gradesForUse, CONDITION_ORDER.length - 1);
  return { condition: CONDITION_ORDER[at]!, gradesForUse };
}

/** An inspection may grade an item as it went out or worse, never better. */
export function isAllowedInspection(conditionOut: AssetCondition, graded: AssetCondition): boolean {
  return index(graded) >= index(conditionOut);
}
