// The return inspection's suggestion (docs/DECISIONS.md "Return inspection"): what condition a
// returned item is probably in, from how it went out and how much it was used on the lease.
// Staff confirm or correct it at the second-life desk; this only pre-fills the grade.
// - A used item is never "new" again: at best "like new".
// - It drops one grade per full step of use COUNTED CUMULATIVELY from its wear baseline — the
//   condition last set by the data pack or an upgrade, and the lifetime usage then — so two
//   leases of 4,900 km wear it like one of 9,800 km. The data pack has no wear rule, so the
//   steps are ours, chosen so a typical year of use costs about one grade.
// - Never below "poor", and never better than it went out (an inspection does not repair,
//   and a grade staff lowered for damage stays lowered).
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
  /** Usage since the wear baseline (across leases). */
  usedSinceBaseline: number;
  /** Grades lost to that use (on top of "no longer new"). */
  gradesForUse: number;
};

export type WearBaseline = {
  /** The condition last set by the data pack or an upgrade. */
  condition: AssetCondition;
  /** The lifetime usage at that moment. */
  usageTotal: number;
};

export function suggestReturnCondition(input: {
  category: AssetCategory;
  /** The condition it went out in. */
  conditionOut: AssetCondition;
  baseline: WearBaseline;
  /** Lifetime usage now, after the return reading. */
  usageTotalNow: number;
}): ConditionSuggestion {
  const usedSinceBaseline = Math.max(0, input.usageTotalNow - input.baseline.usageTotal);
  const start = worseOf(input.baseline.condition, 'like_new');
  const gradesForUse = Math.floor(usedSinceBaseline / WEAR_STEP[input.category]);
  const at = Math.min(index(start) + gradesForUse, CONDITION_ORDER.length - 1);
  const fromWear = CONDITION_ORDER[at]!;
  return {
    condition: worseOf(fromWear, worseOf(input.conditionOut, 'like_new')),
    usedSinceBaseline,
    gradesForUse,
  };
}

/** An inspection may grade an item as it went out or worse, never better. */
export function isAllowedInspection(conditionOut: AssetCondition, graded: AssetCondition): boolean {
  return index(graded) >= index(conditionOut);
}
