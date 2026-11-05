// Business rules we chose ourselves (the data pack is silent on them). One place to change them.

/** The down-payment slider moves in 10 € steps, and the API accepts only values on a step. */
export const DOWN_PAYMENT_STEP_CENTS = 1_000;
