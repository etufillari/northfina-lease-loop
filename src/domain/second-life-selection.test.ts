import { describe, expect, it } from 'vitest';
import type { MatchCandidate } from './second-life-matching';
import { selectSecondLifeCandidate } from './second-life-selection';

const first: MatchCandidate = {
  requestId: 'first',
  condition: 'fair',
  termMonths: 12,
  neededBy: '2026-11-10',
  budgetNetCents: 9000,
  netPriceCents: 67600,
  monthlyNetCents: 3787,
  workNetCents: 39500,
  netRecoveryCents: 28100,
  tasks: [],
  reasons: [],
};
const alternative: MatchCandidate = { ...first, requestId: 'second', condition: 'good' };
const preview = { candidates: [first, alternative], recommendation: first };
const reason = 'Customer confirmed collection today.';

describe('operator selection of a second-life plan', () => {
  it('accepts the recommendation without requiring an override', () => {
    expect(selectSecondLifeCandidate(preview, { requestId: 'first', condition: 'fair' })).toEqual({
      ok: true,
      candidate: first,
      override: false,
    });
  });
  it('permits another customer with an explanation', () => {
    expect(
      selectSecondLifeCandidate(preview, {
        requestId: 'second',
        condition: 'good',
        overrideReason: reason,
      })
    ).toEqual({ ok: true, candidate: alternative, override: true });
  });
  it('requires an explanation for a different condition for the same customer', () => {
    const same = { ...alternative, requestId: first.requestId };
    expect(
      selectSecondLifeCandidate(
        { ...preview, candidates: [first, same] },
        {
          requestId: 'first',
          condition: 'good',
        }
      )
    ).toEqual({ ok: false, reason: 'override_reason_required' });
  });
  it.each([undefined, '', '          ', 'short'])(
    'rejects a missing or short reason: %s',
    (reason) => {
      expect(
        selectSecondLifeCandidate(preview, {
          requestId: 'second',
          condition: 'good',
          overrideReason: reason,
        })
      ).toEqual({ ok: false, reason: 'override_reason_required' });
    }
  );
  it.each([
    'budget',
    'condition',
    'deadline',
    'identity_unknown',
    'allocated',
    'reserved_for_other',
  ])('never overrides a failed eligibility constraint: %s', (rejection) => {
    expect(
      selectSecondLifeCandidate(
        {
          ...preview,
          candidates: [{ ...alternative, reasons: [rejection] }],
        },
        { requestId: 'second', condition: 'good', overrideReason: reason }
      )
    ).toEqual({ ok: false, reason: 'ineligible' });
  });
  it('rejects a candidate or condition absent from the preview', () => {
    for (const selection of [
      { requestId: 'missing', condition: 'good' as const },
      { requestId: 'second', condition: 'new' as const },
    ])
      expect(selectSecondLifeCandidate(preview, { ...selection, overrideReason: reason })).toEqual({
        ok: false,
        reason: 'ineligible',
      });
  });
  it('requires a reason if the old recommendation is no longer top ranked', () => {
    expect(
      selectSecondLifeCandidate(
        { ...preview, recommendation: alternative },
        {
          requestId: 'first',
          condition: 'fair',
        }
      )
    ).toEqual({ ok: false, reason: 'override_reason_required' });
  });
  it('does not mutate the supplied preview', () => {
    const before = structuredClone(preview);
    selectSecondLifeCandidate(preview, {
      requestId: 'second',
      condition: 'good',
      overrideReason: reason,
    });
    expect(preview).toEqual(before);
  });
});
