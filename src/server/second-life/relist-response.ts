// How a refused re-list is answered, in one place so the preview and the re-list agree.
import { fail } from '../api-response';
import type { RelistFailureReason } from './relist';

export function relistFailure(
  failure: { reason: RelistFailureReason; market_value_cents?: number },
  assetId: string
): Response {
  const details = { market_value_cents: failure.market_value_cents };
  switch (failure.reason) {
    case 'asset_not_found':
      return fail(404, 'ASSET_NOT_FOUND', `No asset with id "${assetId}"`);
    case 'asset_not_returned':
      return fail(409, 'ASSET_NOT_RETURNED', 'Only a returned item can be re-listed');
    case 'unknown_first_lease':
      return fail(422, 'FIRST_LEASE_UNKNOWN', 'This item has no first lease on record');
    case 'condition_too_low':
      return fail(422, 'CONDITION_TOO_LOW', 'The item must reach at least good', details);
    case 'below_minimum':
      return fail(422, 'PRICE_BELOW_MINIMUM', 'This item is worth too little to lease', details);
  }
}
