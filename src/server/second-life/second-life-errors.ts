import { ApiError } from '../api-response';
import type { SecondLifeServiceFailure } from './second-life-matching';

/** Maps second-life matching failures to stable API errors. */
export function throwSecondLifeError(
  result: Extract<SecondLifeServiceFailure, { ok: false }>
): never {
  switch (result.reason) {
    case 'asset_not_found':
      throw new ApiError(404, 'ASSET_NOT_FOUND', 'The asset was not found');
    case 'asset_not_available':
      throw new ApiError(409, 'ASSET_NOT_AVAILABLE', 'Only available assets can be matched', {
        status: result.status,
      });
    case 'request_not_found':
      throw new ApiError(
        404,
        'SECOND_LIFE_REQUEST_NOT_FOUND',
        'The waiting-list request was not found',
        {
          requestId: result.requestId,
        }
      );
    case 'request_already_matched':
      throw new ApiError(
        409,
        'SECOND_LIFE_REQUEST_ALREADY_MATCHED',
        'The waiting-list request is already matched',
        {
          requestId: result.requestId,
          matchId: result.matchId,
        }
      );
    case 'request_not_eligible':
      throw new ApiError(
        422,
        'SECOND_LIFE_REQUEST_NOT_ELIGIBLE',
        'The waiting-list request is not eligible for this asset',
        {
          requestId: result.requestId,
          reasons: result.reasons,
        }
      );
    case 'asset_snapshot_changed':
      throw new ApiError(
        409,
        'ASSET_SNAPSHOT_CHANGED',
        'The asset changed while matching was accepted',
        {
          status: result.status,
        }
      );
    case 'invalid_lifecycle_dates':
      throw new ApiError(
        422,
        'INVALID_ASSET_LIFECYCLE_DATES',
        'The asset lifecycle dates are inconsistent'
      );
    case 'original_price_not_found':
      throw new ApiError(
        422,
        'ORIGINAL_PRICE_NOT_FOUND',
        'The asset has no original price for residual valuation'
      );
    default: {
      const exhaustive: never = result;
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to match the asset', exhaustive);
    }
  }
}
