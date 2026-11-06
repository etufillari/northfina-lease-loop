import { ApiError } from '../api-response';
import type { ContractCreationFailure } from './contracts';

/** Maps contract creation failures to stable API errors. */
export function throwContractError(result: ContractCreationFailure): never {
  switch (result.reason) {
    case 'application_not_found':
      throw new ApiError(404, 'CONTRACT_APPLICATION_NOT_FOUND', 'The application was not found');
    case 'application_not_approved':
      throw new ApiError(
        422,
        'APPLICATION_NOT_APPROVED',
        'Only approved applications can become contracts',
        {
          status: result.status,
        }
      );
    case 'contract_already_exists':
      throw new ApiError(
        409,
        'CONTRACT_ALREADY_EXISTS',
        'This application already has a contract',
        {
          contractId: result.contractId,
        }
      );
    case 'asset_unavailable':
      throw new ApiError(409, 'ASSET_UNAVAILABLE', 'The asset is no longer available for leasing', {
        status: result.status,
      });
    default: {
      const exhaustive: never = result;
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to create the contract', exhaustive);
    }
  }
}
