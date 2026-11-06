// The dealer's return workflow: Return requested → Received → Inspected → Plan created.
// The server owns the transitions (src/server/returns.ts). This file only answers
// "what should the dealer do next?" and "how far along is this return?", so the UI shows
// those answers instead of inventing its own rules.

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

/** The four steps a dealer works through, in order. */
export const WORKFLOW_STEPS = ['requested', 'received', 'inspected', 'planned'] as const;
export type WorkflowStep = (typeof WORKFLOW_STEPS)[number];

export type ReturnNextAction = 'receive' | 'inspect' | 'plan' | 'ready_for_next_step' | 'none';

/**
 * The one thing the dealer can do now. `planned` is the end of this workflow ("ready for the
 * next step"); approval and completion have no screens yet, so they and `cancelled` offer none.
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
      return 'ready_for_next_step';
    case 'approved':
    case 'completed':
    case 'cancelled':
      return 'none';
  }
}

export type TimelineState = 'done' | 'current' | 'upcoming';
export type TimelineEntry = { step: WorkflowStep; state: TimelineState };

/**
 * Progress through the four steps. The step the return is in is `current`, earlier steps are
 * `done`, later ones `upcoming`. `approved` and `completed` are past the plan, so every step
 * is `done`. A cancelled return has no current step: nothing is left to do.
 */
export function returnTimeline(status: ReturnStatus): TimelineEntry[] {
  if (status === 'cancelled') {
    return WORKFLOW_STEPS.map((step) => ({ step, state: 'upcoming' }));
  }
  const currentIndex =
    status === 'approved' || status === 'completed'
      ? WORKFLOW_STEPS.length
      : WORKFLOW_STEPS.indexOf(status);
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
