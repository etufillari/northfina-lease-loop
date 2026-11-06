// Turns an approved application into a contract. The quote always wins: the contract keeps
// the price the customer was quoted, even if the price list changes before they sign.
import type { Application, AssetLife, Contract, Quote, QuoteResult } from '@/data/lease-schemas';
import type { Asset, CoefficientTable, Customer } from '@/data/schemas';
import { addDays, addMonths } from '../dates';
import { quote } from '../pricing/pricing';

export type SigningProblem = 'not_owner' | 'not_approved' | 'signatory_required';

/**
 * Why this customer cannot sign this application, or `null` if they can. Either source can
 * stop an applicant: the company record, whatever type they answered, or their own answer.
 * Whether the application is already signed and whether the asset is still free are for the
 * database to decide.
 */
export function signingProblem(
  application: Application,
  customer: Customer
): SigningProblem | null {
  if (application.customer_id !== customer.id) return 'not_owner';
  if (application.decision !== 'approved') return 'not_approved';
  const recordForbids = customer.type === 'company' && !customer.applicant_can_sign;
  if (recordForbids || application.answers.q_can_sign === 'no') return 'signatory_required';
  return null;
}

/** Prices the deal from the price stored on the application, never from a price list. */
export function lockedQuote(table: CoefficientTable, application: Application): QuoteResult {
  return quote(table, {
    basePriceCents: application.base_price_cents,
    priceListVersion: application.price_list_version,
    downPaymentCents: application.down_payment_cents,
    termMonths: application.term_months,
  });
}

/**
 * The contract, without its id. It starts on the planned date or the signing date, whichever
 * is later, so it never starts before it was signed. It ends the day before the same date
 * `term_months` later: a contract starting 5 Nov 2026 for 36 months ends 4 Nov 2029.
 */
export function buildContract(
  application: Application,
  lockedPrice: Quote,
  signedOn: string
): Omit<Contract, 'id'> {
  const startOn = application.start_on > signedOn ? application.start_on : signedOn;

  return {
    ...lockedPrice,
    application_id: application.id,
    customer_id: application.customer_id,
    asset_id: application.asset_id,
    quantity: application.quantity,
    quote_date: application.quote_date,
    signed_on: signedOn,
    start_on: startOn,
    planned_end_on: addDays(addMonths(startOn, lockedPrice.term_months), -1),
    actual_end_on: null,
    status: 'active',
  };
}

/**
 * The life a new contract opens, without its id. Lives number on from the latest recorded
 * one, or from `previous_lives` when the app has no record of them. The price at first lease
 * is what the residual curve needs: it carries over from earlier lives, and it is unknown
 * for an item whose first lease was before the app.
 */
export function openLife(
  contract: Contract,
  asset: Asset,
  latest: Pick<AssetLife, 'life_number' | 'first_lease_price_cents'> | null
): Omit<AssetLife, 'id'> {
  const lifeNumber = (latest?.life_number ?? asset.previous_lives) + 1;
  const isFirstLife = lifeNumber === 1;

  return {
    asset_id: contract.asset_id,
    life_number: lifeNumber,
    contract_id: contract.id,
    first_lease_price_cents: isFirstLife
      ? contract.base_price_cents / contract.quantity
      : (latest?.first_lease_price_cents ?? null),
    started_on: contract.start_on,
    ended_on: null,
    outcome: null,
    start_condition: asset.condition,
    start_usage_value: asset.usage.value,
    end_condition: null,
    end_usage_value: null,
  };
}
