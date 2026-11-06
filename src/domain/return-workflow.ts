// The dealer's return workflow:
// Return requested → Received → Inspected → Plan created → Plan approved → Completed.
// The server owns the transitions (src/server/returns.ts, return-completion.ts). This file
// answers "what should the dealer do next?", "how far along is this return?" and "what does
// the asset look like once the work is done?", so the UI and the server share one set of rules.

export const RETURN_STATUSES = [
  'requested',
  'received',
  'inspected',
  'planned',
  'approved',
  'completed',
  'cancelled',
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export function isReturnStatus(value: string): value is ReturnStatus {
  return (RETURN_STATUSES as readonly string[]).includes(value);
}

/** The six steps a return goes through, in order. `completed` is the last. */
export const WORKFLOW_STEPS = [
  'requested',
  'received',
  'inspected',
  'planned',
  'approved',
  'completed',
] as const;
export type WorkflowStep = (typeof WORKFLOW_STEPS)[number];

export type ReturnNextAction = 'receive' | 'inspect' | 'plan' | 'approve' | 'complete' | 'none';

/**
 * The one thing the dealer can do now. A completed or cancelled return has nothing left to do.
 */
export function returnNextAction(status: ReturnStatus): ReturnNextAction {
  switch (status) {
    case 'requested':
      return 'receive';
    case 'received':
      return 'inspect';
    case 'inspected':
      return 'plan';
    case 'planned':
      return 'approve';
    case 'approved':
      return 'complete';
    case 'completed':
    case 'cancelled':
      return 'none';
  }
}

export type TimelineState = 'done' | 'current' | 'upcoming';
export type TimelineEntry = { step: WorkflowStep; state: TimelineState };

/**
 * Progress through the six steps. The step the return is in is `current`, earlier steps are
 * `done`, later ones `upcoming`. Once `completed`, every step is `done`. A cancelled return
 * has no current step: nothing is left to do.
 */
export function returnTimeline(status: ReturnStatus): TimelineEntry[] {
  if (status === 'cancelled') {
    return WORKFLOW_STEPS.map((step) => ({ step, state: 'upcoming' }));
  }
  const currentIndex =
    status === 'completed' ? WORKFLOW_STEPS.length : WORKFLOW_STEPS.indexOf(status);
  return WORKFLOW_STEPS.map((step, index) => ({
    step,
    state: index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming',
  }));
}

const CONDITIONS = ['poor', 'fair', 'good', 'like_new', 'new'] as const;
type Condition = (typeof CONDITIONS)[number];

/**
 * The target conditions a plan may aim for: the inspected condition and everything better.
 * (The server also rejects a worse target; this keeps the form from offering one.)
 */
export function planTargetOptions(inspected: Condition): Condition[] {
  return CONDITIONS.slice(CONDITIONS.indexOf(inspected));
}

/**
 * The target the plan form starts on: `good`, the lowest condition an item may be leased in
 * (data/refurbishment-costs.json), or the inspected condition when that is already better.
 */
export function defaultPlanTarget(inspected: Condition): Condition {
  return CONDITIONS.indexOf(inspected) >= CONDITIONS.indexOf('good') ? inspected : 'good';
}

export type RefurbishmentActionLabel =
  { kind: 'condition_upgrade'; from: string; to: string } | { kind: 'work'; id: string };

const UPGRADE_PREFIX = 'condition_upgrade_';

/**
 * Splits a refurbishment action id from the plan into something the UI can translate:
 * `condition_upgrade_fair->good` becomes a from/to pair, any other id is a named piece of work.
 */
export function describeRefurbishmentAction(id: string): RefurbishmentActionLabel {
  if (id.startsWith(UPGRADE_PREFIX)) {
    const [from, to] = id.slice(UPGRADE_PREFIX.length).split('->');
    if (from && to) return { kind: 'condition_upgrade', from, to };
  }
  return { kind: 'work', id };
}

// --- Finishing the refurbishment -------------------------------------------------------

export type AssetStatus = 'available' | 'reserved' | 'returned';

export type AssetAfterRefurbishment = {
  condition: Condition;
  usage: { unit: string; value: number };
  status: AssetStatus;
};

export type CompletionResult =
  | { ok: true; asset: AssetAfterRefurbishment }
  | { ok: false; reason: 'asset_not_returned_or_reserved' };

/**
 * What the asset looks like when the dealer completes the refurbishment: the condition and
 * usage the plan promised, and a status the next lease can start from.
 *
 * - A `returned` asset becomes `available`: it is back in the catalogue.
 * - A `reserved` asset stays `reserved`: someone has already been promised it.
 * - An `available` asset was never returned, so something is wrong; the work is refused.
 */
export function assetAfterRefurbishment(
  plan: {
    resultingCondition: Condition;
    resultingUsage: number;
    inspectedUsage: { unit: string };
  },
  assetStatus: AssetStatus
): CompletionResult {
  if (assetStatus === 'available') return { ok: false, reason: 'asset_not_returned_or_reserved' };
  return {
    ok: true,
    asset: {
      condition: plan.resultingCondition,
      usage: { unit: plan.inspectedUsage.unit, value: plan.resultingUsage },
      status: assetStatus === 'returned' ? 'available' : 'reserved',
    },
  };
}
