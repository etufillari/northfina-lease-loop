// Second-life matchmaking (Smart Problem 3), per docs/DECISIONS.md and the data pack's own
// note: an item must be at least 'good' to be listed again, but a waiting-list entry that
// accepts 'fair' can take it as-is. Matching is strictly first come, first served on
// joined_on. At most one condition upgrade per return, and only when it pays or is needed.
import type {
  Asset,
  AssetCategory,
  AssetCondition,
  CoefficientTable,
  RefurbishmentCosts,
  ResidualCurves,
  SecondLifeRequest,
} from '@/data/schemas';
import { quoteFor } from './pricing';
import { ageInMonths, marketValueCents } from './residual';
import { serviceInterval, valueUsage } from './usage';

// Worst to best; a waiter's min_condition is met by anything at or above it.
const CONDITION_ORDER: readonly AssetCondition[] = ['poor', 'fair', 'good', 'like_new', 'new'];
const rank = (c: AssetCondition) => CONDITION_ORDER.indexOf(c);

export function meetsMinCondition(condition: AssetCondition, min: AssetCondition): boolean {
  return rank(condition) >= rank(min);
}

/** One step better, or null at the top. */
export function nextConditionUp(condition: AssetCondition): AssetCondition | null {
  return CONDITION_ORDER[rank(condition) + 1] ?? null;
}

export type RefurbishmentItem = { id: string; costCents: number; resetsUsage: boolean };

/**
 * The fixed refurbishment work a return needs: "always" items, usage-triggered items read
 * from the data's `when` text (`usage.value >= N ...`, on usage since the last reset), and
 * interval servicing (`per started N <unit> since last service`): one service per started
 * interval since the last one, which resets that counter (src/domain/usage.ts).
 */
export function requiredRefurbishments(
  asset: Pick<Asset, 'category' | 'usage'>,
  costs: RefurbishmentCosts
): { items: RefurbishmentItem[]; totalCents: number; resetsUsage: boolean } {
  const items: RefurbishmentItem[] = [];
  for (const fixed of costs[asset.category].fixed) {
    const interval = serviceInterval(fixed.when);
    if (interval !== null) {
      const services = Math.ceil(asset.usage.value / interval);
      if (services > 0) {
        items.push({ id: fixed.id, costCents: fixed.cost_cents * services, resetsUsage: true });
      }
      continue;
    }
    const threshold = /usage\.value >= (\d+)/.exec(fixed.when);
    const applies =
      fixed.when === 'always' || (threshold !== null && asset.usage.value >= Number(threshold[1]));
    if (applies) {
      items.push({
        id: fixed.id,
        costCents: fixed.cost_cents,
        resetsUsage: fixed.resets_usage ?? false,
      });
    }
  }
  return {
    items,
    totalCents: items.reduce((sum, i) => sum + i.costCents, 0),
    resetsUsage: items.some((i) => i.resetsUsage),
  };
}

export type WaiterVerdict = {
  id: string;
  joinedOn: string;
  outcome:
    | 'matched'
    | 'lost_first_come_first_served'
    | 'condition_below_minimum'
    | 'deadline_passed'
    | 'over_budget'
    | 'under_budget'
    | 'unpriceable'
    /** Wants several, and too few matching items are free right now (the desk's set rule). */
    | 'set_incomplete';
  monthlyNetRentCents?: number;
};

export type MatchResult = { winner: SecondLifeRequest | null; considered: WaiterVerdict[] };

/**
 * Who gets the item: filter the list by category, minimum condition, deadline (as-of date)
 * and budget against the rent at each waiter's own preferred term, then first come, first
 * served on joined_on (id as the final tie-break). Every candidate gets a reason.
 */
