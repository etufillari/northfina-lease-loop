import { invoiceAmounts } from './lease-billing';

export type SettlementInput = {
  monthlyNetCents: number;
  buyoutCents: number;
  remainingMonths: number;
  annualRateBasisPoints: number;
  recoveryCents: number;
  vatBasisPoints: number;
  /** Already-gross unpaid issued invoices; never apply VAT to this a second time. */
  outstandingCents: number;
  damageCents?: number;
  /** The whole term, so a repair's cost can follow how much of the lease is left. */
  termMonths?: number;
};

function roundedCents(numerator: bigint, denominator: bigint) {
  const result = Number((numerator + denominator / 2n) / denominator);
  if (!Number.isSafeInteger(result) || result < 0)
    throw new RangeError('Settlement exceeds safe cents');
  return result;
}

/**
 * The customer's share of repairs for new damage: all of it at the start of a lease, falling evenly
 * to half at the end, because parts in an older item were nearly used up and the lease has mostly paid for it.
 */
export function repairShare(remainingMonths: number, termMonths?: number): number {
  if (!termMonths) return 10_000;
  return 5_000 + Math.floor((5_000 * Math.min(remainingMonths, termMonths)) / termMonths);
}

/** Annual nominal basis points / 12 gives the monthly discount rate, represented as an exact rational. */
export function settlementQuote(input: SettlementInput) {
  if (
    !Object.values(input).every((value) => Number.isSafeInteger(value) && value >= 0) ||
    input.remainingMonths > 120 ||
    input.annualRateBasisPoints > 100_000
  )
    throw new RangeError('Invalid settlement facts');
  const months = BigInt(input.remainingMonths);
  const monthly = BigInt(input.monthlyNetCents);
  const buyout = BigInt(input.buyoutCents);
  let buyoutNetCents: number;
  let remainingRentNetCents: number;
  if (input.annualRateBasisPoints === 0 || months === 0n) {
    remainingRentNetCents = roundedCents(monthly * months, 1n);
    buyoutNetCents = roundedCents(monthly * months + buyout, 1n);
  } else {
    const rate = BigInt(input.annualRateBasisPoints);
    const base = 120_000n;
    const discounted = (base + rate) ** months;
    const undiscounted = base ** months;
    const rentNumerator = monthly * base * (discounted - undiscounted);
    const denominator = rate * discounted;
    // Both amounts are rounded once, half up, at their final net-cent boundaries.
    remainingRentNetCents = roundedCents(rentNumerator, denominator);
    buyoutNetCents = roundedCents(rentNumerator + buyout * rate * undiscounted, denominator);
  }
  // At the agreed end, returning the asset does not make the customer liable for its residual value.
  const financialReturnNetCents =
    input.remainingMonths === 0
      ? 0
      : Math.min(remainingRentNetCents, Math.max(0, buyoutNetCents - input.recoveryCents));
  const repairShareBasisPoints = repairShare(input.remainingMonths, input.termMonths);
  const customerRepairNetCents = roundedCents(
    BigInt(input.damageCents ?? 0) * BigInt(repairShareBasisPoints),
    10_000n
  );
  // Worth is measured before damage repairs, so adding the two charges nothing twice.
  const returnNetCents = financialReturnNetCents + customerRepairNetCents;
  // This demo treats settlement charges at the selected standard rate; it is a versioned commercial policy.
  const buyoutTotalCents =
    invoiceAmounts(buyoutNetCents, input.vatBasisPoints).totalCents + input.outstandingCents;
  const returnTotalCents =
    invoiceAmounts(returnNetCents, input.vatBasisPoints).totalCents + input.outstandingCents;
  if (![buyoutTotalCents, returnTotalCents].every(Number.isSafeInteger))
    throw new RangeError('Settlement exceeds safe cents');
  return {
    buyoutNetCents,
    buyoutTotalCents,
    returnNetCents,
    returnTotalCents,
    earlyReturnNetCents: financialReturnNetCents,
    customerRepairNetCents,
    repairShareBasisPoints,
    remainingRentNetCents,
    policyVersion: 'settlement-v3' as const,
  };
}

/** The two amounts a customer agrees to in the return form, kept for the rest of the return. */
export type AgreedReturnPrice = {
  vatBasisPoints: number;
  earlyReturnNetCents: number;
  customerRepairNetCents: number;
  repairShareBasisPoints: number;
};

/**
 * The total for an agreed price. Unpaid rent is added at its current amount because it is a fact of
 * the invoices, not part of what was agreed, so rent paid in the meantime is not charged again.
 */
export function agreedReturnTotalCents(agreed: AgreedReturnPrice, outstandingCents: number) {
  const netCents = agreed.earlyReturnNetCents + agreed.customerRepairNetCents;
  const totalCents = invoiceAmounts(netCents, agreed.vatBasisPoints).totalCents + outstandingCents;
  if (!Number.isSafeInteger(totalCents) || outstandingCents < 0)
    throw new RangeError('Invalid agreed return price');
  return totalCents;
}

/** A settlement with the customer's agreed return price in place of the inspection's figures. */
export function withAgreedReturnPrice(
  settlement: ReturnType<typeof settlementQuote>,
  agreed: AgreedReturnPrice,
  outstandingCents: number
): ReturnType<typeof settlementQuote> {
  return {
    ...settlement,
    returnNetCents: agreed.earlyReturnNetCents + agreed.customerRepairNetCents,
    returnTotalCents: agreedReturnTotalCents(agreed, outstandingCents),
    earlyReturnNetCents: agreed.earlyReturnNetCents,
    customerRepairNetCents: agreed.customerRepairNetCents,
    repairShareBasisPoints: agreed.repairShareBasisPoints,
  };
}

/**
 * The buyout in terms a customer can check: what is left to pay, and what paying early saves.
 * The end-of-lease price is whatever remains of the total, so the parts always add up.
 */
export function buyoutBreakdown(input: SettlementInput) {
  const quote = settlementQuote(input);
  const gross = (net: number) => invoiceAmounts(net, input.vatBasisPoints).totalCents;
  const payableTodayCents = quote.buyoutTotalCents - input.outstandingCents;
  const undiscountedCents = gross(
    input.monthlyNetCents * input.remainingMonths + input.buyoutCents
  );
  const endPriceCents = gross(input.buyoutCents);
  return {
    totalCents: quote.buyoutTotalCents,
    remainingPayments: input.remainingMonths,
    monthlyCents: gross(input.monthlyNetCents),
    /** Every payment left, at face value. With the three below, adds up to the total exactly. */
    allPaymentsCents: undiscountedCents - endPriceCents,
    endPriceCents,
    interestSavedCents: undiscountedCents - payableTodayCents,
    unpaidCents: input.outstandingCents,
    annualRatePercent: input.annualRateBasisPoints / 100,
  };
}
