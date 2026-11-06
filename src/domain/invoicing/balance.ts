// The outstanding balance of a contract (decision D14): the financed amount amortised at the
// band's annual interest rate with the monthly net rent as the payment. The coefficient table's
// factors are built so that after the whole term the balance is the end-of-term buyout.
//
// Rounding (D1 applied per month): the monthly rate is the annual rate in basis points / 12,
// so one month's interest is `balance × annualBp / 120 000`, rounded half up to the cent once
// per month (away from zero for a negative balance). Then the rent is subtracted. Payments are
// in arrears of the interest: month k's interest accrues on the balance after k − 1 rents, which
// is the convention the pack's factors reproduce (the in-advance convention misses card 1's
// buyout by 28 €).
//
// Why the end lands only near the buyout: the pack rounds each factor to six decimals and the
// rent is rounded to the cent, and both errors compound over the term. `amortisationTolerance`
// bounds that; docs/features/invoicing.md reports the drift of cards 1 and 7.
import { percentToBasisPoints, roundHalfUpDiv } from '../money-math';

const MONTHS_PER_YEAR_TIMES_BP = 12 * 10_000;

export type BalanceInput = {
  financedCents: number;
  /** The band's `annual_interest_percent`, e.g. 7.9. */
  annualInterestPercent: number;
  monthlyNetCents: number;
  termMonths: number;
  buyoutCents: number;
};

export type AmortisationRow = {
  month: number;
  openingCents: number;
  interestCents: number;
  paymentCents: number;
  closingCents: number;
};

export type BalanceResult = {
  /** The balance after `monthsPaid` rents. */
  balanceCents: number;
  /** The balance after the whole term, by the same arithmetic. */
  endOfTermBalanceCents: number;
  /** `endOfTermBalanceCents − buyoutCents`: how far the pack's factor misses the buyout. */
  driftCents: number;
  /** One row per paid month, so the page can show the balance line by line. */
  rows: AmortisationRow[];
};

function assertWhole(name: string, value: number, min: number): void {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new RangeError(`${name} must be an integer ≥ ${min}, got ${value}`);
  }
}

/** One month's interest on `balanceCents`, rounded half up (away from zero) once. */
export function monthlyInterestCents(balanceCents: number, annualBasisPoints: number): number {
  const magnitude = roundHalfUpDiv(
    Math.abs(balanceCents) * annualBasisPoints,
    MONTHS_PER_YEAR_TIMES_BP
  );
  return balanceCents < 0 ? -magnitude : magnitude;
}

/** The full amortisation over the term, one row per month. */
export function amortisationSchedule(input: BalanceInput): AmortisationRow[] {
  const { financedCents, annualInterestPercent, monthlyNetCents, termMonths, buyoutCents } = input;
  assertWhole('financedCents', financedCents, 0);
  assertWhole('monthlyNetCents', monthlyNetCents, 0);
  assertWhole('termMonths', termMonths, 1);
  assertWhole('buyoutCents', buyoutCents, 0);
  const annualBasisPoints = percentToBasisPoints(annualInterestPercent);

  const rows: AmortisationRow[] = [];
  let balance = financedCents;
  for (let month = 1; month <= termMonths; month += 1) {
    const interest = monthlyInterestCents(balance, annualBasisPoints);
    const closing = balance + interest - monthlyNetCents;
    rows.push({
      month,
      openingCents: balance,
      interestCents: interest,
      paymentCents: monthlyNetCents,
      closingCents: closing,
    });
    balance = closing;
  }
  return rows;
}

/** The balance after `monthsPaid` rents (0 … term) and the end-of-term drift from the buyout. */
export function outstandingBalanceAfter(input: BalanceInput, monthsPaid: number): BalanceResult {
  assertWhole('monthsPaid', monthsPaid, 0);
  if (monthsPaid > input.termMonths) {
    throw new RangeError(`monthsPaid ${monthsPaid} is beyond the term of ${input.termMonths}`);
  }
  const all = amortisationSchedule(input);
  const rows = all.slice(0, monthsPaid);
  const endOfTermBalanceCents = all[all.length - 1]?.closingCents ?? input.financedCents;
  return {
    balanceCents: rows[rows.length - 1]?.closingCents ?? input.financedCents,
    endOfTermBalanceCents,
    driftCents: endOfTermBalanceCents - input.buyoutCents,
    rows,
  };
}

/**
 * How far the end-of-term balance may miss the buyout, in cents, from the two rounding steps
 * the pack forces on us: the rent is rounded to the cent (≤ 0.5 c a month) and each month's
 * interest is rounded (≤ 0.5 c a month), both compounding to at most `termMonths × growth`;
 * the factor is rounded to six decimals (≤ 0.5 millionths of the financed amount a month),
 * compounding the same way. `growth` is (1 + monthly rate)^term, bounded above by 2 for every
 * band and term in the pack. Rounded up to whole cents.
 */
export function amortisationTolerance(financedCents: number, termMonths: number): number {
  assertWhole('financedCents', financedCents, 0);
  assertWhole('termMonths', termMonths, 1);
  const growth = 2;
  const centRounding = termMonths * growth; // (0.5 + 0.5) c × months × growth
  const factorRounding = Math.ceil((financedCents * termMonths * growth) / 2_000_000);
  return centRounding + factorRounding;
}
