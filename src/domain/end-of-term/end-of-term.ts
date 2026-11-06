// What a customer may do when a lease reaches its end. They choose to buy it, return it or pass
// it on, from the planned end date until the choice window closes. Past that, the contract
// closes as returned, so a lease cannot run on with nobody having decided.
import type { Contract, Invoice, LifeOutcome } from '@/data/lease-schemas';
import type { Asset, AssetCategory, Customer, SecondLifeRequest, VatRates } from '@/data/schemas';
import { addDays } from '../dates';
import { vatCents, vatRateOn } from '../vat';

export const CHOICE_WINDOW_DAYS = 7;

/** An early exit also ends a contract, but it is not one of the end-of-term choices. */
export type EndOutcome = Exclude<LifeOutcome, 'exited_early'>;

export type EndChoice = 'not_due' | 'open' | 'expired' | 'closed';

/** The last day the customer can choose. */
export function choiceDeadline(contract: Pick<Contract, 'planned_end_on'>): string {
  return addDays(contract.planned_end_on, CHOICE_WINDOW_DAYS);
}

/** Where a contract stands on `today`. ISO dates compare correctly as text. */
export function endChoice(
  contract: Pick<Contract, 'status' | 'planned_end_on'>,
  today: string
): EndChoice {
  if (contract.status !== 'active') return 'closed';
  if (today < contract.planned_end_on) return 'not_due';
  return today <= choiceDeadline(contract) ? 'open' : 'expired';
}

export type EndProblem = 'not_owner' | 'already_ended' | 'not_due' | 'window_closed';

/** Why this customer cannot make the choice today, or `null` if they can. */
export function endProblem(
  contract: Pick<Contract, 'customer_id' | 'status' | 'planned_end_on'>,
  customerId: string,
  today: string
): EndProblem | null {
  if (contract.customer_id !== customerId) return 'not_owner';
  const state = endChoice(contract, today);
  if (state === 'closed') return 'already_ended';
  if (state === 'not_due') return 'not_due';
  return state === 'expired' ? 'window_closed' : null;
}

/**
 * Who an item can be passed on to: customers on the waiting list for its category, other than
 * the owner. `needed_by` is ignored, because every date passes before a lease can end.
 */
export function passOnCandidates(
  customers: readonly Customer[],
  demand: readonly SecondLifeRequest[],
  category: AssetCategory,
  ownerId: string
): Customer[] {
  return customers.filter(
    (customer) =>
      customer.id !== ownerId &&
      demand.some((entry) => entry.id === customer.waitlist_id && entry.category === category)
  );
}

export function assetStatusAfter(
  outcome: EndOutcome
): Extract<Asset['status'], 'sold' | 'returned'> {
  return outcome === 'bought_out' ? 'sold' : 'returned';
}

/**
 * The invoice for buying the item, without its id. It follows the last invoice, and takes
 * the VAT rate on the day of the purchase, like every other invoice.
 */
export function buyoutInvoice(
  contract: Pick<Contract, 'id' | 'term_months' | 'down_payment_cents' | 'buyout_cents'>,
  vatRates: VatRates,
  endDate: string
): Omit<Invoice, 'id'> {
  const rate = vatRateOn(vatRates, endDate);
  if (!rate.ok) throw new RangeError(`no VAT rate on ${endDate}`);

  const vat = vatCents(contract.buyout_cents, rate.rateBasisPoints);
  return {
    contract_id: contract.id,
    sequence: contract.term_months + (contract.down_payment_cents > 0 ? 2 : 1),
    kind: 'buyout',
    period_start: endDate,
    period_end: endDate,
    invoice_date: endDate,
    due_date: endDate,
    net_cents: contract.buyout_cents,
    vat_rate_basis_points: rate.rateBasisPoints,
    vat_cents: vat,
    total_cents: contract.buyout_cents + vat,
    status: 'issued',
  };
}
