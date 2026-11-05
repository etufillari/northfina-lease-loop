// Business rules we chose ourselves (the data pack is silent on them). One place to change them.

/** The down-payment slider moves in 10 € steps, and the API accepts only values on a step. */
export const DOWN_PAYMENT_STEP_CENTS = 1_000;

/** A quote can be signed up to this many days after it was made (D-014). */
export const QUOTE_VALID_DAYS = 7;
