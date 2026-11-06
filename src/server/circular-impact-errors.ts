import { ApiError } from './api-response';
import type { CircularImpactServiceFailure } from './circular-impact';

/** Maps circular-impact failures to stable API errors. */
export function throwCircularImpactError(
  result: Extract<CircularImpactServiceFailure, { ok: false }>
): never {
  switch (result.reason) {
    case 'asset_not_found':
      throw new ApiError(404, 'ASSET_NOT_FOUND', 'The asset was not found');
    case 'co2_factor_not_found':
      throw new ApiError(422, 'CO2_FACTOR_NOT_FOUND', 'The asset category has no CO₂ factor');
    case 'new_price_not_found':
      throw new ApiError(422, 'NEW_PRICE_NOT_FOUND', 'No current net price exists for this asset');
    case 'original_price_not_found':
      throw new ApiError(
        422,
        'ORIGINAL_PRICE_NOT_FOUND',
        'The asset has no original price for valuation'
      );
    case 'invalid_lifecycle_dates':
      throw new ApiError(
        422,
        'INVALID_ASSET_LIFECYCLE_DATES',
        'The asset lifecycle dates are inconsistent'
      );
    default: {
      const exhaustive: never = result;
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to calculate circular impact', exhaustive);
    }
  }
}
