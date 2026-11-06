import { describe, expect, it } from 'vitest';

import {
  compareCandidates,
  decideSecondLife,
  paybackMonths,
  type DecisionCandidate,
} from './second-life-decision';

function candidate(overrides: Partial<DecisionCandidate> = {}): DecisionCandidate {
  return {
    requestId: 'wait-x',
    who: 'Someone',
    neededBy: '2026-11-10',
    minCondition: 'good',
    targetCondition: 'good',
    termMonths: 24,
    monthlyNetRentCents: 5_000,
    refurbishmentCostCents: 20_000,
    ...overrides,
  };
}

// The two couriers from the data pack for ebike-007, with the values the match route returns.
const wait02 = candidate({
  requestId: 'wait-02',
  who: 'Delivery courier, accepts scratches',
  minCondition: 'fair',
  targetCondition: 'fair',
  termMonths: 12,
  monthlyNetRentCents: 6_497,
  refurbishmentCostCents: 39_500,
});
const wait13 = candidate({
  requestId: 'wait-13',
  who: 'Delivery courier, same budget as wait-02',
  minCondition: 'good',
  targetCondition: 'good',
  termMonths: 24,
  monthlyNetRentCents: 5_556,
  refurbishmentCostCents: 51_500,
});

describe('paybackMonths', () => {
  it('rounds up to whole months', () => {
    expect(paybackMonths(10_000, 5_000)).toBe(2);
    expect(paybackMonths(10_001, 5_000)).toBe(3);
  });

  it('is 0 when nothing has to be paid back', () => {
    expect(paybackMonths(0, 5_000)).toBe(0);
  });

  it('is null when the rent is not positive', () => {
    expect(paybackMonths(1_000, 0)).toBeNull();
    expect(paybackMonths(1_000, -5)).toBeNull();
  });
});

describe('compareCandidates', () => {
  it('puts the earlier deadline first', () => {
    const early = candidate({ requestId: 'b', neededBy: '2026-11-08' });
    const late = candidate({ requestId: 'a', neededBy: '2026-11-20' });
    expect(compareCandidates(early, late)).toEqual({ order: -1, decidedBy: 'deadline' });
    expect(compareCandidates(late, early)).toEqual({ order: 1, decidedBy: 'deadline' });
  });

  it('puts the stricter condition first on the same deadline', () => {
    const result = compareCandidates(wait13, wait02);
    expect(result.decidedBy).toBe('condition_requirement');
    expect(result.order).toBeLessThan(0);
  });

  it('falls back to the request ID', () => {
    const a = candidate({ requestId: 'wait-01' });
    const b = candidate({ requestId: 'wait-02' });
    expect(compareCandidates(a, b)).toEqual({ order: -1, decidedBy: 'request_id' });
    expect(compareCandidates(b, a)).toEqual({ order: 1, decidedBy: 'request_id' });
    expect(compareCandidates(a, a)).toEqual({ order: 0, decidedBy: 'request_id' });
  });
});

describe('decideSecondLife', () => {
  it('gives ebike-007 to wait-13 and says the condition requirement decided it', () => {
    const decision = decideSecondLife([wait02, wait13]);

    expect(decision.refurbish).toBe(true);
    expect(decision.reason).toBe('refurbish_for_winner');
    expect(decision.winner?.requestId).toBe('wait-13');
    expect(decision.winner?.paybackMonths).toBe(10); // ceil(51500 / 5556)
    expect(decision.ranked.map((c) => [c.requestId, c.rank])).toEqual([
      ['wait-13', 1],
      ['wait-02', 2],
    ]);
    expect(decision.comparisons).toEqual([
      { winnerRequestId: 'wait-13', otherRequestId: 'wait-02', decidedBy: 'condition_requirement' },
    ]);
  });

  it('is the same whatever order the candidates come in', () => {
    expect(decideSecondLife([wait13, wait02])).toEqual(decideSecondLife([wait02, wait13]));
  });

  it('lets an earlier deadline beat a stricter condition', () => {
    const urgent = candidate({
      requestId: 'wait-05',
      neededBy: '2026-11-08',
      minCondition: 'fair',
    });
    const decision = decideSecondLife([wait13, urgent]);
    expect(decision.winner?.requestId).toBe('wait-05');
    expect(decision.comparisons[0]?.decidedBy).toBe('deadline');
  });

  it('breaks a full tie by request ID so the result is stable', () => {
    const a = candidate({ requestId: 'wait-20' });
    const b = candidate({ requestId: 'wait-10' });
    const decision = decideSecondLife([a, b]);
    expect(decision.winner?.requestId).toBe('wait-10');
    expect(decision.comparisons[0]?.decidedBy).toBe('request_id');
  });

  it('skips a top-ranked candidate whose rent never pays back the refurbishment', () => {
    // 12 months x 1000 = 12000 < 50000, so the best-ranked request is not worth refurbishing for.
    const hopeless = candidate({
      requestId: 'wait-01',
      neededBy: '2026-11-01',
      termMonths: 12,
      monthlyNetRentCents: 1_000,
      refurbishmentCostCents: 50_000,
    });
    const decision = decideSecondLife([hopeless, wait13]);

    expect(decision.ranked[0]).toMatchObject({ requestId: 'wait-01', viable: false });
    expect(decision.winner?.requestId).toBe('wait-13');
    // Only viable candidates are compared with the winner.
    expect(decision.comparisons).toEqual([]);
  });

  it('treats paying the cost back exactly at the end of the term as viable', () => {
    const exact = candidate({
      termMonths: 10,
      monthlyNetRentCents: 5_000,
      refurbishmentCostCents: 50_000,
    });
    const over = candidate({ ...exact, refurbishmentCostCents: 50_001 });
    expect(decideSecondLife([exact]).winner?.viable).toBe(true);
    expect(decideSecondLife([over]).refurbish).toBe(false);
  });

  it('does not refurbish when no candidate pays the cost back', () => {
    const decision = decideSecondLife([
      candidate({ termMonths: 6, monthlyNetRentCents: 100, refurbishmentCostCents: 50_000 }),
    ]);
    expect(decision).toMatchObject({
      refurbish: false,
      reason: 'cost_not_recovered',
      winner: null,
    });
    expect(decision.ranked).toHaveLength(1);
  });

  it('does not refurbish when nobody is eligible', () => {
    expect(decideSecondLife([])).toEqual({
      refurbish: false,
      reason: 'no_eligible_candidate',
      winner: null,
      ranked: [],
      comparisons: [],
    });
  });

  it('treats a zero rent as not viable instead of dividing by zero', () => {
    const decision = decideSecondLife([candidate({ monthlyNetRentCents: 0 })]);
    expect(decision.ranked[0]).toMatchObject({ paybackMonths: null, viable: false });
    expect(decision.refurbish).toBe(false);
  });

  it('does not change its input', () => {
    const input = [wait02, wait13];
    const copy = structuredClone(input);
    decideSecondLife(input);
    expect(input).toEqual(copy);
  });
});