export function matchWaitingList(
  input: {
    category: AssetCategory;
    condition: AssetCondition;
    financedCents: number;
    asOfDate: string;
  },
  demand: readonly SecondLifeRequest[],
  table: CoefficientTable
): MatchResult {
  const candidates = demand
    .filter((w) => w.category === input.category)
    .sort((a, b) => a.joined_on.localeCompare(b.joined_on) || a.id.localeCompare(b.id));

  let winner: SecondLifeRequest | null = null;
  const considered: WaiterVerdict[] = [];
  for (const waiter of candidates) {
    const base = { id: waiter.id, joinedOn: waiter.joined_on };
    if (waiter.needed_by < input.asOfDate) {
      considered.push({ ...base, outcome: 'deadline_passed' });
      continue;
    }
    if (!meetsMinCondition(input.condition, waiter.min_condition)) {
      considered.push({ ...base, outcome: 'condition_below_minimum' });
      continue;
    }
    const quote = quoteFor({
      listPriceCents: input.financedCents,
      downPaymentCents: 0,
      termMonths: waiter.preferred_term_months,
      table,
    });
    if (!quote.ok) {
      considered.push({ ...base, outcome: 'unpriceable' });
      continue;
    }
    const rent = quote.quote.monthlyNetRentCents;
    if (rent > waiter.max_monthly_net_rent_cents) {
      considered.push({ ...base, outcome: 'over_budget', monthlyNetRentCents: rent });
      continue;
    }
    if (rent < waiter.min_monthly_net_rent_cents) {
      considered.push({ ...base, outcome: 'under_budget', monthlyNetRentCents: rent });
      continue;
    }
    if (winner === null) {
      winner = waiter;
      considered.push({ ...base, outcome: 'matched', monthlyNetRentCents: rent });
    } else {
      considered.push({
        ...base,
        outcome: 'lost_first_come_first_served',
        monthlyNetRentCents: rent,
      });
    }
  }
  return { winner, considered };
}

/** The smallest amount a lease can finance (band A minimum, docs/DECISIONS.md). */
export const MIN_FINANCED_CENTS = 30_000;

export type UpgradeReason =
  /** Without it nobody on the waiting list accepts the item. */
  | 'serve_waiter'
  /** Without it the item cannot be listed (below 'good'); with it, it pays for its work. */
  | 'reach_listing'
  /** Listable already, but the value it adds is more than it costs. */
  | 'pays_for_itself';

export type SecondLifeDecision = {
  requiredItems: RefurbishmentItem[];
  requiredTotalCents: number;
  usageAfterRefurb: number;
  /** Market value exactly as it came back: its condition and its usage before any work. */
  valueAsReturnedCents: number;
  /** Market value after the mandatory work (a new battery resets the usage), no upgrade. */
  valueAsIsCents: number;
  upgrade: {
    from: AssetCondition;
    to: AssetCondition;
    costCents: number;
    reason: UpgradeReason;
  } | null;
  /** Market value at the condition the item ends up in. */
  valueFinalCents: number;
  /** Everything Northfina spends on the item: mandatory work + any upgrade. */
  workTotalCents: number;
  /**
   * The financed amount of the next lease: the market value after the work. Northfina pays
   * for the work itself — the customer pays for what the item is worth, never twice for a
   * new battery (once in the higher value and again as a cost).
   */
  financedCents: number;
  action: 'lease_to_waiter' | 'list_available' | 'parts_bin';
  winnerId: string | null;
  considered: WaiterVerdict[];
};

/**
 * The whole second-life call for one returned asset, as one deterministic decision. The
 * item is priced at its market value after the work; Northfina pays for the work, so every
 * piece of work has to pay for itself against the alternative:
 * 1. Mandatory work is always part of a relisting (and may reset the usage counter). An item
 *    whose value after it does not exceed its cost goes to parts.
 * 2. As-is first: 'fair' may go to a waiter who accepts fair; 'good' or better to anyone.
 * 3. At most one condition upgrade per return, only when it pays for itself:
 *    - the item is listable already ('good' or better, at least €300): the value it adds must
 *      exceed its cost — a good item nobody takes can become like-new if that is worth it;
 *    - the item is not listable without it: the value after all the work must exceed
 *      everything spent on it and reach €300 — otherwise parts is the better deal.
 *    A worthwhile upgrade serves a waiter first, else the catalogue.
 * 4. Anything else that can be listed is; the rest goes to parts.
 */
