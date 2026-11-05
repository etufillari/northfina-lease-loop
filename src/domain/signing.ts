// Which stored quote a signature locks (D-014, D-034). A valid quote is always honoured; when
// today's rent is lower the customer must choose between their quote and today's, and the price
// that locks must be the one they were shown.
import type { CoefficientTable, PriceList } from '@/data/schemas';
import { priceCheckAtSigning, type PriceCheck } from './contract';
import type { Quote } from './quote';

/** What the customer chose when today's rent is lower than their quote. */
export type PriceChoice = 'keep_quote' | 'todays_price';

export type QuoteStatus = 'open' | 'expired' | 'not_yet_valid' | 'used';

export interface SigningChoice {
  priceChoice?: PriceChoice;
  /** The monthly rent excl. VAT the customer saw next to the button they pressed. */
  shownMonthlyNetRentCents: number;
}

export type QuoteToSign =
  | { ok: true; quote: Quote; check: PriceCheck; priceChoice: PriceChoice | null }
  | { ok: false; reason: 'quote_expired' | 'signed_before_quote' | 'price_changed' }
  | {
      ok: false;
      reason: 'price_choice_required';
      quotedMonthlyNetRentCents: number;
      todaysMonthlyNetRentCents: number;
      todaysPriceListVersion: number;
      savingPerMonthCents: number;
    };

/**
 * Whether a quote can still be signed on `today`. It is valid from its quote day through
 * `validUntil` (quote day + QUOTE_VALID_DAYS, inclusive), and a quote signs only once.
 * ISO dates compare correctly as strings.
 */
export function quoteStatus(
  quote: Pick<Quote, 'quoteDate' | 'validUntil'>,
  today: string,
  used: boolean
): QuoteStatus {
  if (used) return 'used';
  if (today < quote.quoteDate) return 'not_yet_valid';
  if (today > quote.validUntil) return 'expired';
  return 'open';
}

/** The quote to lock on `signDate`, or why nothing can be signed yet. */
export function quoteToSign(
  priceLists: readonly PriceList[],
  table: CoefficientTable,
  quote: Quote,
  signDate: string,
  choice: SigningChoice
): QuoteToSign {
  const status = quoteStatus(quote, signDate, false);
  if (status === 'not_yet_valid') return { ok: false, reason: 'signed_before_quote' };
  if (status === 'expired') return { ok: false, reason: 'quote_expired' };

  const check = priceCheckAtSigning(priceLists, table, quote, signDate);
  let signed: Quote;
  let priceChoice: PriceChoice | null = null;
  if (check.kind === 'cheaper_today') {
    if (choice.priceChoice === undefined) {
      return {
        ok: false,
        reason: 'price_choice_required',
        quotedMonthlyNetRentCents: quote.monthlyNetRentCents,
        todaysMonthlyNetRentCents: check.requote.monthlyNetRentCents,
        todaysPriceListVersion: check.requote.priceListVersion,
        savingPerMonthCents: check.savingPerMonthCents,
      };
    }
    priceChoice = choice.priceChoice;
    signed = priceChoice === 'todays_price' ? check.requote : quote;
  } else {
    // No cheaper offer exists today, so a browser asking for one showed a stale price.
    if (choice.priceChoice === 'todays_price') return { ok: false, reason: 'price_changed' };
    signed = quote;
  }
  // The locked price must be the price on screen (D-034).
  if (signed.monthlyNetRentCents !== choice.shownMonthlyNetRentCents) {
    return { ok: false, reason: 'price_changed' };
  }
  return { ok: true, quote: signed, check, priceChoice };
}
