import { isoDateSchema } from '@/data/schemas';

export type RecordedPayment = {
  amountCents: number;
  paidOn: string;
};

export type PaymentStatus = 'unpaid' | 'partially_paid' | 'paid';

export type InvoicePaymentState = {
  totalPaidCents: number;
  remainingCents: number;
  status: PaymentStatus;
  isOverdue: boolean;
};

export type PaymentFailure =
  | { ok: false; reason: 'invalid_payment_amount' }
  | { ok: false; reason: 'invalid_payment_date' }
  | { ok: false; reason: 'payment_date_in_future' }
  | { ok: false; reason: 'payment_exceeds_balance'; remainingCents: number };

export type PaymentApplicationResult = { ok: true; state: InvoicePaymentState } | PaymentFailure;

function assertCents(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative whole number of cents, got ${value}`);
  }
}

function assertDate(value: string, name: string): void {
  if (!isoDateSchema.safeParse(value).success) {
    throw new RangeError(`${name} must be a valid ISO date, got "${value}"`);
  }
}

function totalPaidFor(payments: readonly RecordedPayment[]): number {
  return payments.reduce((total, payment) => {
    assertCents(payment.amountCents, 'payment amount');
    assertDate(payment.paidOn, 'payment date');
    const nextTotal = total + payment.amountCents;
    if (!Number.isSafeInteger(nextTotal)) throw new RangeError('payment total is too large');
    return nextTotal;
  }, 0);
}

/** Calculates an invoice balance without reading the clock or changing data. */
export function paymentStateFor(input: {
  totalCents: number;
  dueOn: string;
  payments: readonly RecordedPayment[];
  asOf: string;
}): InvoicePaymentState {
  assertCents(input.totalCents, 'invoice total');
  assertDate(input.dueOn, 'invoice due date');
  assertDate(input.asOf, 'as-of date');

  const totalPaidCents = totalPaidFor(input.payments);
  if (totalPaidCents > input.totalCents) {
    throw new RangeError('recorded payments exceed the invoice total');
  }

  const remainingCents = input.totalCents - totalPaidCents;
  const status: PaymentStatus =
    remainingCents === 0 ? 'paid' : totalPaidCents === 0 ? 'unpaid' : 'partially_paid';

  return {
    totalPaidCents,
    remainingCents,
    status,
    // An invoice is overdue only after its due date, not on the due date itself.
    isOverdue: remainingCents > 0 && input.asOf > input.dueOn,
  };
}

/** Validates and applies one payment to an invoice state. */
export function applyPaymentFor(input: {
  totalCents: number;
  dueOn: string;
  payments: readonly RecordedPayment[];
  payment: RecordedPayment;
  asOf: string;
}): PaymentApplicationResult {
  assertCents(input.totalCents, 'invoice total');
  assertDate(input.dueOn, 'invoice due date');
  assertDate(input.asOf, 'as-of date');

  if (!Number.isSafeInteger(input.payment.amountCents) || input.payment.amountCents <= 0) {
    return { ok: false, reason: 'invalid_payment_amount' };
  }
  if (!isoDateSchema.safeParse(input.payment.paidOn).success) {
    return { ok: false, reason: 'invalid_payment_date' };
  }
  if (input.payment.paidOn > input.asOf) {
    return { ok: false, reason: 'payment_date_in_future' };
  }

  const current = paymentStateFor({
    totalCents: input.totalCents,
    dueOn: input.dueOn,
    payments: input.payments,
    asOf: input.asOf,
  });
  if (input.payment.amountCents > current.remainingCents) {
    return {
      ok: false,
      reason: 'payment_exceeds_balance',
      remainingCents: current.remainingCents,
    };
  }

  return {
    ok: true,
    state: paymentStateFor({
      totalCents: input.totalCents,
      dueOn: input.dueOn,
      payments: [...input.payments, input.payment],
      asOf: input.asOf,
    }),
  };
}
