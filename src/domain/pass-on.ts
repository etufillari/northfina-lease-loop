// Pass it on to someone from the waiting list (D-048, #64). The judges' definition: the next
// person can be someone the customer names or someone waiting for a used item. We rank the
// waiting list with the second-life matcher (D-032) as the item will be on the handover day: its
// inspected condition and usage, priced by the second-life valuation (D-035). Pure; the browser
// previews it and the server decides again with the same function (D-018).

import type { SecondLifeRequest } from '@/data/schemas';
import type { Inspection } from './end-of-term';
import { secondLifeRentFor, type SecondLifeData, type SecondLifeItem } from './second-life';
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
