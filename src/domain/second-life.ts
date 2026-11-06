// Smart Problem 3: second-life matchmaking (scenario card 9). Given a returned item's relist
// offer, decide whether refurbishing it is worth it, then rank the waiting list. Pure: the
// date, tables and waiting list are arguments.
import type {
  AssetCategory,
  AssetCondition,
  CoefficientTable,
  SecondLifeRequest,
  VatRate,
} from '@/data/schemas';
import { checkoutQuote } from './checkout-quote';

const conditionOrder: readonly AssetCondition[] = ['poor', 'fair', 'good', 'like_new', 'new'];
const rank = (condition: AssetCondition) => conditionOrder.indexOf(condition);

export type RefurbishDecision = {
  refurbish: boolean;
  reason: 'worth_it' | 'costs_more_than_value' | 'not_leasable';
  priceNetCents: number;
  refurbishmentCostCents: number;
  netResultCents: number;
};

/**
 * Refurbish when the item can be leased again and its price after the work is more than the
 * work costs. Otherwise it's retired (sold for parts or recycled), not refurbished at a loss.
 */
export function refurbishDecision(offer: {
  priceNetCents: number;
  refurbishmentCostCents: number;
  leasable: boolean;
}): RefurbishDecision {
  const netResultCents = offer.priceNetCents - offer.refurbishmentCostCents;
  const reason = !offer.leasable
    ? 'not_leasable'
    : netResultCents > 0
      ? 'worth_it'
      : 'costs_more_than_value';
  return {
    refurbish: reason === 'worth_it',
    reason,
    priceNetCents: offer.priceNetCents,
    refurbishmentCostCents: offer.refurbishmentCostCents,
    netResultCents,
  };
}

/** A check a waiting-list entry can fail. */
export type MatchCheck = 'condition' | 'budget' | 'term' | 'deadline';

export type Candidate = {
  request: SecondLifeRequest;
  /** Position on the waiting list, which is in sign-up order: 1 signed up first. */
  signupOrder: number;
  /** Net monthly rent for this item at the person's preferred term, or null if not offered. */
  monthlyNetCents: number | null;
  monthlyTotalCents: number | null;
  failed: MatchCheck[];
};

export type MatchResult = {
  /** Same-category entries: eligible ones first, in ranking order, then the rest. */
  candidates: Candidate[];
  winner: Candidate | null;
  /** Why the winner beat the runner-up. */
  decidedBy: 'only_match' | 'earliest_deadline' | 'earliest_signup' | null;
};

/**
 * Ranks the waiting list for one item. An entry is eligible when the item is in at least their
 * minimum condition, the rent at their preferred term fits their budget (net, as the list
 * states it), that term can be financed, and their deadline hasn't passed. Among eligible
 * entries the earliest deadline wins (the most urgent need); on the same deadline, whoever
 * signed up first wins. Both rules are deterministic, so the same list always gives the same
 * answer.
 */
export function matchWaitingList(
  item: { category: AssetCategory; condition: AssetCondition; priceNetCents: number },
  requests: readonly SecondLifeRequest[],
  today: string,
  table: CoefficientTable,
  rates: readonly VatRate[]
): MatchResult {
  const candidates = requests.flatMap((request, index): Candidate[] => {
    if (request.category !== item.category) return [];
    const quote = checkoutQuote(
      item.priceNetCents,
      0,
      request.preferred_term_months,
      today,
      table,
      rates
    );
    const failed: MatchCheck[] = [];
    if (rank(item.condition) < rank(request.min_condition)) failed.push('condition');
    if (!quote) failed.push('term');
    else if (quote.monthlyNetCents > request.max_monthly_net_rent_cents) failed.push('budget');
    if (request.needed_by < today) failed.push('deadline');
    return [
      {
        request,
        signupOrder: index + 1,
        monthlyNetCents: quote?.monthlyNetCents ?? null,
        monthlyTotalCents: quote?.monthlyTotalCents ?? null,
        failed,
      },
    ];
  });
  const eligible = candidates
    .filter((candidate) => !candidate.failed.length)
    .sort(
      (a, b) =>
        a.request.needed_by.localeCompare(b.request.needed_by) || a.signupOrder - b.signupOrder
    );
  const others = candidates.filter((candidate) => candidate.failed.length);
  const [winner, runnerUp] = eligible;
  return {
    candidates: [...eligible, ...others],
    winner: winner ?? null,
    decidedBy: !winner
      ? null
      : !runnerUp
        ? 'only_match'
        : winner.request.needed_by < runnerUp.request.needed_by
          ? 'earliest_deadline'
          : 'earliest_signup',
  };
}
