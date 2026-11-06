import { ApiError } from './api-response';
import type { CreateQuoteFailure } from './quotes';

/** Maps pricing failures to the stable errors exposed by quote-related API routes. */
export function throwQuoteError(result: CreateQuoteFailure): never {
  switch (result.reason) {
    case 'asset_not_found':
      throw new ApiError(404, 'ASSET_NOT_FOUND', 'The requested asset was not found');
    case 'asset_unavailable':
      throw new ApiError(409, 'ASSET_UNAVAILABLE', 'The asset is not available for leasing', {
        status: result.status,
      });
    case 'no_price_list_on_date':
      throw new ApiError(422, 'NO_PRICE_LIST_ON_DATE', 'No price list applies on this date');
    case 'unknown_asset':
      throw new ApiError(422, 'PRICING_UNAVAILABLE', 'The asset has no price on this date');
    case 'down_payment_exceeds_list_price':
    case 'below_minimum':
    case 'above_maximum':
    case 'unknown_term':
      throw new ApiError(422, 'PRICING_UNAVAILABLE', 'The requested lease cannot be priced', {
        reason: result.reason,
      });
    case 'no_vat_rate_on_date':
      throw new ApiError(422, 'VAT_RATE_UNAVAILABLE', 'No VAT rate applies on this date');
  }
}
