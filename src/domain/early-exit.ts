// Fair early exit (Smart Problem 2, card 8, D-033). Leaving in month k settles what is still owed,
// valued today at the band's own interest rate: the bank is exactly as well off as if the lease
// ran to the end, and the customer pays nothing for time they no longer use. At the final month
// it is exactly the end-of-term buyout (D-029). The contract stays frozen.
import type {
  AssetCategory,
  AssetCondition,
  CoefficientTable,
  ResidualCurves,
  VatRates,
} from '@/data/schemas';
import { addMonthsClamped } from './calendar';
import type { BilledContract } from './invoicing';
import {
  inspectionProblem,
  type DeliveredState,
  type EndedContract,
  type Ending,
  type Inspection,
} from './end-of-term';
import { marketValue } from './market-value';
import { roundHalfUp } from './money';
import { vatRateOn, withVat, type VatBreakdown } from './vat';

export interface ExitContract extends EndedContract {
  /** Net list price locked at signing: the market value starts from it. */
  listPriceCents: number;
}

/** The item as delivered; the preview assumes it comes back in the same state. */
export interface ExitItem {
  category: AssetCategory;
  ageAtStartMonths: number;
  condition: AssetCondition;
  usageValue: number;
}

export interface ExitContext {
  vatRates: VatRates;
  curves: ResidualCurves;
  /** The band's `annual_interest_percent`: the rate the rent factor was built on. */
  annualInterestPercent: number;
  item: ExitItem;
}

export interface ExitPrice extends VatBreakdown {
  /** How much less than the undiscounted amounts this is (buy only). */
  discountCents: number;
}

export interface EarlyExitQuote {
  /** The invoice month the customer leaves in; invoices 1…exitMonth are paid. */
  exitMonth: number;
  /** When that month ends: ownership passes or the item comes back. */
  effectiveDate: string;
  monthsLeft: number;
  annualInterestPercent: number;
  vatRatePercent: number;
  /** Rents the customer no longer pays, at face value. */
  remainingRentsCents: number;
  /** The same rents valued on the effective date. */
  remainingRentsPvCents: number;
  buyoutCents: number;
  buyoutPvCents: number;
  /** What the item is worth on the effective date. */
  valueNowCents: number;
  /** What it would be worth when the lease ends. */
  valueAtEndCents: number;
  /** What the bank would get at the end: the buyout, or the item if worth less (the cheaper). */
  endAmountCents: number;
  endAmountPvCents: number;
  /** Buy early: keep the item. */
  buy: ExitPrice;
  /** Hand back early: the item's value now is credited. Never below zero. */
  handBack: ExitPrice;
}

export type ExitMonthResult =
  { ok: true; month: number } | { ok: false; reason: 'not_started' | 'term_over' };

export type EarlyExitResult =
  | { ok: true; quote: EarlyExitQuote }
  | { ok: false; reason: 'not_started' | 'term_over' | 'no_vat_rate' };

/** The band's annual interest, or null for a band the table doesn't have. */
export function bandInterestPercent(table: CoefficientTable, band: string): number | null {
  return table.bands.find((b) => b.band === band)?.annual_interest_percent ?? null;
}

/** The invoice month `date` falls in, counted from the start like the schedule (D-016). */
export function exitMonthOn(contract: BilledContract, date: string): ExitMonthResult {
  // ISO dates compare as strings (D-015).
  if (date < contract.startDate) return { ok: false, reason: 'not_started' };
  if (date >= addMonthsClamped(contract.startDate, contract.termMonths)) {
    return { ok: false, reason: 'term_over' };
  }
  let month = 1;
  while (date >= addMonthsClamped(contract.startDate, month)) month++;
  return { ok: true, month };
}

/**
 * What leaving at the end of `exitMonth` (k) costs. Rents are billed in advance (D-016), so rent
 * k + 1 falls due on the effective date itself and rent k + n is discounted n − 1 months (D-039).
 * The buyout and the end amount are paid at handover, T − k months away (D-033).
 */
