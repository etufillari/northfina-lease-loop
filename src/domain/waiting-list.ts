// Who on the waiting list gets a returned item, and why (Smart Problem 3, card 9, D-032).
// Pure: the item, the refurbishment costs, the waiting list, the date the item is ready and
// the rent it would be offered at all come in as arguments.

import type { AssetCondition, RefurbishmentCosts, SecondLifeRequest } from '@/data/schemas';
import {
  leasableTargetFor,
  refurbishPlan,
  type RefurbishPlan,
  type ReturnedItem,
} from './refurbishment';

/**
 * Monthly net rent (whole cents) for the item in this condition over this term, or null when
 * it can't be priced. The second-life valuation (#14) supplies it; it rounds, we don't.
 */
export type RentFor = (condition: AssetCondition, termMonths: number) => number | null;

export interface WaitingEntry {
  request: SecondLifeRequest;
  /** First come, first served. The data has no sign-up date, so this is the list position. */
  signupOrder: number;
}

export interface MatchInput {
  item: ReturnedItem;
  /** ISO date the item is ready for its next lessee (after refurbishment). */
  availableOn: string;
  entries: readonly WaitingEntry[];
  costs: RefurbishmentCosts;
  rentFor: RentFor;
}

export type ExclusionReason =
  'category_mismatch' | 'deadline_passed' | 'condition_unreachable' | 'no_price' | 'over_budget';

/** The ranking keys, in the order they are applied. */
export type TieBreakKey = 'refurbishment_cost' | 'needed_by' | 'signup_order' | 'request_id';

export interface RankedMatch {
  rank: number;
  requestId: string;
  plan: Extract<RefurbishPlan, { ok: true }>;
  termMonths: number;
  monthlyRentCents: number;
  maxMonthlyRentCents: number;
  neededBy: string;
  signupOrder: number;
  /** The first key on which this entry beats the next one; null for the last. */
  winsOverNextBy: TieBreakKey | null;
}

export interface Exclusion {
  requestId: string;
  /** Every reason that applies, in check order. Never empty. */
  reasons: ExclusionReason[];
  /** The rent we would have offered, when we got that far. */
  monthlyRentCents: number | null;
}

export interface MatchResult {
  ranked: RankedMatch[];
  /** In request id order. */
  excluded: Exclusion[];
}

/** Numbers a waiting list by its order in the data file, from 1 (first come, first served). */
export function inSignupOrder(requests: readonly SecondLifeRequest[]): WaitingEntry[] {
  return requests.map((request, i) => ({ request, signupOrder: i + 1 }));
}

type Candidate = Omit<RankedMatch, 'rank' | 'winsOverNextBy'>;

/** Ranking keys, most important first. Lower wins on each. ISO dates compare as strings. */
const KEYS: readonly [TieBreakKey, (c: Candidate) => number | string][] = [
  ['refurbishment_cost', (c) => c.plan.totalCents],
  ['needed_by', (c) => c.neededBy],
  ['signup_order', (c) => c.signupOrder],
  ['request_id', (c) => c.requestId],
];

/** The first key on which a and b differ, and which of them it favours. */
function decidingKey(a: Candidate, b: Candidate): { key: TieBreakKey; order: number } | null {
  for (const [key, value] of KEYS) {
    const [va, vb] = [value(a), value(b)];
    if (va !== vb) return { key, order: va < vb ? -1 : 1 };
  }
  return null;
}

function assess(input: MatchInput, entry: WaitingEntry): Candidate | Exclusion {
  const { request, signupOrder } = entry;
  const exclusion = (reasons: ExclusionReason[], rent: number | null = null): Exclusion => ({
    requestId: request.id,
    reasons,
    monthlyRentCents: rent,
  });
  if (request.category !== input.item.category) return exclusion(['category_mismatch']);

  const reasons: ExclusionReason[] = [];
  if (input.availableOn > request.needed_by) reasons.push('deadline_passed');

  const plan = refurbishPlan(input.costs, input.item, leasableTargetFor(request.min_condition));
  if (!plan.ok) return exclusion([...reasons, 'condition_unreachable']);

  const termMonths = request.preferred_term_months;
  const rent = input.rentFor(plan.conditionAfter, termMonths);
  if (rent === null) reasons.push('no_price');
  else if (rent > request.max_monthly_net_rent_cents) reasons.push('over_budget');
  if (reasons.length > 0 || rent === null) return exclusion(reasons, rent);

  return {
    requestId: request.id,
    plan,
    termMonths,
    monthlyRentCents: rent,
    maxMonthlyRentCents: request.max_monthly_net_rent_cents,
    neededBy: request.needed_by,
    signupOrder,
  };
}

/**
 * Filters the waiting list for a returned item, then ranks who is left:
 * 1. least refurbishment cost (the item goes to whoever it already fits; it saves upgrades
 *    for items that need them and gets the item out sooner),
 * 2. earliest `needed_by` (the most urgent need),
 * 3. earliest sign-up (first come, first served),
 * 4. request id, so the order is total and never depends on the input order.
 * Each match says which key put it ahead of the next; each exclusion says why.
 */
export function matchWaitingList(input: MatchInput): MatchResult {
  const candidates: Candidate[] = [];
  const excluded: Exclusion[] = [];
  for (const entry of input.entries) {
    const result = assess(input, entry);
    if ('reasons' in result) excluded.push(result);
    else candidates.push(result);
  }

  candidates.sort((a, b) => decidingKey(a, b)?.order ?? 0);
  excluded.sort((a, b) => (a.requestId < b.requestId ? -1 : a.requestId > b.requestId ? 1 : 0));

  const ranked = candidates.map((candidate, i): RankedMatch => {
    const next = candidates[i + 1];
    return {
      ...candidate,
      rank: i + 1,
      winsOverNextBy: next ? (decidingKey(candidate, next)?.key ?? null) : null,
    };
  });
  return { ranked, excluded };
}
