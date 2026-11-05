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
 * The fixed refurbishment work a return needs: "always" items, and usage-triggered items
 * read from the data's `when` text (`usage.value >= N ...`). The farm machines'
 * "per started 1000 engine_hours" servicing is out of scope for v1 (docs/DECISIONS.md).
 */
export function requiredRefurbishments(
  asset: Pick<Asset, 'category' | 'usage'>,
  costs: RefurbishmentCosts
): { items: RefurbishmentItem[]; totalCents: number; resetsUsage: boolean } {
  const items: RefurbishmentItem[] = [];
  for (const fixed of costs[asset.category].fixed) {
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
    | 'unpriceable';
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

export type SecondLifeDecision = {
  requiredItems: RefurbishmentItem[];
  requiredTotalCents: number;
  usageAfterRefurb: number;
  valueAsIsCents: number;
  upgrade: { from: AssetCondition; to: AssetCondition; costCents: number } | null;
  /** Market value at the condition the item ends up in. */
  valueFinalCents: number;
  /** valueFinal + all refurbishment spent: the financed amount of the next lease. */
  financedCents: number;
  action: 'lease_to_waiter' | 'list_available' | 'parts_bin';
  winnerId: string | null;
  considered: WaiterVerdict[];
};

/**
 * The whole second-life call for one returned asset, as one deterministic decision:
 * 1. Mandatory work is always done (and may reset the usage counter).
 * 2. As-is first: 'fair' may go to a waiter who accepts fair; 'good' or better to anyone.
 * 3. Otherwise one condition upgrade (never more per return) — to serve a waiter, or to
 *    reach the 'good' needed for a public listing when the value gain covers the cost.
 * 4. An item that still cannot be listed, or would finance under €300, goes to parts.
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
  const valueAt = (condition: AssetCondition) =>
    marketValueCents(
      {
        originalListPriceCents,
        category: asset.category,
        condition,
        usageValue: usageAfterRefurb,
        ageMonths,
      },
      data.curves
    );

  const valueAsIsCents = valueAt(asset.condition);
  const financedAsIs = valueAsIsCents + required.totalCents;
  const base = {
    requiredItems: required.items,
    requiredTotalCents: required.totalCents,
    usageAfterRefurb,
    valueAsIsCents,
  };

  // Step 1: as-is to a waiter ('poor' is never leased as-is).
  if (rank(asset.condition) >= rank('fair')) {
    const match = matchWaitingList(
      {
        category: asset.category,
        condition: asset.condition,
        financedCents: financedAsIs,
        asOfDate,
      },
      data.demand,
      data.table
    );
    if (match.winner) {
      return {
        ...base,
        upgrade: null,
        valueFinalCents: valueAsIsCents,
        financedCents: financedAsIs,
        action: 'lease_to_waiter',
        winnerId: match.winner.id,
        considered: match.considered,
      };
    }
    // Step 2a: already listable as-is.
    if (rank(asset.condition) >= rank('good') && financedAsIs >= 30_000) {
      return {
        ...base,
        upgrade: null,
        valueFinalCents: valueAsIsCents,
        financedCents: financedAsIs,
        action: 'list_available',
        winnerId: null,
        considered: match.considered,
      };
    }
  }

  // Step 2b: one upgrade, if the data prices it.
  const to = nextConditionUp(asset.condition);
  const upgradeCost = to
    ? data.costs[asset.category].condition_upgrades[`${asset.condition}->${to}`]
    : undefined;
  if (to !== undefined && to !== null && upgradeCost !== undefined) {
    const valueUpgraded = valueAt(to);
    const financedUpgraded = valueUpgraded + required.totalCents + upgradeCost;
    const upgrade = { from: asset.condition, to, costCents: upgradeCost };
    const match = matchWaitingList(
      { category: asset.category, condition: to, financedCents: financedUpgraded, asOfDate },
      data.demand,
      data.table
    );
    if (match.winner) {
      return {
        ...base,
        upgrade,
        valueFinalCents: valueUpgraded,
        financedCents: financedUpgraded,
        action: 'lease_to_waiter',
        winnerId: match.winner.id,
        considered: match.considered,
      };
    }
    const gainCoversCost = valueUpgraded - valueAsIsCents > upgradeCost;
    if (rank(to) >= rank('good') && financedUpgraded >= 30_000 && gainCoversCost) {
      return {
        ...base,
        upgrade,
        valueFinalCents: valueUpgraded,
        financedCents: financedUpgraded,
        action: 'list_available',
        winnerId: null,
        considered: match.considered,
      };
    }
  }

  return {
    ...base,
    upgrade: null,
    valueFinalCents: valueAsIsCents,
    financedCents: financedAsIs,
    action: 'parts_bin',
    winnerId: null,
    considered: [],
  };
}
