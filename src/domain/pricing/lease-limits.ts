// Which terms and down payments can be priced for one item. The sliders use these limits,
// so a customer can never pick a combination that `leasePriceFor` would reject.
import type { CoefficientTable } from '@/data/schemas';

const PREFERRED_TERM_MONTHS = 36;
/** Below this range (€10) a down payment slider only adds noise, so it stays at the minimum. */
const MIN_ADJUSTABLE_RANGE_CENTS = 1_000;
/** A slider this fine can still be dragged and stepped through with a keyboard. */
const MAX_SLIDER_POSITIONS = 300;
/** Round amounts: €1, €10, €50, €100, €500, €1,000 and €5,000. */
const STEP_SIZES_CENTS = [100, 1_000, 5_000, 10_000, 50_000, 100_000, 500_000];

export type LeaseLimits = {
  termOptions: number[];
  defaultTermMonths: number;
  minDownPaymentCents: number;
  maxDownPaymentCents: number;
  downPaymentStepCents: number;
};

export type LeaseLimitsResult =
  ({ ok: true } & LeaseLimits) | { ok: false; reason: 'below_minimum' };

/** Terms that every band can price and that have a buyout, shortest first. */
function termOptionsFor(table: CoefficientTable): number[] {
  return Object.keys(table.end_of_term_buyout_percent_of_financed)
    .filter((term) => table.bands.every((band) => band.monthly_factor_by_term[term] !== undefined))
    .map(Number)
    .sort((a, b) => a - b);
}

function downPaymentStepFor(rangeCents: number): number {
  const fitting = STEP_SIZES_CENTS.find((step) => rangeCents / step <= MAX_SLIDER_POSITIONS);
  return fitting ?? Math.max(...STEP_SIZES_CENTS);
}

/**
 * Finds the choices a customer has for an item at `netListPriceCents`.
 *
 * The financed amount (list price minus down payment) must stay inside the table's bands.
 * An item above the top band can still be leased with a large enough down payment, so
 * only an item below the lowest band has no valid choice. This assumes the bands have no
 * gaps between them, which is true of the data pack and checked in the tests.
 */
export function leaseLimitsFor(
  table: CoefficientTable,
  netListPriceCents: number
): LeaseLimitsResult {
  const lowestFinanced = Math.min(...table.bands.map((band) => band.min_financed_cents));
  const highestFinanced = Math.max(...table.bands.map((band) => band.max_financed_cents));
  if (netListPriceCents < lowestFinanced) return { ok: false, reason: 'below_minimum' };

  const minDownPaymentCents = Math.max(0, netListPriceCents - highestFinanced);
  const highestDownPayment = netListPriceCents - lowestFinanced;
  const adjustable = highestDownPayment - minDownPaymentCents >= MIN_ADJUSTABLE_RANGE_CENTS;
  const maxDownPaymentCents = adjustable ? highestDownPayment : minDownPaymentCents;

  const termOptions = termOptionsFor(table);
  return {
    ok: true,
    termOptions,
    defaultTermMonths: termOptions.includes(PREFERRED_TERM_MONTHS)
      ? PREFERRED_TERM_MONTHS
      : Math.max(...termOptions),
    minDownPaymentCents,
    maxDownPaymentCents,
    downPaymentStepCents: downPaymentStepFor(maxDownPaymentCents - minDownPaymentCents),
  };
}

/** The highest slider position. Rounds up so the last position can reach the maximum. */
export function lastDownPaymentPosition(limits: LeaseLimits): number {
  const rangeCents = limits.maxDownPaymentCents - limits.minDownPaymentCents;
  return Math.ceil(rangeCents / limits.downPaymentStepCents);
}

/**
 * The down payment at a slider position. Positions sit one step apart from the minimum,
 * and the last one is capped at the maximum, so both ends are always reachable even when
 * the range does not divide evenly by the step.
 */
export function downPaymentAtPosition(limits: LeaseLimits, position: number): number {
  return Math.min(
    limits.minDownPaymentCents + position * limits.downPaymentStepCents,
    limits.maxDownPaymentCents
  );
}
