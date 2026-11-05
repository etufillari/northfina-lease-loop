// Signing turns a valid quote into a contract that locks its price (D-014). Invoices derive from
// the contract only; later price lists can't touch it.
import type { CoefficientTable, PriceList } from '@/data/schemas';
import { makeQuote, type Quote } from './quote';

export interface SignatureDetails {
  customerId: string;
  signDate: string;
  /** First day of the lease; on or after the signing day. */
  startDate: string;
}

export type Contract = Readonly<Omit<Quote, 'validUntil'> & SignatureDetails>;

export type SignResult =
  | { ok: true; contract: Contract }
  | { ok: false; reason: 'quote_expired' | 'signed_before_quote' | 'starts_before_signing' };

/** What signing today would change, so the customer can choose before the price locks. */
export type PriceCheck =
  | { kind: 'unchanged' }
  | { kind: 'cheaper_today'; savingPerMonthCents: number; requote: Quote }
  | { kind: 'dearer_today'; extraPerMonthCents: number };

/** Locks the quote into a frozen contract. ISO dates compare correctly as strings. */
export function signContract(quote: Quote, details: SignatureDetails): SignResult {
  if (details.signDate < quote.quoteDate) return { ok: false, reason: 'signed_before_quote' };
  if (details.signDate > quote.validUntil) return { ok: false, reason: 'quote_expired' };
  if (details.startDate < details.signDate) return { ok: false, reason: 'starts_before_signing' };

  const { validUntil: _validUntil, ...locked } = quote;
  return { ok: true, contract: Object.freeze({ ...locked, ...details }) };
}

/**
 * Re-quotes the same terms on the signing day. A valid quote is always honoured; if today's
 * rent is lower we offer the cheaper quote instead. Compares the monthly rent, not the list
 * price, because a cheaper price can land in a dearer band (D-013).
 */
export function priceCheckAtSigning(
  priceLists: readonly PriceList[],
  table: CoefficientTable,
  quote: Quote,
  signDate: string
): PriceCheck {
  const today = makeQuote(priceLists, table, {
    assetId: quote.assetId,
    quoteDate: signDate,
    termMonths: quote.termMonths,
    downPaymentCents: quote.downPaymentCents,
  });
  if (!today.ok) return { kind: 'unchanged' };

  const difference = today.quote.monthlyNetRentCents - quote.monthlyNetRentCents;
  if (difference < 0) {
    return { kind: 'cheaper_today', savingPerMonthCents: -difference, requote: today.quote };
  }
  if (difference > 0) return { kind: 'dearer_today', extraPerMonthCents: difference };
  return { kind: 'unchanged' };
}
