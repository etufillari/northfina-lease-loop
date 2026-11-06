import { describe, expect, it } from 'vitest';
import {
  RETURN_STATUSES,
  defaultPlanTarget,
  describeRefurbishmentAction,
  isReturnStatus,
  assetAfterRefurbishment,
  planTargetOptions,
  returnNextAction,
  returnTimeline,
} from './return-workflow';

describe('returnNextAction', () => {
  it('points each workflow step at the next dealer action', () => {
    expect(returnNextAction('requested')).toBe('receive');
    expect(returnNextAction('received')).toBe('inspect');
    expect(returnNextAction('inspected')).toBe('plan');
    expect(returnNextAction('planned')).toBe('approve');
    expect(returnNextAction('approved')).toBe('complete');
  });

  it('offers no action once the return is completed or cancelled', () => {
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
    expect(states('requested')).toEqual([
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);
    expect(states('received')).toEqual([
      'done',
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);
    expect(states('planned')).toEqual(['done', 'done', 'done', 'current', 'upcoming', 'upcoming']);
    expect(states('approved')).toEqual(['done', 'done', 'done', 'done', 'current', 'upcoming']);
  });

  it('lists the steps in workflow order', () => {
    expect(returnTimeline('requested').map((entry) => entry.step)).toEqual([
      'requested',
      'received',
      'inspected',
      'planned',
      'approved',
      'completed',
    ]);
  });

  it('shows every step done once the return is completed', () => {
    expect(states('completed')).toEqual(['done', 'done', 'done', 'done', 'done', 'done']);
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

describe('assetAfterRefurbishment', () => {
  const plan = {
    resultingCondition: 'good' as const,
    resultingUsage: 0,
    inspectedUsage: { unit: 'km' },
  };

  it('gives a returned asset the planned condition and usage and makes it available', () => {
    expect(assetAfterRefurbishment(plan, 'returned')).toEqual({
      ok: true,
      asset: { condition: 'good', usage: { unit: 'km', value: 0 }, status: 'available' },
    });
  });

  it('keeps a reserved asset reserved', () => {
    const result = assetAfterRefurbishment(plan, 'reserved');

    expect(result).toMatchObject({ ok: true, asset: { status: 'reserved', condition: 'good' } });
  });

  it('refuses an asset that was never returned', () => {
    expect(assetAfterRefurbishment(plan, 'available')).toEqual({
      ok: false,
      reason: 'asset_not_returned_or_reserved',
    });
  });

  it('keeps the usage the plan ends with, even when no work resets it', () => {
    const result = assetAfterRefurbishment({ ...plan, resultingUsage: 9_800 }, 'returned');

    expect(result).toMatchObject({ ok: true, asset: { usage: { unit: 'km', value: 9_800 } } });
  });
});
