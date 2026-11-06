import type { AssetCondition } from '../data/schemas';

/**
 * Second-life decision: refurbish or not, and who gets the item.
 *
 * Input is the list of waiting-list requests the item is *eligible* for (category, condition,
 * deadline and budget already checked by `matchSecondLifeDemand`), each with the refurbishment
 * it would need and the rent it would pay. Output is one decision with reasons as codes, so the
 * UI can translate them. Pure: no clock, no I/O, input is never changed.
 *
 * Documented rules (the data pack does not define them, so these are our assumptions):
 *
 * 1. Ranking: earliest `neededBy` first (the most urgent waits least); on the same deadline the
 *    stricter minimum condition first (the least flexible customer has the fewest other items
 *    to choose from, while a customer who accepts `fair` can take almost any item); on the
 *    same condition the request ID, alphabetically, so the result is stable.
 * 2. Viability: refurbishment is only worth paying for if the rent over the customer's own
 *    term pays it back. `paybackMonths = ceil(refurbishmentCost / monthlyRent)` and it must be
 *    at most `termMonths`. Resale value after the lease is deliberately not counted.
 * 3. Winner: the best-ranked *viable* candidate. If none is viable the item is not refurbished.
 */

export type DecisionCandidate = {
  requestId: string;
  who: string;
  neededBy: string;
  minCondition: AssetCondition;
  targetCondition: AssetCondition;
  termMonths: number;
  monthlyNetRentCents: number;
  /** What it costs to bring the item to this customer's target condition. */
  refurbishmentCostCents: number;
};

export type RankedCandidate = DecisionCandidate & {
  rank: number;
  /** Months of rent needed to pay back the refurbishment; null when the rent is not positive. */
  paybackMonths: number | null;
  viable: boolean;
};

/** The first rule that separates two candidates, in the order the rules are applied. */
export type DecidingRule = 'deadline' | 'condition_requirement' | 'request_id';

export type Comparison = {
  winnerRequestId: string;
  otherRequestId: string;
  decidedBy: DecidingRule;
};

export type DecisionReason =
  'refurbish_for_winner' | 'no_eligible_candidate' | 'cost_not_recovered';

export type SecondLifeDecision = {
  refurbish: boolean;
  reason: DecisionReason;
  winner: RankedCandidate | null;
  /** Every candidate, best first. */
  ranked: RankedCandidate[];
  /** Winner against each other viable candidate: which rule put the winner ahead. */
  comparisons: Comparison[];
};

const CONDITION_RANK: Record<AssetCondition, number> = {
  poor: 0,
  fair: 1,
  good: 2,
  like_new: 3,
  new: 4,
};

/** Negative when `a` ranks ahead of `b`; also reports which rule decided it. */
export function compareCandidates(
  a: Pick<DecisionCandidate, 'requestId' | 'neededBy' | 'minCondition'>,
  b: Pick<DecisionCandidate, 'requestId' | 'neededBy' | 'minCondition'>
): { order: number; decidedBy: DecidingRule } {
  if (a.neededBy !== b.neededBy) {
    return { order: a.neededBy < b.neededBy ? -1 : 1, decidedBy: 'deadline' };
  }

  const conditionGap = CONDITION_RANK[b.minCondition] - CONDITION_RANK[a.minCondition];
  if (conditionGap !== 0) {
    return { order: conditionGap, decidedBy: 'condition_requirement' };
  }

  return {
    order: a.requestId < b.requestId ? -1 : a.requestId > b.requestId ? 1 : 0,
    decidedBy: 'request_id',
  };
}

/** Whole months of rent needed to cover `costCents`; null when there is no positive rent. */
export function paybackMonths(costCents: number, monthlyRentCents: number): number | null {
  if (!(monthlyRentCents > 0)) return null;
  if (costCents <= 0) return 0;
  return Math.ceil(costCents / monthlyRentCents);
}

export function decideSecondLife(candidates: readonly DecisionCandidate[]): SecondLifeDecision {
  const ordered = [...candidates].sort((a, b) => compareCandidates(a, b).order);

  const ranked: RankedCandidate[] = ordered.map((candidate, index) => {
    const months = paybackMonths(candidate.refurbishmentCostCents, candidate.monthlyNetRentCents);
    return {
      ...candidate,
      rank: index + 1,
      paybackMonths: months,
      viable: months !== null && months <= candidate.termMonths,
    };
  });

  if (ranked.length === 0) {
    return {
      refurbish: false,
      reason: 'no_eligible_candidate',
      winner: null,
      ranked,
      comparisons: [],
    };
  }

  const winner = ranked.find((candidate) => candidate.viable) ?? null;

  if (!winner) {
    return {
      refurbish: false,
      reason: 'cost_not_recovered',
      winner: null,
      ranked,
      comparisons: [],
    };
  }

  const comparisons = ranked
    .filter((other) => other.viable && other.requestId !== winner.requestId)
    .map((other) => ({
      winnerRequestId: winner.requestId,
      otherRequestId: other.requestId,
      decidedBy: compareCandidates(winner, other).decidedBy,
    }));

  return { refurbish: true, reason: 'refurbish_for_winner', winner, ranked, comparisons };
}
