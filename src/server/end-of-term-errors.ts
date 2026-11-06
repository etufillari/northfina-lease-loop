import { ApiError } from './api-response';
import type { EndOfTermResult } from './end-of-term';

/** Maps end-of-term service failures to stable API errors. */
export function throwEndOfTermError(result: Extract<EndOfTermResult, { ok: false }>): never {
  switch (result.reason) {
    case 'contract_not_found':
      throw new ApiError(404, 'CONTRACT_NOT_FOUND', 'The contract was not found');
    case 'invoice_schedule_not_generated':
      throw new ApiError(422, 'INVOICE_SCHEDULE_NOT_GENERATED', 'The invoice schedule is required');
    case 'contract_not_active':
      throw new ApiError(422, 'CONTRACT_NOT_ACTIVE', 'Only active contracts can be completed', {
        status: result.status,
      });
    case 'term_not_finished':
      throw new ApiError(422, 'TERM_NOT_FINISHED', 'The contract term has not finished', {
        endsOn: result.endsOn,
        completedOn: result.completedOn,
      });
    case 'rent_balance_outstanding':
      throw new ApiError(422, 'RENT_BALANCE_OUTSTANDING', 'All rent invoices must be paid', {
        outstandingRentCents: result.outstandingRentCents,
      });
    case 'buyout_payment_required':
      throw new ApiError(422, 'BUYOUT_PAYMENT_REQUIRED', 'The exact buyout amount is required', {
        expectedCents: result.expectedCents,
      });
    case 'buyout_amount_mismatch':
      throw new ApiError(
        422,
        'BUYOUT_AMOUNT_MISMATCH',
        'Buyout payment must equal the locked amount',
        {
          expectedCents: result.expectedCents,
          receivedCents: result.receivedCents,
        }
      );
    case 'buyout_not_allowed':
      throw new ApiError(422, 'BUYOUT_NOT_ALLOWED', 'Returns cannot include a buyout payment');
    case 'asset_not_reserved':
      throw new ApiError(
        409,
        'ASSET_NOT_RESERVED',
        'The contract asset is not in the expected state',
        {
          status: result.status,
        }
      );
    default: {
      const exhaustive: never = result;
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to complete the contract', exhaustive);
    }
  }
}
