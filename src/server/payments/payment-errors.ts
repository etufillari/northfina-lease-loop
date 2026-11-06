import { ApiError } from '../api-response';
import type { InvoicePaymentsResult, PaymentRecordingResult } from './payments';

type PaymentApiFailure =
  Extract<PaymentRecordingResult, { ok: false }> | Extract<InvoicePaymentsResult, { ok: false }>;

/** Maps payment service failures to stable API errors. */
export function throwPaymentError(result: PaymentApiFailure): never {
  switch (result.reason) {
    case 'contract_not_found':
      throw new ApiError(404, 'PAYMENT_CONTRACT_NOT_FOUND', 'The contract was not found');
    case 'invoice_not_found':
      throw new ApiError(404, 'PAYMENT_INVOICE_NOT_FOUND', 'The invoice was not found');
    case 'invoice_cancelled':
      throw new ApiError(422, 'INVOICE_CANCELLED', 'Cancelled invoices cannot receive payments');
    case 'invalid_payment_amount':
      throw new ApiError(
        422,
        'INVALID_PAYMENT_AMOUNT',
        'Payment amount must be positive whole cents'
      );
    case 'invalid_payment_date':
      throw new ApiError(422, 'INVALID_PAYMENT_DATE', 'Payment date must be a valid ISO date');
    case 'payment_date_in_future':
      throw new ApiError(422, 'PAYMENT_DATE_IN_FUTURE', 'Payment date cannot be in the future');
    case 'payment_exceeds_balance':
      throw new ApiError(422, 'PAYMENT_EXCEEDS_BALANCE', 'Payment exceeds the invoice balance', {
        remainingCents: result.remainingCents,
      });
    default: {
      const exhaustive: never = result;
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to process payment', exhaustive);
    }
  }
}
