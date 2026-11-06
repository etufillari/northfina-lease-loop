// Pass it on to someone from the waiting list (D-048, #64). The judges' definition: the next
// person can be someone the customer names or someone waiting for a used item. We rank the
// waiting list with the second-life matcher (D-032) as the item will be on the handover day: its
// inspected condition and usage, priced by the second-life valuation (D-035). Pure; the browser
// previews it and the server decides again with the same function (D-018).

import type { AssetCondition, SecondLifeRequest } from '@/data/schemas';
import type { Inspection } from './end-of-term';
import {
  secondLifeRentFor,
  type SecondLifeData,
  type SecondLifeItem,
  type SecondLifeOption,
} from './second-life';
import { inSignupOrder, matchWaitingList, type RankedMatch } from './waiting-list';

const WAITING_LIST_ID = /^wait-\d+$/;

/** True for a waiting-list request id such as `wait-02`. */
export function isWaitingListId(value: string): boolean {
  return WAITING_LIST_ID.test(value);
}

/**
 * The day the item is ready for its next lessee: the handover day, or today when that has passed
 * (a late choice). ISO dates compare as strings.
 */
export function passOnReadyOn(today: string, handoverDate: string): string {
  return handoverDate > today ? handoverDate : today;
}

/**
 * The waiting list ranked for the item as inspected at the handover, best match first. The rent
 * each would pay is valued on the day the item is ready.
 */
export function passOnMatches(
  data: SecondLifeData,
  demand: readonly SecondLifeRequest[],
  leased: SecondLifeItem,
  inspection: Inspection,
  readyOn: string
): RankedMatch[] {
  const item: SecondLifeItem = {
    ...leased,
    condition: inspection.condition,
    usage: { unit: leased.usage.unit, value: inspection.usageValue },
  };
  return matchWaitingList({
    item,
    availableOn: readyOn,
    entries: inSignupOrder(demand),
    costs: data.costs,
    rentFor: secondLifeRentFor(data, item, readyOn),
  }).ranked;
}

export type WaitingListChoiceProblem = 'unknown_waiting_list_entry' | 'waiting_list_not_a_match';

/** Null when `requestId` is one of the ranked matches; otherwise why it can't be chosen. */
export function waitingListChoiceProblem(
  demand: readonly SecondLifeRequest[],
  ranked: readonly RankedMatch[],
  requestId: string
): WaitingListChoiceProblem | null {
  if (!demand.some((r) => r.id === requestId)) return 'unknown_waiting_list_entry';
  return ranked.some((m) => m.requestId === requestId) ? null : 'waiting_list_not_a_match';
}

export type HandOverPlan =
  | { ok: true; target: AssetCondition; termMonths: number; monthlyNetRentCents: number }
  | { ok: false; reason: 'too_early'; opensOn: string }
  | { ok: false; reason: 'waiting_list_not_a_match' | 'no_price' };

export interface HandOverPlanInput {
  /** The ending's next lessee: a persona id, an email or a waiting-list id. */
  nextLessee: string;
  /** The term of the contract being ended: a named next person gets the same. */
  contractTermMonths: number;
  today: string;
  /** The ending's effective date: the item is free from this day. */
  handoverDate: string;
  /** The waiting list ranked for the returned item today. */
  ranked: readonly (Pick<RankedMatch, 'requestId' | 'termMonths'> & {
    plan: Pick<RankedMatch['plan'], 'conditionAfter'>;
  })[];
  /** The conditions it can be re-listed at, cheapest first, with their rents. */
  options: readonly Pick<SecondLifeOption, 'target' | 'rents'>[];
}

/**
 * What "Hand it over now" re-lists the item at and quotes for the next person (#65). Not before
 * the handover day: contract 1 runs until the day before, and a quote signed earlier would start
 * contract 2 on top of it. A waiting-list entry gets the condition and term it asked for; anyone
 * else the cheapest condition and the term they took over. Refuses before anything is written
 * when that can't be priced.
 */
export function handOverPlan(input: HandOverPlanInput): HandOverPlan {
  if (input.today < input.handoverDate) {
    return { ok: false, reason: 'too_early', opensOn: input.handoverDate };
  }
  let target: AssetCondition | undefined;
  let termMonths = input.contractTermMonths;
  if (isWaitingListId(input.nextLessee)) {
    const match = input.ranked.find((m) => m.requestId === input.nextLessee);
    if (!match) return { ok: false, reason: 'waiting_list_not_a_match' };
    target = match.plan.conditionAfter;
    termMonths = match.termMonths;
  } else {
    target = input.options[0]?.target;
  }
  const rent = input.options
    .find((o) => o.target === target)
    ?.rents.find((r) => r.termMonths === termMonths)?.monthlyNetRentCents;
  if (target === undefined || rent === undefined || rent === null) {
    return { ok: false, reason: 'no_price' };
  }
  return { ok: true, target, termMonths, monthlyNetRentCents: rent };
}
