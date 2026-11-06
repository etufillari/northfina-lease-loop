import { describe, expect, it } from 'vitest';
import {
  RETURN_STATUSES,
  defaultPlanTarget,
  describeRefurbishmentAction,
  isReturnStatus,
  planTargetOptions,
  returnNextAction,
  returnTimeline,
} from './return-workflow';

describe('returnNextAction', () => {
  it('points each workflow step at the next dealer action', () => {
    expect(returnNextAction('requested')).toBe('receive');
    expect(returnNextAction('received')).toBe('inspect');
    expect(returnNextAction('inspected')).toBe('plan');
    expect(returnNextAction('planned')).toBe('ready_for_next_step');
  });

  it('offers no action for statuses without a screen', () => {
    expect(returnNextAction('approved')).toBe('none');
    expect(returnNextAction('completed')).toBe('none');
    expect(returnNextAction('cancelled')).toBe('none');
  });

  it('answers for every known status', () => {
    for (const status of RETURN_STATUSES) {
      expect(returnNextAction(status)).toBeTruthy();
    }
  });
});

describe('returnTimeline', () => {
  const states = (status: Parameters<typeof returnTimeline>[0]) =>
    returnTimeline(status).map((entry) => entry.state);

  it('marks earlier steps done, the current step, and later steps upcoming', () => {
    expect(states('requested')).toEqual(['current', 'upcoming', 'upcoming', 'upcoming']);
    expect(states('received')).toEqual(['done', 'current', 'upcoming', 'upcoming']);
    expect(states('inspected')).toEqual(['done', 'done', 'current', 'upcoming']);
    expect(states('planned')).toEqual(['done', 'done', 'done', 'current']);
  });

  it('lists the steps in workflow order', () => {
    expect(returnTimeline('requested').map((entry) => entry.step)).toEqual([
      'requested',
      'received',
      'inspected',
      'planned',
    ]);
  });

  it('shows every step done once the return is past the plan', () => {
    expect(states('approved')).toEqual(['done', 'done', 'done', 'done']);
    expect(states('completed')).toEqual(['done', 'done', 'done', 'done']);
  });

  it('has no current step for a cancelled return', () => {
    expect(states('cancelled')).not.toContain('current');
  });
});

describe('isReturnStatus', () => {
  it('accepts known statuses and rejects anything else', () => {
    expect(isReturnStatus('planned')).toBe(true);
    expect(isReturnStatus('lost')).toBe(false);
  });
});

describe('planTargetOptions and defaultPlanTarget', () => {
  it('offers the inspected condition and everything better', () => {
    expect(planTargetOptions('poor')).toEqual(['poor', 'fair', 'good', 'like_new', 'new']);
    expect(planTargetOptions('good')).toEqual(['good', 'like_new', 'new']);
    expect(planTargetOptions('new')).toEqual(['new']);
  });

  it('starts on good, or on the inspected condition when that is already better', () => {
    expect(defaultPlanTarget('poor')).toBe('good');
    expect(defaultPlanTarget('fair')).toBe('good');
    expect(defaultPlanTarget('good')).toBe('good');
    expect(defaultPlanTarget('like_new')).toBe('like_new');
  });
});

describe('describeRefurbishmentAction', () => {
  it('splits a condition upgrade into its from and to conditions', () => {
    expect(describeRefurbishmentAction('condition_upgrade_fair->good')).toEqual({
      kind: 'condition_upgrade',
      from: 'fair',
      to: 'good',
    });
  });

  it('treats other ids as named work', () => {
    expect(describeRefurbishmentAction('battery_replacement')).toEqual({
      kind: 'work',
      id: 'battery_replacement',
    });
  });

  it('does not invent a pair from a malformed upgrade id', () => {
    expect(describeRefurbishmentAction('condition_upgrade_fair')).toEqual({
      kind: 'work',
      id: 'condition_upgrade_fair',
    });
  });
});
