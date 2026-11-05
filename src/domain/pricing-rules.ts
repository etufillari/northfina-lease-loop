import type { BillingRule } from './invoicing';

// Business rules in one place to change them: the ones we chose ourselves (the data pack is silent
// on them) and the thresholds from the rules that the code checks (D-038).

/** The down-payment slider moves in 10 € steps, and the API accepts only values on a step. */
export const DOWN_PAYMENT_STEP_CENTS = 1_000;

/** A quote can be signed up to this many days after it was made (D-014). */
export const QUOTE_VALID_DAYS = 7;

/** New contracts are billed on the start day each month, in full months (D-016). */
export const DEFAULT_BILLING_RULE: BillingRule = 'start_day_full_months';

/** Rent incl. VAT may be at most this share of a consumer's monthly net income (D-023). */
export const AFFORDABILITY_PERCENT = 30;

/** An answer that sends a complete application to a person instead of approving it. */
export interface ManualReviewRule {
  questionId: string;
  answer: string;
  /** The reason shown with the decision (`reason.<reason>` in the messages). */
  reason: 'pep_manual_review';
}

/** A politically exposed person is never auto-approved (the rules); D-038 moved it here. */
export const MANUAL_REVIEW_WHEN: readonly ManualReviewRule[] = [
  { questionId: 'q_pep', answer: 'yes', reason: 'pep_manual_review' },
];
