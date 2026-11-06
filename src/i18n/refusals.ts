// One place that turns a server refusal code into a kind, translated message (D-038). The
// routes answer `fail(status, CODE, …)`; the forms show `refusalText(t, code, fallback)` instead
// of a generic error. The map must name exactly the server's refusal types (the compiler checks),
// and a test checks that every code has its message in all four languages.
import type { CreateQuoteRefusal } from '@/server/quotes';
import type { EndLeaseRefusal } from '@/server/contract-endings';
import type { EndEarlyRefusal } from '@/server/early-exit';
import type { RelistRefusal } from '@/server/second-life';
import type { SignLeaseRefusal } from '@/server/contracts';
import type { CountersignRefusal } from '@/server/awaiting-signature';
import type { MessageKey, Translate } from './get-t';

/** The envelope's own codes (api-response.ts) and the not-found checks in the routes. */
type CommonRefusal =
  | 'validation_error'
  | 'invalid_json'
  | 'internal_error'
  | 'quote_not_found'
  | 'contract_not_found'
  | 'invalid_as_of_date';

export type RefusalCode =
  | CommonRefusal
  | CreateQuoteRefusal
  | SignLeaseRefusal
  | CountersignRefusal
  | EndLeaseRefusal
  | EndEarlyRefusal
  | RelistRefusal;

const messageKeys = {
  validation_error: 'refusal.validation_error',
  invalid_json: 'refusal.invalid_json',
  internal_error: 'refusal.internal_error',
  quote_not_found: 'refusal.quote_not_found',
  contract_not_found: 'refusal.contract_not_found',
  invalid_as_of_date: 'refusal.invalid_as_of_date',
  // quotes
  asset_not_found: 'refusal.asset_not_found',
  asset_not_available: 'lease.errorTaken',
  unknown_asset: 'refusal.unknown_asset',
  below_minimum: 'refusal.below_minimum',
  above_maximum: 'refusal.above_maximum',
  unknown_term: 'refusal.unknown_term',
  down_payment_negative: 'refusal.down_payment_negative',
  down_payment_off_step: 'refusal.down_payment_off_step',
  down_payment_too_large: 'refusal.down_payment_too_large',
  no_price_list_on_date: 'refusal.no_price_list_on_date',
  // signing
  quote_already_used: 'refusal.quote_already_used',
  quote_expired: 'refusal.quote_expired',
  signed_before_quote: 'refusal.signed_before_quote',
  price_choice_required: 'refusal.price_choice_required',
  price_changed: 'quote.stale',
  unknown_customer: 'refusal.unknown_customer',
  answers_do_not_match_customer: 'lease.errorRecord',
  starts_before_signing: 'refusal.starts_before_signing',
  no_vat_rate: 'refusal.no_vat_rate',
  application_incomplete: 'refusal.application_incomplete',
  application_invalid: 'refusal.application_invalid',
  application_declined: 'refusal.application_declined',
  application_needs_review: 'refusal.application_needs_review',
  // a contract waiting for its signatory (D-050)
  contract_not_active: 'refusal.contract_not_active',
  not_awaiting_signature: 'refusal.not_awaiting_signature',
  signed_before_sent: 'refusal.signed_before_sent',
  // end of term and early exit
  already_ended: 'refusal.already_ended',
  asset_not_leased: 'refusal.asset_not_leased',
  too_early: 'refusal.too_early',
  usage_went_down: 'end.reason.usage_went_down',
  condition_improved: 'refusal.condition_improved',
  next_lessee_is_current: 'end.reason.next_lessee_is_current',
  unknown_waiting_list_entry: 'refusal.unknown_waiting_list_entry',
  waiting_list_not_a_match: 'end.waitingStale',
  unknown_band: 'refusal.unknown_band',
  table_changed: 'refusal.table_changed',
  month_changed: 'refusal.month_changed',
  not_started: 'refusal.not_started',
  term_over: 'refusal.term_over',
  // re-listing
  asset_not_returned: 'refusal.asset_not_returned',
  target_not_allowed: 'refusal.target_not_allowed',
} as const satisfies Record<RefusalCode, MessageKey>;

/** Every refusal code, in lower case. */
export const refusalCodes = Object.keys(messageKeys) as RefusalCode[];

/** The message for an API error code (as sent: upper case), or `fallback` for one we don't know. */
export function refusalMessageKey(
  code: string | null | undefined,
  fallback: MessageKey
): MessageKey {
  const known = code?.toLowerCase();
  return known !== undefined && Object.hasOwn(messageKeys, known)
    ? messageKeys[known as RefusalCode]
    : fallback;
}

export function refusalText(
  t: Translate,
  code: string | null | undefined,
  fallback: MessageKey
): string {
  return t(refusalMessageKey(code, fallback));
}
