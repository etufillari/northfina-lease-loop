// Second-life matchmaking (smart problem 3, D13, D61): who on the waiting list gets a returned
// item, in which condition, at what rent, and whether it is refurbished beyond the mandatory
// steps.
//
// 1. Each entry's verdict, the first failing step named:
//    other category → already matched to another item (D62) → needed before the assessment day
//    (D62) → the term is not offered for the category (D43) → the condition the entry
//    needs cannot be reached → the rent cannot be priced on that term → over budget.
//    The condition an entry is offered is the lowest that satisfies it: max(as returned, its
//    minimum, fair). Fair is the floor for anyone (D61: the cost table's note, "a returned item
//    must reach at least good, unless a waiting-list entry accepts fair").
// 2. The ranking of the candidates, D13: no refurbishment beyond the mandatory steps first,
//    then the earliest `needed_by`, then the highest total rent over the term, then the lower
//    id. Each row names the step that put it below the row above.
// 3. The decision (D61, D86): the winner's condition. With no winner (D86, replacing D61's
//    "relist at good"), the option with the largest net gain (value gain − extra cost over the
//    as-returned option, `comparison`), as returned when none is positive, and never below the
//    catalogue floor, good (the cost table's note): among the options at or above
//    max(as returned, good), the largest net gain wins, the lower condition on a tie. So the
//    item is refurbished beyond the mandatory steps when the winner needs it, which by step
//    one means nobody was matched without it, or with no-one waiting when the work pays for
//    itself or the item is below good. With no winner and no option at or above the floor
//    that any term can price, `relist_unpriced`: the assessment refuses to relist it.
import type { AssetCategory, AssetCondition, SecondLifeRequest } from '@/data/schemas';
import {
  CONDITION_ORDER,
  conditionRank,
  type ReturnAssessmentResult,
  type ReturnOption,
} from './assess';

/** D61: the lowest condition an entry may accept, and the one an item is relisted at for anyone. */
export const WAITING_LIST_FLOOR: AssetCondition = 'fair';
export const RELIST_FLOOR: AssetCondition = 'good';

export type CandidateParams = {
  condition: AssetCondition;
  upgrade: boolean;
  termMonths: number;
  monthlyNetCents: number;
  maxMonthlyNetCents: number;
  totalRentCents: number;
};

export type MatchOutcome =
  | { code: 'other_category'; params: { category: AssetCategory } }
  | { code: 'already_matched'; params: Record<string, never> }
  | { code: 'expired'; params: { neededBy: string; isoDate: string } }
  | { code: 'term_not_offered'; params: { termMonths: number; terms: number[] } }
  | { code: 'condition_unreachable'; params: { minCondition: AssetCondition } }
  | { code: 'rent_not_priced'; params: { termMonths: number; refusal: string } }
  | {
      code: 'over_budget';
      params: {
        condition: AssetCondition;
        termMonths: number;
        monthlyNetCents: number;
        maxMonthlyNetCents: number;
        shortCents: number;
      };
    }
  | { code: 'candidate'; params: CandidateParams };

export type Verdict = { demandId: string; neededBy: string; outcome: MatchOutcome };

/** The D13 step that ranked a row below the row above it. */
export type RankStep = 'no_refurbishment' | 'needed_by' | 'total_rent' | 'id';

export type RankedCandidate = CandidateParams & {
  demandId: string;
  neededBy: string;
  rank: number;
  /** Null for the first row. */
  decidedBy: RankStep | null;
};

export type MatchDecision =
  | {
      code: 'relist_for_winner';
      params: { condition: AssetCondition; upgrade: boolean; demandId: string };
    }
  | { code: 'relist_without_match'; params: { condition: AssetCondition; upgrade: boolean } }
  /** No winner and nothing the catalogue can lease: the assessment refuses to relist. */
  | { code: 'relist_unpriced'; params: { condition: AssetCondition; upgrade: boolean } };

export type MatchResult = {
  verdicts: Verdict[];
  ranking: RankedCandidate[];
  winner: RankedCandidate | null;
  decision: MatchDecision;
  /** The option the item is relisted with; on `relist_unpriced` the highest, never written. */
  relist: ReturnOption;
};

const atLeast = (...conditions: AssetCondition[]): AssetCondition =>
  CONDITION_ORDER[Math.max(...conditions.map(conditionRank))]!;

