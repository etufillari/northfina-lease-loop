// What leaving a contract costs (decision D14), for both exits, line by line.
//
// Before the end date:
// - buy    = the outstanding balance after the paid rents (`outstandingBalanceAfter`, the
//            financed amount amortised at the band's annual rate; never re-implemented here);
// - return = max(0, balance − market value by the curve) + the refurbishment to the leasable
//            condition. The refurbishment target is `good`: refurbishment-costs.json's note
//            says a returned item must reach at least good to be leased again.
// On or after the end date (the last day of the term):
// - buy    = the buyout frozen in the contract;
// - return = only the refurbishment.
// D90: a pass-on costs the return without the refurbishment: the item goes straight from hand to
// hand, so before the end it is max(0, balance − market value) and at the end nothing.
//
// `monthsPaid` is the number of paid rent invoices, capped at the term. Every line is a code
// with params (amounts in cents), so the page writes it in the visitor's language.
import type {
  AssetCategory,
  AssetCondition,
  RefurbishmentCosts,
  ResidualCurves,
} from '@/data/schemas';
import { outstandingBalanceAfter, type AmortisationRow } from '../invoicing/balance';
import { refurbishmentPlan, usageSinceReset, type RefurbishmentPlan } from '../refurbishment/plan';
import { curveAgeInMonths } from '../residual/age';
import type { FirstLeaseCurve } from '../second-life/first-lease';
import { marketValueCents, type MarketValue, type Usage } from '../residual/market-value';
import type { InvoiceKind, InvoiceStatus } from '../statuses';

/** refurbishment-costs.json's note: "must reach at least 'good' to be leased again". */
export const LEASABLE_CONDITION: AssetCondition = 'good';

export type ExitLineEffect = 'add' | 'subtract' | 'subtotal' | 'info' | 'total';

export type ExitLine = {
  code:
    | 'months_paid'
    | 'balance'
    | 'remaining_rents'
    | 'buyout_at_end'
    | 'buyout'
    | 'market_value'
    | 'balance_after_value'
    | 'value_exceeds_balance'
    | 'refurb_fixed'
    | 'refurb_upgrade'
    | 'refurb_waived'
    | 'total';
  effect: ExitLineEffect;
  params: Record<string, string | number>;
};

export type ExitOption = { totalCents: number; lines: ExitLine[] };

export type ExitContractTerms = {
  financedCents: number;
  monthlyNetCents: number;
  termMonths: number;
  buyoutCents: number;
  /** The first day of this lease. */
  startDate: string;
  /** Inclusive: the last day of the term. */
  endDate: string;
  /** Net list price of one unit at signing. Not the curve's price: a relisted item's is its
   *  second-life amount, already depreciated (review finding 1); `curve` carries D60's. */
  unitListPriceCents: number;
  quantity: number;
};

export type EarlyExitInput = {
  contract: ExitContractTerms;
  /** The band's `annual_interest_percent`. */
  annualInterestPercent: number;
  invoices: readonly { kind: InvoiceKind; status: InvoiceStatus }[];
  today: string;
  asset: { category: AssetCategory };
  /** The residual curve's list price and age inputs (D60, `firstLeaseCurve`): the same read the
   *  assessment of the returned item uses, so the two value it alike. */
  curve: FirstLeaseCurve;
  /** What the customer reports; the assessment (wave 3) checks it. */
  reported: { condition: AssetCondition; usage: Usage };
  /** The usage at the last per-block service (review finding 7); absent: none on record. */
  usageAtLastService?: number;
  /** D83: the total usage at the last battery replacement; absent: none on record. */
  usageAtLastReset?: number;
  curves: ResidualCurves;
  costs: RefurbishmentCosts;
};

export type EarlyExitCost = {
  atOrAfterEnd: boolean;
  monthsPaid: number;
  /** The D14 balance after the paid rents (before the end), or the frozen buyout (at the end). */
  balanceCents: number;
  balanceRows: AmortisationRow[];
  /** The rents not yet paid, net: what staying would have cost, for comparison only. */
  remainingRentsNetCents: number;
  /** Per unit. */
  marketValue: MarketValue;
  /** Per unit. */
  refurbishment: RefurbishmentPlan;
  buy: ExitOption;
  return: ExitOption;
  /** D90: the return's lines without the refurbishment. */
  passOn: ExitOption;
};

function refurbishmentLines(plan: RefurbishmentPlan, quantity: number): ExitLine[] {
  return plan.steps.map((step): ExitLine =>
    step.kind === 'fixed'
      ? {
          code: 'refurb_fixed',
          effect: 'add',
          params: { step: step.id, times: step.quantity, amountCents: step.costCents * quantity },
        }
      : {
          code: 'refurb_upgrade',
          effect: 'add',
          params: { from: step.from, to: step.to, amountCents: step.costCents * quantity },
        }
  );
}

/** D90: a pass-on shows the refurbishment at 0, so the difference from a return is visible. */
const refurbWaived: ExitLine = { code: 'refurb_waived', effect: 'add', params: { amountCents: 0 } };

