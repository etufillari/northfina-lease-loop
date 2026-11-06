import { ApiError } from './api-response';
import type { RefurbishmentResult } from './refurbishment';

/** Maps refurbishment failures to stable API errors. */
export function throwRefurbishmentError(
  result: Extract<RefurbishmentResult, { ok: false }>
): never {
  switch (result.reason) {
    case 'asset_not_found':
      throw new ApiError(404, 'ASSET_NOT_FOUND', 'The asset was not found');
    case 'asset_not_returned':
      throw new ApiError(409, 'ASSET_NOT_RETURNED', 'Only returned assets can be refurbished', {
        status: result.status,
      });
    case 'minimum_condition_required':
      throw new ApiError(
        422,
        'MINIMUM_CONDITION_REQUIRED',
        'A refurbished asset must reach at least good condition',
        { targetCondition: result.targetCondition }
      );
    case 'target_condition_not_reachable':
      throw new ApiError(
        422,
        'TARGET_CONDITION_NOT_REACHABLE',
        'The target condition is not reachable',
        {
          currentCondition: result.currentCondition,
          targetCondition: result.targetCondition,
        }
      );
    case 'unsupported_refurbishment_rule':
      throw new ApiError(
        422,
        'UNSUPPORTED_REFURBISHMENT_RULE',
        'The refurbishment rule is not supported',
        {
          rule: result.rule,
        }
      );
    default: {
      const exhaustive: never = result;
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to process refurbishment', exhaustive);
    }
  }
}
