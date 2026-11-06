import { ApiError } from './api-response';
import type { EarlyExitFailure } from './early-exit';

/** Maps early-exit service failures to stable API errors. */
export function throwEarlyExitError(result: Extract<EarlyExitFailure, { ok: false }>): never {
  switch (result.reason) {
    case 'contract_not_found':
      throw new ApiError(404, 'CONTRACT_NOT_FOUND', 'The contract was not found');
    case 'contract_not_active':
      throw new ApiError(422, 'CONTRACT_NOT_ACTIVE', 'Only active contracts can be ended early', {
        status: result.status,
      });
    case 'invoice_schedule_not_generated':
      throw new ApiError(422, 'INVOICE_SCHEDULE_NOT_GENERATED', 'The invoice schedule is required');
    case 'asset_not_reserved':
    case 'asset_not_reserved_at_processing':
      throw new ApiError(
        409,
        'ASSET_NOT_RESERVED',
        'The contract asset is not in the expected state',
        {
          status: result.status,
        }
      );
    case 'interest_snapshot_missing':
      throw new ApiError(
        422,
        'INTEREST_SNAPSHOT_MISSING',
        'The contract has no locked discount rate'
      );
    case 'request_before_start':
      throw new ApiError(
        422,
        'REQUEST_BEFORE_START',
        'An early exit cannot be requested before the lease starts'
      );
    case 'early_exit_not_available':
      throw new ApiError(
        422,
        'EARLY_EXIT_NOT_AVAILABLE',
        'The contract is already at or beyond its term'
      );
    case 'no_vat_rate_on_date':
      throw new ApiError(422, 'NO_VAT_RATE_ON_DATE', 'No VAT rate covers the effective date', {
        effectiveOn: result.effectiveOn,
      });
    case 'early_exit_request_exists':
      throw new ApiError(409, 'EARLY_EXIT_REQUEST_EXISTS', 'An early-exit request already exists', {
        requestId: result.requestId,
      });
    case 'early_exit_request_not_found':
      throw new ApiError(
        404,
        'EARLY_EXIT_REQUEST_NOT_FOUND',
        'The early-exit request was not found'
      );
    case 'early_exit_request_not_pending':
      throw new ApiError(
        409,
        'EARLY_EXIT_REQUEST_NOT_PENDING',
        'The early-exit request is not pending',
        {
          status: result.status,
        }
      );
    case 'early_exit_not_due':
      throw new ApiError(422, 'EARLY_EXIT_NOT_DUE', 'The early-exit request is not due yet', {
        effectiveOn: result.effectiveOn,
        processedOn: result.processedOn,
      });
    case 'settlement_amount_mismatch':
      throw new ApiError(
        422,
        'SETTLEMENT_AMOUNT_MISMATCH',
        'Settlement must equal the quoted amount',
        {
          expectedCents: result.expectedCents,
          receivedCents: result.receivedCents,
        }
      );
    case 'rent_balance_outstanding':
      throw new ApiError(
        422,
        'RENT_BALANCE_OUTSTANDING',
        'All rent invoices before the exit must be paid',
        {
          outstandingRentCents: result.outstandingRentCents,
        }
      );
    case 'future_invoice_paid':
      throw new ApiError(
        422,
        'FUTURE_INVOICE_PAID',
        'A future invoice was paid before the exit was processed'
      );
    case 'asset_snapshot_changed':
      throw new ApiError(
        409,
        'ASSET_SNAPSHOT_CHANGED',
        'The asset changed after the quote was requested'
      );
    default: {
      const exhaustive: never = result;
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to process the early exit', exhaustive);
    }
  }
}