function verdictOf(
  assessed: ReturnAssessmentResult,
  category: AssetCategory,
  entry: SecondLifeRequest,
  taken: ReadonlySet<string>
): MatchOutcome {
  if (entry.category !== category) {
    return { code: 'other_category', params: { category: entry.category } };
  }
  if (taken.has(entry.id)) return { code: 'already_matched', params: {} };
  // ISO days compare as strings; needed on the assessment day itself still counts.
  if (entry.needed_by < assessed.isoDate) {
    return { code: 'expired', params: { neededBy: entry.needed_by, isoDate: assessed.isoDate } };
  }
  const termMonths = entry.preferred_term_months;
  const terms = assessed.options[0]!.rents.map((r) => r.termMonths);
  if (!terms.includes(termMonths)) {
    return { code: 'term_not_offered', params: { termMonths, terms } };
  }
  const condition = atLeast(assessed.returnedCondition, entry.min_condition, WAITING_LIST_FLOOR);
  const option = assessed.options.find((o) => o.condition === condition);
  if (!option)
    return { code: 'condition_unreachable', params: { minCondition: entry.min_condition } };
  const rent = option.rents.find((r) => r.termMonths === termMonths)!;
  if (rent.monthlyNetCents === null) {
    return { code: 'rent_not_priced', params: { termMonths, refusal: rent.refusal ?? 'unknown' } };
  }
  const maxMonthlyNetCents = entry.max_monthly_net_rent_cents;
  if (rent.monthlyNetCents > maxMonthlyNetCents) {
    return {
      code: 'over_budget',
      params: {
        condition,
        termMonths,
        monthlyNetCents: rent.monthlyNetCents,
        maxMonthlyNetCents,
        shortCents: rent.monthlyNetCents - maxMonthlyNetCents,
      },
    };
  }
  return {
    code: 'candidate',
    params: {
      condition,
      upgrade: option.upgrade,
      termMonths,
      monthlyNetCents: rent.monthlyNetCents,
      maxMonthlyNetCents,
      totalRentCents: rent.monthlyNetCents * termMonths,
    },
  };
}

type Candidate = CandidateParams & { demandId: string; neededBy: string };

/** The first D13 step on which `a` and `b` differ, and its sign (negative: `a` ranks first). */
function firstDifference(a: Candidate, b: Candidate): { step: RankStep; sign: number } | null {
  if (a.upgrade !== b.upgrade) return { step: 'no_refurbishment', sign: a.upgrade ? 1 : -1 };
  if (a.neededBy !== b.neededBy)
    return { step: 'needed_by', sign: a.neededBy < b.neededBy ? -1 : 1 };
  if (a.totalRentCents !== b.totalRentCents) {
    return { step: 'total_rent', sign: b.totalRentCents - a.totalRentCents };
  }
  // By the numbers inside the ids, so a surprise wait-100 ranks after wait-14 (finding 12).
  if (a.demandId !== b.demandId) {
    return { step: 'id', sign: a.demandId.localeCompare(b.demandId, 'en', { numeric: true }) };
  }
  return null;
}

/**
 * D86 with no winner: among the options the catalogue may lease (at or above max(as returned,
 * good), with a rent on some term), the largest net gain over the as-returned option; the lower
 * condition on a tie, so the as-returned option (net 0) wins when nothing is positive. Null
 * when no option can be leased: the caller refuses to relist (`relist_unpriced`).
 */
function bestWithoutMatch(
  options: readonly ReturnOption[],
  returned: AssetCondition
): ReturnOption | null {
  const floor = conditionRank(atLeast(returned, RELIST_FLOOR));
  const net = (o: ReturnOption) => o.comparison?.netGainCents ?? 0;
  // At or above the floor and priced on at least one term: an option under band A's minimum
  // financed amount cannot be leased at all (laptop-006, good: 27 577 < 30 000).
  const leasable = options.filter(
    (o) => conditionRank(o.condition) >= floor && o.rents.some((r) => r.monthlyNetCents !== null)
  );
  if (leasable.length === 0) return null;
  return leasable.reduce((best, o) => (net(o) > net(best) ? o : best));
}

/**
 * D13 and D61 over `demand`, for the assessed item. `taken`: the entries an earlier assessment
 * already matched, so one entry never wins two items (D62).
 */
export function matchDemand(
  assessed: ReturnAssessmentResult,
  demand: readonly SecondLifeRequest[],
  taken: readonly string[] = []
): MatchResult {
  const takenIds = new Set(taken);
  const { category } = assessed;
  const verdicts: Verdict[] = demand.map((entry) => ({
    demandId: entry.id,
    neededBy: entry.needed_by,
    outcome: verdictOf(assessed, category, entry, takenIds),
  }));

  const candidates: Candidate[] = verdicts.flatMap((v) =>
    v.outcome.code === 'candidate'
      ? [{ ...v.outcome.params, demandId: v.demandId, neededBy: v.neededBy }]
      : []
  );
  candidates.sort((a, b) => firstDifference(a, b)?.sign ?? 0);
  const ranking: RankedCandidate[] = candidates.map((c, i) => ({
    ...c,
    rank: i + 1,
    decidedBy: i === 0 ? null : (firstDifference(candidates[i - 1]!, c)?.step ?? null),
  }));
  const winner = ranking[0] ?? null;

  const best = winner
    ? (assessed.options.find((o) => o.condition === winner.condition) ?? null)
    : bestWithoutMatch(assessed.options, assessed.returnedCondition);
  const relist = best ?? assessed.options.at(-1)!;
  const params = { condition: relist.condition, upgrade: relist.upgrade };
  const decision: MatchDecision = winner
    ? { code: 'relist_for_winner', params: { ...params, demandId: winner.demandId } }
    : { code: best ? 'relist_without_match' : 'relist_unpriced', params };

  return { verdicts, ranking, winner, decision, relist };
}
