// Time travel that goes both ways: what an item and a contract looked like on a given date.
//
// Every change to an item is a dated record: a lease starting, a lease ending (returned,
// passed on or bought), a pass-on accepted, a refurbishment. To see the item on a date we
// start from how the data pack describes it and replay only the records up to that date.
// Contracts signed later don't exist yet; leases that ended later are still running.
//
// Writing to the past is not allowed: an item with records dated after the app's date can't be
// changed until you travel forward to its present (see hasEventsAfter). Otherwise one item
// could get two overlapping histories.
import type { AssetCondition, AssetStatus } from '@/data/schemas';

export type AssetSnapshot = {
  status: AssetStatus;
  condition: AssetCondition;
  usageValue: number;
  secondLifePriceCents: number | null;
  reservedFor: string | null;
};

export type AssetEvent =
  | { date: string; kind: 'leased' }
  | { date: string; kind: 'closed'; to: 'returned' | 'sold' }
  | { date: string; kind: 'held_for'; customerId: string }
  | {
      date: string;
      kind: 'refurbished';
      condition: AssetCondition;
      usageValue: number;
      priceCents: number;
    };

/** Same-day order: a lease ends, then a pass-on is accepted, then the refurbishment, then a new lease. */
const SAME_DAY_ORDER: Record<AssetEvent['kind'], number> = {
  closed: 0,
  held_for: 1,
  refurbished: 2,
  leased: 3,
};

export function hasEventsAfter(events: readonly AssetEvent[], today: string): boolean {
  return events.some((event) => event.date > today);
}

/** The item on `today`: `start` (the data pack's description) with every record up to then. */
export function assetStateOn(
  start: AssetSnapshot,
  events: readonly AssetEvent[],
  today: string
): AssetSnapshot {
  const replay = events
    .filter((event) => event.date <= today)
    .sort(
      (a, b) => a.date.localeCompare(b.date) || SAME_DAY_ORDER[a.kind] - SAME_DAY_ORDER[b.kind]
    );
  let state: AssetSnapshot = { ...start };
  for (const event of replay) {
    switch (event.kind) {
      case 'leased':
        state = { ...state, status: 'leased', reservedFor: null };
        break;
      case 'closed':
        state = { ...state, status: event.to };
        break;
      case 'held_for':
        state = { ...state, reservedFor: event.customerId };
        break;
      case 'refurbished':
        state = {
          ...state,
          condition: event.condition,
          usageValue: event.usageValue,
          secondLifePriceCents: event.priceCents,
          status: state.reservedFor ? 'reserved' : 'available',
        };
        break;
    }
  }
  return state;
}

export type DatedContract = {
  signedDate: string;
  status: string;
  returnedDate: string | null;
  boughtDate: string | null;
};

/**
 * A contract as it was on `today`: `null` if it wasn't signed yet; still active if it ended
 * (was returned, passed on or bought) after `today`.
 */
export function contractOn<T extends DatedContract>(contract: T, today: string): T | null {
  if (contract.signedDate > today) return null;
  const closedOn = contract.boughtDate ?? contract.returnedDate;
  if (contract.status !== 'active' && closedOn !== null && closedOn > today) {
    return { ...contract, status: 'active', returnedDate: null, boughtDate: null };
  }
  return contract;
}
