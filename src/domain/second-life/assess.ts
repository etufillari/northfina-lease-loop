// The assessment of a returned item (smart problem 3, D86, which replaced D12's price): what
// each way of relisting it costs, what it is worth, whether the refurbishment pays for itself,
// and what it would rent for.
//
// The options: stay as returned (only the mandatory fixed steps of the refurbishment plan), or
// climb to each higher condition the cost table has upgrades for, up to like new. For each:
// - the refurbishment plan (`refurbishmentPlan`, the data's own `when` rules);
// - the market value after it (`marketValueCents`: the net list price at the first lease ×
//   the curve at the item's age × the condition multiplier after the plan × the usage
//   adjustment on the usage since the last battery after the plan (D83, the organisers' answer
//   of 6 Nov 2026, 10:35: `resets_usage` resets the usage adjustment, so a new battery puts it
//   at 0; the total usage never resets and stays for the passport; replaces D79);
// - the second-life financed amount, D86: the market value after the plan, nothing added. The
//   refurbishment is the lessor's cost, not part of what the item is worth: the value after the
//   plan already counts the improvement (D12 added the cost on top, so the customer paid twice);
// - refurbish or not, D86 (the organisers' framing, 6 Nov 2026, 10:35: compare the gain with
//   what it costs): the value gained over the as-returned option against the extra cost over
//   its plan. The mandatory steps are in every plan, the as-returned one too, so they cancel;
// - the monthly net rent for each allowed term (D43), priced by `priceQuote` itself on that
//   amount, so a quote made later on the relisted item gives exactly the same rent.
// Money: every amount is integer cents, rounded half up once inside the functions it comes
// from (the market value once, the rent once); the comparison subtracts whole cents.
import type {
  AssetCategory,
  AssetCondition,
  RefurbishmentCosts,
  ResidualCurves,
  UsageUnit,
} from '@/data/schemas';
import { allowedTerms, priceQuote, type PricingData, type QuoteRefusal } from '../pricing';
import { refurbishmentPlan, type RefurbishmentPlan } from '../refurbishment/plan';
import { curveAgeInMonths, type CurveAgeInput } from '../residual/age';
import { marketValueCents, type MarketValue } from '../residual/market-value';

/** Worst first. An item is never refurbished to `new`: the cost table stops at like new. */
export const CONDITION_ORDER: readonly AssetCondition[] = [
  'poor',
  'fair',
  'good',
  'like_new',
  'new',
];
const HIGHEST_TARGET: AssetCondition = 'like_new';

export const conditionRank = (condition: AssetCondition): number =>
  CONDITION_ORDER.indexOf(condition);

export type AssessInput = {
  assetId: string;
  category: AssetCategory;
  /** As returned. */
  condition: AssetCondition;
  /** The total usage as returned (D83: never reset). */
  usage: { unit: UsageUnit; value: number };
  /** The usage at the last per-block service (review finding 7); absent: none on record. */
  usageAtLastService?: number;
  /** D83: the total usage at the last battery replacement; absent: none on record. */
  usageAtLastReset?: number;
  /** For the curve age (D11 / D31). */
  age: CurveAgeInput;
  /** Net list price of one unit at its first lease (D60: `firstLeaseListPriceCents`). */
  newPriceCents: number;
  /** The assessment day, ISO. */
  isoDate: string;
};

export type AssessData = {
  curves: ResidualCurves;
  costs: RefurbishmentCosts;
  pricing: PricingData;
};

export type TermRent = {
  termMonths: number;
  /** Null when the amount cannot be leased on this term (`refusal` says why). */
  monthlyNetCents: number | null;
  band: string | null;
  refusal: QuoteRefusal['code'] | null;
};

export type ReturnOption = {
  /** The condition after the plan. */
  condition: AssetCondition;
  /** True when the plan has condition upgrades beyond the mandatory fixed steps. */
  upgrade: boolean;
  plan: RefurbishmentPlan;
  marketValue: MarketValue;
  /** D86: the market value after the plan, nothing added (D12 added the refurbishment cost). */
  secondLifeFinancedCents: number;
  /** D86: refurbish or not, against the as-returned option; null on the as-returned option. */
  comparison: RefurbishComparison | null;
  rents: TermRent[];
};

