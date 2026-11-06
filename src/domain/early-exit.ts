// Pure domain logic for a fair early exit (Smart Problem 2, scenario card 8).
//
// There is no official formula in the data, so this is the design from ARCHITECTURE.md §7:
// the lessor recovers what it is still owed financially, the customer pays no interest for
// months they do not use, and an exit in the last month equals the end-of-term buyout.
//
// Outstanding balance at the exit date, with `m` rent rows still to be billed and the band's
// monthly rate r = annualInterestPercent / 12 / 100:
//
//   balance = Σ_{i=1..m} rent / (1 + r)^i  +  buyout / (1 + r)^m
//
// The customer chooses one of two exits:
// - Early buyout, keep the item: pay `balance`.
// - Early return: pay max(0, min(balance - marketValue, remaining rents)). The returned item
//   is credited at its market value (`calculateResidualMarketValue`), and the cost never
//   exceeds the rents that are still to come.
//
// Rounding rule (RULES.md): all money is integer euro cents. The present value is the only
// non-integer step, and it is computed without floating point: the annual rate becomes whole
// basis points (7.9 % -> 790 bp), so 1 + r is the exact fraction (120 000 + bp) / 120 000 and
// the balance is one exact BigInt fraction, rounded half up ONCE to whole cents. Every other
// line is an integer, and the "interest not charged" line is derived (balance minus the
// nominal amounts), so the lines always add up to the total.
import type {
  AssetCategory,
  AssetCondition,
  ResidualCurves,
  UsageUnit,
  VatRates,
} from '@/data/schemas';
import {
  type BuyoutSettlement,
  calculateBuyoutSettlement,
  calculateResidualMarketValue,
  interpolateResidualCurve,
} from './end-of-term';
import type { ContractQuote } from './contract-pricing';
import { addMonthsClamped } from './invoice-schedule';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Counts the rent rows billed on or before `asOf`: row 1 falls on `signedOn`, row n on
 * `addMonthsClamped(signedOn, n - 1)`. The result is between 0 and `termMonths`.
 * 0 means the exit date is before the lease starts.
 */
export function billedMonthsAsOf(signedOn: string, termMonths: number, asOf: string): number {
  if (!ISO_DATE.test(signedOn)) {
    throw new RangeError(`signedOn must look like YYYY-MM-DD, got "${signedOn}"`);
  }
  if (!ISO_DATE.test(asOf)) {
    throw new RangeError(`asOf must look like YYYY-MM-DD, got "${asOf}"`);
  }
  if (!Number.isInteger(termMonths) || termMonths <= 0) {
    throw new RangeError(`termMonths must be a positive integer, got ${termMonths}`);
  }

  let billed = 0;
  while (billed < termMonths && addMonthsClamped(signedOn, billed) <= asOf) billed += 1;
  return billed;
}

/**
 * The money still owed on the lease with `remainingMonths` rent rows to go: the remaining rents
 * and the end-of-term buyout, each discounted at the band's rate. With no months left this is
 * exactly the buyout. Rounded once.
 */
export function outstandingBalanceCents(input: {
  monthlyNetRentCents: number;
  buyoutNetCents: number;
  annualInterestPercent: number;
  remainingMonths: number;
}): number {
  const { monthlyNetRentCents, buyoutNetCents, annualInterestPercent, remainingMonths } = input;
  if (!Number.isInteger(monthlyNetRentCents) || monthlyNetRentCents < 0) {
    throw new RangeError(
      `monthlyNetRentCents must be a non-negative integer, got ${monthlyNetRentCents}`
    );
  }
  if (!Number.isInteger(buyoutNetCents) || buyoutNetCents < 0) {
    throw new RangeError(`buyoutNetCents must be a non-negative integer, got ${buyoutNetCents}`);
  }
  if (!Number.isFinite(annualInterestPercent) || annualInterestPercent < 0) {
    throw new RangeError(
      `annualInterestPercent must be a non-negative number, got ${annualInterestPercent}`
    );
  }
  if (!Number.isInteger(remainingMonths) || remainingMonths < 0) {
    throw new RangeError(`remainingMonths must be a non-negative integer, got ${remainingMonths}`);
  }

  // 1 + r = (12 × 10 000 + bp) / (12 × 10 000). Over the common denominator N^m:
  //   balance = (Σ_{i=1..m} rent × D^i × N^(m−i)  +  buyout × D^m) / N^m
  const bp = BigInt(percentToBasisPoints(annualInterestPercent));
  const den = 120_000n;
  const num = den + bp;
  const m = remainingMonths;
  const rent = BigInt(monthlyNetRentCents);

  let numerator = BigInt(buyoutNetCents) * den ** BigInt(m);
  for (let i = 1; i <= m; i += 1) {
    numerator += rent * den ** BigInt(i) * num ** BigInt(m - i);
  }
  return roundHalfUp(numerator, num ** BigInt(m));
}