export function earlyExitQuote(
  contract: ExitContract,
  context: ExitContext,
  exitMonth: number
): EarlyExitResult {
  const term = contract.termMonths;
  if (!Number.isInteger(exitMonth) || exitMonth < 1 || exitMonth > term) {
    throw new RangeError(`exitMonth must be 1…${term}, got ${exitMonth}`);
  }
  const effectiveDate = addMonthsClamped(contract.startDate, exitMonth);
  const vat = vatRateOn(context.vatRates, effectiveDate);
  if (!vat.ok) return { ok: false, reason: 'no_vat_rate' };

  const monthlyRate = context.annualInterestPercent / 100 / 12;
  const discount = (months: number) => (1 + monthlyRate) ** -months;
  const monthsLeft = term - exitMonth;

  let rentsPv = 0;
  for (let n = 1; n <= monthsLeft; n++) rentsPv += contract.monthlyNetRentCents * discount(n - 1);
  const remainingRentsPvCents = roundHalfUp(rentsPv);
  const buyoutPvCents = roundHalfUp(contract.buyoutCents * discount(monthsLeft));

  const value = (ageMonths: number) =>
    marketValue(context.curves, {
      ...context.item,
      listPriceCents: contract.listPriceCents,
      ageMonths,
    });
  const valueNowCents = value(context.item.ageAtStartMonths + exitMonth);
  const valueAtEndCents = value(context.item.ageAtStartMonths + term);
  const endAmountCents = Math.min(contract.buyoutCents, valueAtEndCents);
  const endAmountPvCents = roundHalfUp(endAmountCents * discount(monthsLeft));

  const remainingRentsCents = contract.monthlyNetRentCents * monthsLeft;
  const buyNet = remainingRentsPvCents + buyoutPvCents;
  const handBackNet = Math.max(0, remainingRentsPvCents + endAmountPvCents - valueNowCents);

  return {
    ok: true,
    quote: {
      exitMonth,
      effectiveDate,
      monthsLeft,
      annualInterestPercent: context.annualInterestPercent,
      vatRatePercent: vat.ratePercent,
      remainingRentsCents,
      remainingRentsPvCents,
      buyoutCents: contract.buyoutCents,
      buyoutPvCents,
      valueNowCents,
      valueAtEndCents,
      endAmountCents,
      endAmountPvCents,
      buy: {
        ...withVat(buyNet, vat.ratePercent),
        discountCents: remainingRentsCents + contract.buyoutCents - buyNet,
      },
      handBack: { ...withVat(handBackNet, vat.ratePercent), discountCents: 0 },
    },
  };
}

export type EarlyExitChoice = { kind: 'early_buy' } | ({ kind: 'early_hand_back' } & Inspection);

export type EndEarlyResult =
  | { ok: true; ending: Ending }
  | {
      ok: false;
      reason:
        'not_started' | 'term_over' | 'no_vat_rate' | 'usage_went_down' | 'condition_improved';
    };

/**
 * Decides an early exit made on `today`. A handed-back item is valued in the state it was
 * inspected in, which can't be better than at delivery (the same check as D-029).
 */
export function endEarly(
  contract: ExitContract,
  context: ExitContext,
  delivered: DeliveredState,
  choice: EarlyExitChoice,
  today: string
): EndEarlyResult {
  let item = context.item;
  let inspection: Inspection | undefined;
  if (choice.kind === 'early_hand_back') {
    inspection = { condition: choice.condition, usageValue: choice.usageValue };
    const problem = inspectionProblem(delivered, inspection);
    if (problem) return { ok: false, reason: problem };
    item = { ...item, ...inspection };
  }
  const priced = earlyExitOn(contract, { ...context, item }, today);
  if (!priced.ok) return priced;
  const { quote } = priced;
  return {
    ok: true,
    ending: {
      kind: choice.kind,
      decidedOn: today,
      effectiveDate: quote.effectiveDate,
      earlyExit: quote,
      ...(inspection ? { inspection } : {}),
    },
  };
}

/** The early exit for a decision made on `decidedOn`: it takes effect when that month ends. */
export function earlyExitOn(
  contract: ExitContract,
  context: ExitContext,
  decidedOn: string
): EarlyExitResult {
  const month = exitMonthOn(contract, decidedOn);
  if (!month.ok) return month;
  return earlyExitQuote(contract, context, month.month);
}