/** D86: what refurbishing beyond the as-returned plan gains against what it costs. */
export type RefurbishComparison = {
  /** The market value over the as-returned option's. */
  valueGainCents: number;
  /** The plan's cost over the as-returned plan's (the mandatory steps are in both). */
  extraCostCents: number;
  /** Gain − extra cost: what the no-winner decision ranks (D86). */
  netGainCents: number;
  /**
   * Gain > extra cost: the refurbishment pays for itself. A tie is not worth the work, as the
   * no-winner decision keeps the lower condition on a tie (D86).
   */
  worthIt: boolean;
};

type ValueAndCost = { valueCents: number; costCents: number };

/** D86: the organisers' refurbish-or-not comparison of `option` against `asReturned`. */
export function compareToAsReturned(
  asReturned: ValueAndCost,
  option: ValueAndCost
): RefurbishComparison {
  const valueGainCents = option.valueCents - asReturned.valueCents;
  const extraCostCents = option.costCents - asReturned.costCents;
  return {
    valueGainCents,
    extraCostCents,
    netGainCents: valueGainCents - extraCostCents,
    worthIt: valueGainCents > extraCostCents,
  };
}

export type ReturnAssessmentResult = {
  assetId: string;
  isoDate: string;
  category: AssetCategory;
  ageMonths: number;
  returnedCondition: AssetCondition;
  /** As returned first, then each higher condition. */
  options: ReturnOption[];
};

/** D60's earliest-price-list read lives with the rest of the rule (first-lease.ts). */
export { firstLeaseListPriceCents } from './first-lease';

/**
 * The pricing data with `assetId` priced at `cents` in every price list: how a relisted item is
 * quoted on its second-life amount (D86) while the quote keeps the live list's version.
 */
export function withSecondLifePrice(
  pricing: PricingData,
  assetId: string,
  cents: number
): PricingData {
  return {
    ...pricing,
    priceLists: pricing.priceLists.map((list) =>
      list.prices[assetId] === undefined
        ? list
        : { ...list, prices: { ...list.prices, [assetId]: cents } }
    ),
  };
}

function rentsFor(input: AssessInput, data: AssessData, financedCents: number): TermRent[] {
  const priced = withSecondLifePrice(data.pricing, input.assetId, financedCents);
  return allowedTerms(input.category, data.pricing.table, data.pricing.termLimits).map(
    (termMonths) => {
      const quote = priceQuote(priced, {
        assetId: input.assetId,
        termMonths,
        downPaymentCents: 0,
        isoDate: input.isoDate,
      });
      return quote.ok
        ? {
            termMonths,
            monthlyNetCents: quote.quote.monthlyNetCents,
            band: quote.quote.band,
            refusal: null,
          }
        : { termMonths, monthlyNetCents: null, band: null, refusal: quote.reason.code };
    }
  );
}

/** Every way to relist the returned item, as returned first. */
export function assessReturn(input: AssessInput, data: AssessData): ReturnAssessmentResult {
  const ageMonths = curveAgeInMonths(input.age, input.isoDate);
  const from = conditionRank(input.condition);
  const top = Math.max(from, conditionRank(HIGHEST_TARGET));
  const options: ReturnOption[] = [];

  for (let rank = from; rank <= top; rank += 1) {
    const target = CONDITION_ORDER[rank]!;
    const plan = refurbishmentPlan(
      {
        category: input.category,
        condition: input.condition,
        usage: input.usage,
        usageAtLastService: input.usageAtLastService,
        usageAtLastReset: input.usageAtLastReset,
        targetCondition: target,
      },
      data.costs
    );
    const marketValue = marketValueCents(
      {
        listPriceCents: input.newPriceCents,
        category: input.category,
        ageMonths,
        condition: plan.conditionAfter,
        // D83: the usage since the last battery after the plan, 0 when the plan replaces it.
        usage: plan.usageSinceResetAfter,
      },
      data.curves
    );
    // D86: the price is the market value; the plan's cost is the lessor's.
    const secondLifeFinancedCents = marketValue.valueCents;
    const asReturned = options[0];
    options.push({
      condition: plan.conditionAfter,
      upgrade: plan.upgradeCents > 0,
      plan,
      marketValue,
      secondLifeFinancedCents,
      comparison: asReturned
        ? compareToAsReturned(
            {
              valueCents: asReturned.marketValue.valueCents,
              costCents: asReturned.plan.totalCents,
            },
            { valueCents: marketValue.valueCents, costCents: plan.totalCents }
          )
        : null,
      rents: rentsFor(input, data, secondLifeFinancedCents),
    });
  }

  return {
    assetId: input.assetId,
    category: input.category,
    isoDate: input.isoDate,
    ageMonths,
    returnedCondition: input.condition,
    options,
  };
}
