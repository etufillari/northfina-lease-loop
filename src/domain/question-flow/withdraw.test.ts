// D87: the customer may step back from an application not signed yet.
import { describe, expect, it } from 'vitest';
import { applicationDecisions } from '@/domain/statuses';
import { WITHDRAWABLE, withdrawalCheck } from './withdraw';

describe('withdrawalCheck (D87)', () => {
  it.each(['approved', 'manual_review', 'awaiting_signatory'] as const)(
    'an unsigned %s application may be withdrawn',
    (decision) => {
      expect(withdrawalCheck(decision, false)).toEqual({ ok: true });
    }
  );

  it('an approved application already signed into a contract is not: it is a lease now', () => {
    expect(withdrawalCheck('approved', true)).toEqual({
      ok: false,
      reason: { code: 'already_signed', params: { decision: 'approved' } },
    });
  });

  it.each(['rejected', 'withdrawn'] as const)('a %s application is final', (decision) => {
    expect(withdrawalCheck(decision, false)).toEqual({
      ok: false,
      reason: { code: 'not_withdrawable', params: { decision } },
    });
  });

  it('names a verdict for every decision there is', () => {
    for (const decision of applicationDecisions) {
      const result = withdrawalCheck(decision, false);
      expect(result.ok, decision).toBe(WITHDRAWABLE.includes(decision));
    }
  });
});
