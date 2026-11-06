import {
  isoDateSchema,
  type AssetCategory,
  type AssetCondition,
  type ResidualCurves,
} from '@/data/schemas';
import { addMonthsClamped } from '../calendar';
import { contractDatesFor } from '../contracts/contract';
import { residualValueFor } from '../second-life/residual-value';

export type EarlyExitAction = 'returned' | 'bought';

export type EarlyExitContract = {
  startsOn: string;
  endsOn: string;
  termMonths: number;
  monthlyNetRentCents: number;
  buyoutCents: number;
  annualInterestBasisPoints: number;
  listPriceCents: number;
};

export type EarlyExitAsset = {
  category: AssetCategory;
  condition: AssetCondition;
  usageValue: number;
};

export type EarlyExitQuoteInput = {
  action: EarlyExitAction;
  effectiveOn: string;
  contract: EarlyExitContract;
  asset: EarlyExitAsset;
  residualCurves: ResidualCurves;
};

export type EarlyExitQuote = {
  action: EarlyExitAction;
  effectiveOn: string;
  completedMonths: number;
  remainingMonths: number;
  remainingRentCents: number;
  annualInterestBasisPoints: number;
  discountedBalanceCents: number;
  marketValueCents: number;
  marketValueCreditCents: number;
  settlementNetCents: number;
};

export type EarlyExitFailure =
  | { ok: false; reason: 'effective_date_before_start' }
  | { ok: false; reason: 'term_finished' }
  | { ok: false; reason: 'effective_date_not_invoice_anniversary' }
  | { ok: false; reason: 'residual_value_unavailable'; detail: string };

function assertCents(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative whole number of cents, got ${value}`);
  }
}

function assertContract(contract: EarlyExitContract): void {
  if (!isoDateSchema.safeParse(contract.startsOn).success) {
    throw new RangeError(`startsOn must be a valid ISO date, got "${contract.startsOn}"`);
  }
  if (!isoDateSchema.safeParse(contract.endsOn).success) {
    throw new RangeError(`endsOn must be a valid ISO date, got "${contract.endsOn}"`);
  }
  if (!Number.isSafeInteger(contract.termMonths) || contract.termMonths <= 0) {
    throw new RangeError(`termMonths must be a positive whole number, got ${contract.termMonths}`);
  }
  if (
    !Number.isSafeInteger(contract.annualInterestBasisPoints) ||
    contract.annualInterestBasisPoints < 0
  ) {
    throw new RangeError(
      `annualInterestBasisPoints must be a non-negative whole number, got ${contract.annualInterestBasisPoints}`
    );
  }
  assertCents(contract.monthlyNetRentCents, 'monthlyNetRentCents');
  assertCents(contract.buyoutCents, 'buyoutCents');
  assertCents(contract.listPriceCents, 'listPriceCents');

  const expectedEnd = contractDatesFor(contract.startsOn, contract.termMonths).endsOn;
  if (expectedEnd !== contract.endsOn) {
    throw new RangeError(`endsOn must be the ${contract.termMonths}-month boundary after startsOn`);
  }
}

/** Returns the first invoice anniversary strictly after the requested date. */
export function nextInvoiceDateAfter(
  startsOn: string,
  termMonths: number,
  requestedOn: string
): string | null {
  if (!isoDateSchema.safeParse(requestedOn).success) {
    throw new RangeError(`requestedOn must be a valid ISO date, got "${requestedOn}"`);
  }

  for (let month = 1; month < termMonths; month += 1) {
    const dueOn = addMonthsClamped(startsOn, month);
    if (dueOn > requestedOn) return dueOn;
  }
  return null;
}

function completedMonthsAt(
  startsOn: string,
  effectiveOn: string,
  termMonths: number
): number | null {
  for (let month = 1; month < termMonths; month += 1) {
    if (addMonthsClamped(startsOn, month) === effectiveOn) return month;
  }
  return null;
}

/**
 * Prices an early exit on an invoice anniversary. The discounted balance is the
 * present value of remaining rents, including the effective-date rent, plus the
 * locked end buyout. The final settlement is rounded once to integer cents.
 */
export function earlyExitQuoteFor(
  input: EarlyExitQuoteInput
): { ok: true; quote: EarlyExitQuote } | EarlyExitFailure {
  assertContract(input.contract);
  if (!isoDateSchema.safeParse(input.effectiveOn).success) {
    throw new RangeError(`effectiveOn must be a valid ISO date, got "${input.effectiveOn}"`);
  }

  if (input.effectiveOn <= input.contract.startsOn) {
    return { ok: false, reason: 'effective_date_before_start' };
  }
  if (input.effectiveOn >= input.contract.endsOn) {
    return { ok: false, reason: 'term_finished' };
  }

  const completedMonths = completedMonthsAt(
    input.contract.startsOn,
    input.effectiveOn,
    input.contract.termMonths
  );
  if (completedMonths === null) {
    return { ok: false, reason: 'effective_date_not_invoice_anniversary' };
  }

  const remainingMonths = input.contract.termMonths - completedMonths;
  const annualRate = input.contract.annualInterestBasisPoints / 10_000;
  const discountedBase = 1 + annualRate;
  let discountedBalance = 0;
  for (let month = 0; month < remainingMonths; month += 1) {
    discountedBalance += input.contract.monthlyNetRentCents / Math.pow(discountedBase, month / 12);
  }
  discountedBalance += input.contract.buyoutCents / Math.pow(discountedBase, remainingMonths / 12);
  const discountedBalanceCents = Math.round(discountedBalance);

  const residual = residualValueFor({
    originalListPriceCents: input.contract.listPriceCents,
    category: input.asset.category,
    condition: input.asset.condition,
    usageValue: input.asset.usageValue,
    ageMonths: completedMonths,
    curves: input.residualCurves,
  });
  if (!residual.ok) {
    return { ok: false, reason: 'residual_value_unavailable', detail: residual.reason };
  }

  const marketValueCreditCents = input.action === 'returned' ? residual.marketValueCents : 0;
  const settlementNetCents = Math.max(0, discountedBalanceCents - marketValueCreditCents);

  return {
    ok: true,
    quote: {
      action: input.action,
      effectiveOn: input.effectiveOn,
      completedMonths,
      remainingMonths,
      remainingRentCents: input.contract.monthlyNetRentCents * remainingMonths,
      annualInterestBasisPoints: input.contract.annualInterestBasisPoints,
      discountedBalanceCents,
      marketValueCents: residual.marketValueCents,
      marketValueCreditCents,
      settlementNetCents,
    },
  };
}
