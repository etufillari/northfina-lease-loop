// Second life (Spine step 7, D-035): what a returned item is worth after its refurbishment, and
// the list price it gets for its next lease. That price then goes through the normal coefficient
// table, so the quote, sliders, application and signing work unchanged.
// Pure: the data, the item and the valuation date all come in as arguments.

import type {
  AssetCategory,
  AssetCondition,
  CoefficientTable,
  PriceList,
  RefurbishmentCosts,
  ResidualCurves,
  UsageUnit,
} from '@/data/schemas';
import { itemAgeOn } from './item-age';
import { curvePercent as curvePercentAt, usageAdjustmentPercent } from './market-value';
import { roundHalfUp } from './money';
import { quoteLease } from './pricing';
import { conditionRank, refurbishPlan, type RefurbishPlan } from './refurbishment';
import type { RentFor } from './waiting-list';

export interface SecondLifeData {
  curves: ResidualCurves;
  costs: RefurbishmentCosts;
  table: CoefficientTable;
}

export interface SecondLifeItem {
  category: AssetCategory;
  modelYear: number;
  /** When it was first leased new, which starts its age clock (D-042); null for a used item. */
  firstLeasedNewOn: string | null;
  /** As returned (the inspection at the end of the last lease). */
  condition: AssetCondition;
  usage: { unit: UsageUnit; value: number };
  /** Net list price at its first lease (see `firstLeasePrice`). */
  firstLeasePriceCents: number;
}

/** One side of the valuation: the item in some condition with some usage. */
export interface ValueLine {
  condition: AssetCondition;
  usageValue: number;
  conditionMultiplier: number;
  /** Zero or negative. */
  usagePercent: number;
  valueCents: number;
}

export type SecondLifeValuation =
  | {
      ok: true;
      valuedOn: string;
      firstLeasePriceCents: number;
      ageMonths: number;
      curvePercent: number;
      asReturned: ValueLine;
      plan: Extract<RefurbishPlan, { ok: true }>;
      after: ValueLine;
      refurbishmentCents: number;
      /** The next life's net list price: the value after refurbishment (D-035). */
      listPriceCents: number;
    }
  | { ok: false; reason: 'condition_unreachable' };

/** One condition a returned item can be re-listed at, with its valuation and rents. */
export interface SecondLifeOption {
  target: AssetCondition;
  valuation: Extract<SecondLifeValuation, { ok: true }>;
  /** Rent with no down payment per term in the coefficient table; null when it can't be priced. */
  rents: { termMonths: number; monthlyNetRentCents: number | null }[];
}

/**
 * The item's net list price at its first lease. The price lists start in 2026, after these items
 * were first leased, so the earliest list that prices the asset stands in for it (v1). Using the
 * earliest list keeps the value from jumping when a later list changes new-item prices.
 */
export function firstLeasePrice(
  priceLists: readonly PriceList[],
  assetId: string
): { priceCents: number; priceListVersion: number } | null {
  const earliest = [...priceLists]
    .filter((list) => list.prices[assetId] !== undefined)
    .sort((a, b) => (a.valid_from < b.valid_from ? -1 : a.valid_from > b.valid_from ? 1 : 0))[0];
  if (!earliest) return null;
  return { priceCents: earliest.prices[assetId]!, priceListVersion: earliest.version };
}

function valueLine(
  data: SecondLifeData,
  item: SecondLifeItem,
  percent: number,
  condition: AssetCondition,
  usageValue: number
): ValueLine {
  const conditionMultiplier = data.curves.condition_multiplier[condition];
  const usagePercent = usageAdjustmentPercent(data.curves, item.category, usageValue);
  // Rounded once (D-005), the same formula as marketValue.
  const valueCents = roundHalfUp(
    (item.firstLeasePriceCents * percent * conditionMultiplier * (1 + usagePercent / 100)) / 100
  );
  return { condition, usageValue, conditionMultiplier, usagePercent, valueCents };
}

/**
 * Values a returned item on `valuedOn`, as it is and after the refurbishment that brings it to
 * `target`. The bank's refurbishment cost is sunk: the next lessee pays for what the item is
 * worth, so the new list price is the value after the work, not value + cost (D-035).
 */
export function valueSecondLife(
  data: SecondLifeData,
  item: SecondLifeItem,
  target: AssetCondition,
  valuedOn: string
): SecondLifeValuation {
  const plan = refurbishPlan(data.costs, item, target);
  if (!plan.ok) return plan;

  const ageMonths = itemAgeOn(item, valuedOn);
  const percent = curvePercentAt(data.curves.curves[item.category], ageMonths);
  const asReturned = valueLine(data, item, percent, item.condition, item.usage.value);
  const after = valueLine(data, item, percent, plan.conditionAfter, plan.usageAfter.value);
  return {
    ok: true,
    valuedOn,
    firstLeasePriceCents: item.firstLeasePriceCents,
    ageMonths,
    curvePercent: percent,
    asReturned,
    plan,
    after,
    refurbishmentCents: plan.totalCents,
    listPriceCents: after.valueCents,
  };
}

/**
 * The waiting list's `rentFor` (D-032): the rent with no down payment for the item refurbished to
 * `condition`, priced from its second-life list price with the normal coefficient table. Null
 * when the condition can't be reached or the table can't price it (too cheap, unknown term).
 */
export function secondLifeRentFor(
  data: SecondLifeData,
  item: SecondLifeItem,
  valuedOn: string
): RentFor {
  return (condition, termMonths) => {
    const valued = valueSecondLife(data, item, condition, valuedOn);
    if (!valued.ok) return null;
    const quote = quoteLease(data.table, {
      listPriceCents: valued.listPriceCents,
      termMonths,
      downPaymentCents: 0,
    });
    return quote.ok ? quote.monthlyNetRentCents : null;
  };
}

const LISTABLE: readonly AssetCondition[] = ['fair', 'good', 'like_new'];

/**
 * The conditions a returned item can be re-listed at. The data: it must reach `good`, unless a
 * waiting-list entry accepts `fair`. Never a downgrade, so a target below the item's condition
 * becomes its own condition. Worst first.
 */
export function relistTargets(condition: AssetCondition, fairAccepted: boolean): AssetCondition[] {
  const targets = LISTABLE.filter((target) => target !== 'fair' || fairAccepted).map((target) =>
    conditionRank(condition) > conditionRank(target) ? condition : target
  );
  return [...new Set(targets)];
}

/**
 * Price lists with re-listed items' second-life prices in place of their new-item prices, so
 * `listPriceOn` and `makeQuote` price them like any other asset. The lists given are not changed.
 */
export function withListedPrices(
  priceLists: PriceList[],
  listed: Readonly<Record<string, number>>
): PriceList[] {
  if (Object.keys(listed).length === 0) return priceLists;
  return priceLists.map((list) => ({ ...list, prices: { ...list.prices, ...listed } }));
}