export function secondLifeDecision(
  input: { asset: Asset; originalListPriceCents: number; asOfDate: string },
  data: {
    curves: ResidualCurves;
    costs: RefurbishmentCosts;
    demand: readonly SecondLifeRequest[];
    table: CoefficientTable;
  }
): SecondLifeDecision {
  const { asset, originalListPriceCents, asOfDate } = input;
  const required = requiredRefurbishments(asset, data.costs);
  const usageAfterRefurb = required.resetsUsage ? 0 : asset.usage.value;
  const ageMonths = ageInMonths(asset.model_year, asOfDate);
  // Market value reads usage since the last battery, or the lifetime total (src/domain/usage.ts).
  const valueAt = (condition: AssetCondition, sinceReset: number) =>
    marketValueCents(
      {
        originalListPriceCents,
        category: asset.category,
        condition,
        usageValue: valueUsage(asset, data.costs, sinceReset),
        ageMonths,
      },
      data.curves
    );
  const match = (condition: AssetCondition, financedCents: number) =>
    matchWaitingList(
      { category: asset.category, condition, financedCents, asOfDate },
      data.demand,
      data.table
    );

  const valueAsIsCents = valueAt(asset.condition, usageAfterRefurb);
  const base = {
    requiredItems: required.items,
    requiredTotalCents: required.totalCents,
    usageAfterRefurb,
    valueAsReturnedCents: valueAt(asset.condition, asset.usage.value),
    valueAsIsCents,
  };
  const asIs = {
    ...base,
    upgrade: null,
    valueFinalCents: valueAsIsCents,
    workTotalCents: required.totalCents,
    financedCents: valueAsIsCents,
  };
  const parts: SecondLifeDecision = {
    ...asIs,
    action: 'parts_bin',
    winnerId: null,
    considered: [],
  };
  const asIsPays = valueAsIsCents > required.totalCents;
  const listableAsIs =
    rank(asset.condition) >= rank('good') && valueAsIsCents >= MIN_FINANCED_CENTS && asIsPays;

  // Step 2: as-is to a waiter ('poor' is never leased as-is).
  const asIsMatch =
    rank(asset.condition) >= rank('fair') && asIsPays
      ? match(asset.condition, valueAsIsCents)
      : null;
  if (asIsMatch?.winner) {
    return {
      ...asIs,
      action: 'lease_to_waiter',
      winnerId: asIsMatch.winner.id,
      considered: asIsMatch.considered,
    };
  }

  // Step 3: one upgrade, if the data prices it and it pays for itself.
  const to = nextConditionUp(asset.condition);
  const upgradeCost = to
    ? data.costs[asset.category].condition_upgrades[`${asset.condition}->${to}`]
    : undefined;
  if (to && upgradeCost !== undefined) {
    const valueUpgraded = valueAt(to, usageAfterRefurb);
    const workTotalCents = required.totalCents + upgradeCost;
    const pays = listableAsIs
      ? valueUpgraded - valueAsIsCents > upgradeCost
      : valueUpgraded > workTotalCents && valueUpgraded >= MIN_FINANCED_CENTS;
    if (pays) {
      const upgraded = {
        ...base,
        valueFinalCents: valueUpgraded,
        workTotalCents,
        financedCents: valueUpgraded,
      };
      const upgradedMatch = match(to, valueUpgraded);
      const upgrade = { from: asset.condition, to, costCents: upgradeCost };
      if (upgradedMatch.winner) {
        return {
          ...upgraded,
          upgrade: { ...upgrade, reason: listableAsIs ? 'pays_for_itself' : 'serve_waiter' },
          action: 'lease_to_waiter',
          winnerId: upgradedMatch.winner.id,
          considered: upgradedMatch.considered,
        };
      }
      if (rank(to) >= rank('good')) {
        return {
          ...upgraded,
          upgrade: { ...upgrade, reason: listableAsIs ? 'pays_for_itself' : 'reach_listing' },
          action: 'list_available',
          winnerId: null,
          considered: upgradedMatch.considered,
        };
      }
    }
  }

  // Step 4: listable as it is, or parts.
  if (listableAsIs) {
    return {
      ...asIs,
      action: 'list_available',
      winnerId: null,
      considered: asIsMatch?.considered ?? [],
    };
  }
  return parts;
}