/**
 * A percentage from the data pack as whole basis points (7.9 -> 790). Throws if the rate has
 * more than two decimals, because it then cannot be stored exactly.
 */
function percentToBasisPoints(percent: number): number {
  const scaled = percent * 100;
  const bp = Math.round(scaled);
  if (Math.abs(scaled - bp) > 1e-9) {
    throw new RangeError(`annualInterestPercent ${percent} has more than two decimals`);
  }
  return bp;
}

/** `numerator / denominator` rounded half up, for non-negative numerators. */
function roundHalfUp(numerator: bigint, denominator: bigint): number {
  const quotient = numerator / denominator;
  const rounded = (numerator % denominator) * 2n >= denominator ? quotient + 1n : quotient;
  return Number(rounded);
}

/** One line of the step-by-step calculation. `key` is translated in the UI with `params`. */
export type EarlyExitLine = {
  key: 'remainingRents' | 'buyout' | 'interestNotCharged' | 'returnCredit' | 'returnAdjustment';
  amountCents: number;
  params: Record<string, number>;
};

export type EarlyExitOption = {
  /** Net amount before VAT: always the sum of `lines`. */
  netCents: number;
  /** VAT at the rate on the exit date, same rule as the end-of-term buyout. */
  settlement: BuyoutSettlement;
  lines: EarlyExitLine[];
};

export type EarlyExitQuote = {
  signedOn: string;
  asOf: string;
  termMonths: number;
  /** Rent rows billed up to and including the exit date. */
  billedMonths: number;
  /** Rent rows still to come. 0 once the term is over. */
  remainingMonths: number;
  monthlyNetRentCents: number;
  nominalRemainingRentsCents: number;
  annualInterestPercent: number;
  /** Remaining rents plus the buyout, discounted at the band rate. */
  balanceCents: number;
  marketValue: {
    /** Months of use: the rent periods started by the exit date. */
    ageMonths: number;
    /** Share of the first list price left at that age, from the residual curve. */
    curvePercent: number;
    valueCents: number;
  };
  /** Pay the balance and keep the item (the asset becomes sold). */
  buyout: EarlyExitOption;
  /** Give the item back and pay the shortfall (the asset becomes returned). */
  returnItem: EarlyExitOption;
};

export type EarlyExitInput = {
  signedOn: string;
  /** The exit date. Must not be before `signedOn`. */
  asOf: string;
  termMonths: number;
  monthlyNetRentCents: number;
  buyoutNetCents: number;
  annualInterestPercent: number;
  /** Net list price when the item was first leased. The residual curve is a share of it. */
  firstListPriceCents: number;
  category: AssetCategory;
  /** Condition the item is returned in. Confirmed after inspection. */
  condition: AssetCondition;
  usage: { unit: UsageUnit; value: number };
  residualCurves: ResidualCurves;
  vatRates: VatRates;
};

/**
 * Prices an early exit as of `asOf`, with both options and a breakdown that adds up exactly.
 * After the last rent row has been billed nothing is left to discount: the buyout option costs
 * exactly the end-of-term buyout and the return option costs nothing.
 */