const total = (amountCents: number): ExitLine => ({
  code: 'total',
  effect: 'total',
  params: { amountCents },
});

/** The cost of buying and of returning on `today`, line by line (D14). */
export function earlyExitCost(input: EarlyExitInput): EarlyExitCost {
  const { contract, today, asset, reported } = input;
  const paidRents = input.invoices.filter((i) => i.kind === 'rent' && i.status === 'paid').length;
  const monthsPaid = Math.min(paidRents, contract.termMonths);
  const atOrAfterEnd = today >= contract.endDate;
  const quantity = contract.quantity;

  const marketValue = marketValueCents(
    {
      listPriceCents: input.curve.listPriceCents,
      category: asset.category,
      ageMonths: curveAgeInMonths(input.curve.age, today),
      condition: reported.condition,
      // D83: the usage since the last battery replacement (the total when none is on record).
      usage: {
        unit: reported.usage.unit,
        value: usageSinceReset(reported.usage.value, input.usageAtLastReset),
      },
    },
    input.curves
  );
  const refurbishment = refurbishmentPlan(
    {
      category: asset.category,
      condition: reported.condition,
      usage: reported.usage,
      usageAtLastService: input.usageAtLastService,
      usageAtLastReset: input.usageAtLastReset,
      targetCondition: LEASABLE_CONDITION,
    },
    input.costs
  );
  const refurbCents = refurbishment.totalCents * quantity;
  const refurbLines = refurbishmentLines(refurbishment, quantity);
  const remainingMonths = contract.termMonths - monthsPaid;
  const remainingRentsNetCents = contract.monthlyNetCents * remainingMonths;

  if (atOrAfterEnd) {
    return {
      atOrAfterEnd,
      monthsPaid,
      balanceCents: contract.buyoutCents,
      balanceRows: [],
      remainingRentsNetCents,
      marketValue,
      refurbishment,
      buy: {
        totalCents: contract.buyoutCents,
        lines: [
          { code: 'buyout', effect: 'add', params: { amountCents: contract.buyoutCents } },
          total(contract.buyoutCents),
        ],
      },
      return: { totalCents: refurbCents, lines: [...refurbLines, total(refurbCents)] },
      passOn: { totalCents: 0, lines: [refurbWaived, total(0)] },
    };
  }

  const balance = outstandingBalanceAfter(
    {
      financedCents: contract.financedCents,
      annualInterestPercent: input.annualInterestPercent,
      monthlyNetCents: contract.monthlyNetCents,
      termMonths: contract.termMonths,
      buyoutCents: contract.buyoutCents,
    },
    monthsPaid
  );
  const balanceCents = Math.max(0, balance.balanceCents);
  const valueCents = marketValue.valueCents * quantity;
  const afterValue = Math.max(0, balanceCents - valueCents);
  const paidLine: ExitLine = {
    code: 'months_paid',
    effect: 'info',
    params: { months: monthsPaid, termMonths: contract.termMonths },
  };
  const balanceLine: ExitLine = {
    code: 'balance',
    effect: 'add',
    params: { months: monthsPaid, amountCents: balanceCents },
  };

  const returnLines: ExitLine[] = [
    paidLine,
    balanceLine,
    {
      code: 'market_value',
      effect: 'subtract',
      params: {
        amountCents: valueCents,
        ageMonths: marketValue.ageMonths,
        curvePercent: marketValue.curvePercent,
        condition: reported.condition,
        conditionMultiplier: marketValue.conditionMultiplier,
        usageValue: reported.usage.value,
        usageUnit: reported.usage.unit,
        usageAdjustmentPercent: marketValue.usageAdjustmentPercent,
      },
    },
    { code: 'balance_after_value', effect: 'subtotal', params: { amountCents: afterValue } },
  ];
  if (valueCents > balanceCents) {
    returnLines.push({
      code: 'value_exceeds_balance',
      effect: 'info',
      params: { amountCents: valueCents - balanceCents },
    });
  }
  const passOnLines: ExitLine[] = [...returnLines, refurbWaived, total(afterValue)];
  returnLines.push(...refurbLines, total(afterValue + refurbCents));

  return {
    atOrAfterEnd,
    monthsPaid,
    balanceCents,
    balanceRows: balance.rows,
    remainingRentsNetCents,
    marketValue,
    refurbishment,
    buy: {
      totalCents: balanceCents,
      lines: [
        paidLine,
        balanceLine,
        {
          code: 'remaining_rents',
          effect: 'info',
          params: { months: remainingMonths, amountCents: remainingRentsNetCents },
        },
        { code: 'buyout_at_end', effect: 'info', params: { amountCents: contract.buyoutCents } },
        total(balanceCents),
      ],
    },
    return: { totalCents: afterValue + refurbCents, lines: returnLines },
    passOn: { totalCents: afterValue, lines: passOnLines },
  };
}
