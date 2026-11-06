import { ApiError, ok } from '@/server/api-response';
import { ReturnServiceError } from './types';

const serviceErrors: Record<ReturnServiceError['code'], { status: number; message: string }> = {
  INVALID_REQUEST: { status: 400, message: 'The return request is not valid' },
  NOT_FOUND: { status: 404, message: 'The lease, return, or work item was not found' },
  LEASE_NOT_RETURNABLE: { status: 409, message: 'The lease does not permit a return' },
  LEASE_ASSET_MISMATCH: { status: 409, message: 'The asset does not match the lease' },
  ASSET_NOT_ALLOCATED: { status: 409, message: 'The asset is not allocated to this lease' },
  ASSET_UNAVAILABLE: { status: 409, message: 'The asset is not available for this operation' },
  ALREADY_RETURNED: { status: 409, message: 'This lease has already been returned' },
  IDEMPOTENCY_CONFLICT: {
    status: 409,
    message: 'The request key was already used with different return details',
  },
  INVALID_INSPECTION: { status: 422, message: 'The inspection details cannot be processed' },
  USAGE_REDUCTION_EVIDENCE_REQUIRED: {
    status: 422,
    message: 'Evidence is required when recorded usage decreases',
  },
  WORK_NOT_FOUND: { status: 404, message: 'The refurbishment work item was not found' },
  WORK_EVIDENCE_REQUIRED: {
    status: 422,
    message: 'Evidence is required to complete this work',
  },
  WORK_ALREADY_COMPLETED: { status: 409, message: 'This work item is already complete' },
  WORK_OUT_OF_ORDER: {
    status: 409,
    message: 'The previous condition upgrade must be completed first',
  },
  RETURN_NOT_PENDING: { status: 409, message: 'The return is not awaiting refurbishment' },
};

export async function respondReturnOperation<T>(operation: () => Promise<T>): Promise<Response> {
  try {
    return ok(await operation());
  } catch (error) {
    if (!(error instanceof ReturnServiceError)) throw error;
    const mapped = serviceErrors[error.code];
    throw new ApiError(mapped.status, error.code, mapped.message);
  }
}
