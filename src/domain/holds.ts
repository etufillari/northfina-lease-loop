// Holding an item for a customer before it is free: a customer asks for an item that is still
// leased, or back and waiting for its check, to be held for them, and says what they need from
// it (a lease term, a monthly budget incl. VAT, a lowest condition). When it is refurbished,
// staff can hold it for one of the customers who asked (admin, Second life), and see whether
// the new price and condition fit what they asked for. A customer can withdraw a request, or
// let go of a hold (from a request or a pass-on they accepted), at any time: they may simply
// change their mind. Money is integer cents.
import type { AssetCondition, AssetStatus } from '@/data/schemas';
import { conditionRank, CONDITIONS } from './second-life';

/** The highest monthly budget we accept, so a typo can't ask for something absurd. */
export const MAX_HOLD_BUDGET_CENTS = 10_000_000; // 100,000 € a month

/** Only an item that isn't free yet can be asked for: a leased one, or one waiting for its check. */
export function canRequestHold(
  item: { status: AssetStatus; reservedFor: string | null },
  customerId: string | null
): boolean {
  if (!customerId) return false;
  if (item.reservedFor === customerId) return false; // already held for them
  return item.status === 'leased' || item.status === 'returned';
}

export type HoldRequestInput = {
  termMonths: number;
  maxMonthlyCents: number;
  minCondition: string;
};

export type HoldRequestProblem = 'unknown_term' | 'invalid_budget' | 'unknown_condition';

/** Why the requirements can't be used, or null if they can. `terms` are the terms on offer. */
export function checkHoldRequest(
  input: HoldRequestInput,
  terms: readonly number[]
): HoldRequestProblem | null {
  if (!terms.includes(input.termMonths)) return 'unknown_term';
  if (
    !Number.isInteger(input.maxMonthlyCents) ||
    input.maxMonthlyCents <= 0 ||
    input.maxMonthlyCents > MAX_HOLD_BUDGET_CENTS
  ) {
    return 'invalid_budget';
  }
  if (!(CONDITIONS as readonly string[]).includes(input.minCondition)) return 'unknown_condition';
  return null;
}

export type HoldFit = { fits: boolean; condition: boolean; budget: boolean };

/**
 * Whether the refurbished item suits what the customer asked for: at least their lowest
 * condition, and the monthly rent incl. VAT at their term within their budget. `monthlyGrossCents`
 * is null when the item can't be quoted at their term (then it doesn't fit).
 */
export function holdFits(
  request: { maxMonthlyCents: number; minCondition: AssetCondition },
  item: { condition: AssetCondition; monthlyGrossCents: number | null }
): HoldFit {
  const condition = conditionRank(item.condition) >= conditionRank(request.minCondition);
  const budget =
    item.monthlyGrossCents !== null && item.monthlyGrossCents <= request.maxMonthlyCents;
  return { fits: condition && budget, condition, budget };
}

export type HoldStatus = 'waiting' | 'held' | 'withdrawn';

/** A request's status on `today`, from its dates (time travel replays it). */
export function holdStatusOn(
  request: { heldDate: string | null; withdrawnDate: string | null },
  today: string
): HoldStatus {
  if (request.withdrawnDate !== null && request.withdrawnDate <= today) return 'withdrawn';
  if (request.heldDate !== null && request.heldDate <= today) return 'held';
  return 'waiting';
}
