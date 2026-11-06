// Pricing: the price breakdown, the term comparison, quote validity and the stored quote's status.
export { compareTerms, type TermComparison, type TermRow } from './compare';
export { financeOffer, type FinanceOffer } from './financeable';
export { addDays } from '../civil-days';
export {
  breakdownFromFrozen,
  priceQuote,
  termsOf,
  type FrozenQuote,
  type PricingData,
  type QuoteBreakdown,
  type QuoteInput,
  type QuoteRefusal,
  type QuoteResult,
} from './quote';
export { quoteStatusOn, type QuoteForStatus, type QuoteStatus } from './quote-status';
export { allowedTerms, allowedTermsOf, longestAllowedTerm, termAllowed } from './terms';

/** A stored quote is valid until its quote day + this many days, that last day included (D7). */
export const QUOTE_VALID_DAYS = 14;