export function calculateEarlyExit(input: EarlyExitInput): EarlyExitQuote {
  const { signedOn, asOf, termMonths, monthlyNetRentCents, buyoutNetCents } = input;

  const billedMonths = billedMonthsAsOf(signedOn, termMonths, asOf);
  if (billedMonths === 0) {
    throw new RangeError(`asOf ${asOf} is before the lease starts on ${signedOn}`);
  }
  const remainingMonths = termMonths - billedMonths;

  const balanceCents = outstandingBalanceCents({
    monthlyNetRentCents,
    buyoutNetCents,
    annualInterestPercent: input.annualInterestPercent,
    remainingMonths,
  });
  const nominalRemainingRentsCents = monthlyNetRentCents * remainingMonths;

  const curvePoints = input.residualCurves.curves[input.category];
  if (!curvePoints) {
    throw new Error(`No residual curve found for category "${input.category}"`);
  }
  // Age is the rent periods started, so at the end of the term it equals the term (the same
  // age the end-of-term relist price uses).
  const ageMonths = billedMonths;
  const marketValueCents = calculateResidualMarketValue({
    firstListPriceCents: input.firstListPriceCents,
    ageMonths,
    category: input.category,
    condition: input.condition,
    usage: input.usage,
    residualCurves: input.residualCurves,
  });

  const baseLines: EarlyExitLine[] = [
    {
      key: 'remainingRents',
      amountCents: nominalRemainingRentsCents,
      params: { months: remainingMonths, rentCents: monthlyNetRentCents },
    },
    { key: 'buyout', amountCents: buyoutNetCents, params: {} },
    {
      key: 'interestNotCharged',
      amountCents: balanceCents - nominalRemainingRentsCents - buyoutNetCents,
      params: { annualInterestPercent: input.annualInterestPercent },
    },
  ];

  const rawReturnCents = balanceCents - marketValueCents;
  const returnNetCents = Math.max(0, Math.min(rawReturnCents, nominalRemainingRentsCents));
  const returnLines: EarlyExitLine[] = [
    ...baseLines,
    { key: 'returnCredit', amountCents: -marketValueCents, params: { ageMonths } },
  ];
  if (returnNetCents !== rawReturnCents) {
    returnLines.push({
      key: 'returnAdjustment',
      amountCents: returnNetCents - rawReturnCents,
      params: {},
    });
  }

  const asOption = (netCents: number, lines: EarlyExitLine[]): EarlyExitOption => ({
    netCents,
    settlement: calculateBuyoutSettlement({
      buyoutNetCents: netCents,
      asOf,
      vatRates: input.vatRates,
    }),
    lines,
  });

  return {
    signedOn,
    asOf,
    termMonths,
    billedMonths,
    remainingMonths,
    monthlyNetRentCents,
    nominalRemainingRentsCents,
    annualInterestPercent: input.annualInterestPercent,
    balanceCents,
    marketValue: {
      ageMonths,
      curvePercent: interpolateResidualCurve(curvePoints, ageMonths),
      valueCents: marketValueCents,
    },
    buyout: asOption(balanceCents, baseLines),
    returnItem: asOption(returnNetCents, returnLines),
  };
}

/**
 * Prices an early exit for a signed contract: leave on the due date of rent row `exitMonth`
 * (1 = the first rent, clamped to the term), with the item in `condition`. The page that shows
 * the price and the route that executes the exit both call this, so they always agree.
 */
export function earlyExitForContract(input: {
  quote: ContractQuote;
  signedOn: string;
  exitMonth: number;
  condition: AssetCondition;
  asset: { category: AssetCategory; usage: { unit: UsageUnit; value: number } };
  residualCurves: ResidualCurves;
  vatRates: VatRates;
}): EarlyExitQuote {
  const { quote, signedOn } = input;
  if (!Number.isInteger(input.exitMonth) || input.exitMonth < 1) {
    throw new RangeError(`exitMonth must be a positive integer, got ${input.exitMonth}`);
  }
  const exitMonth = Math.min(input.exitMonth, quote.termMonths);
  return calculateEarlyExit({
    signedOn,
    asOf: addMonthsClamped(signedOn, exitMonth - 1),
    termMonths: quote.termMonths,
    monthlyNetRentCents: quote.monthlyNetRentCents,
    buyoutNetCents: quote.buyoutNetCents,
    annualInterestPercent: quote.band.annual_interest_percent,
    firstListPriceCents: quote.listPriceCents,
    category: input.asset.category,
    condition: input.condition,
    usage: input.asset.usage,
    residualCurves: input.residualCurves,
    vatRates: input.vatRates,
  });
}
