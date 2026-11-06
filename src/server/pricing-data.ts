// The data-pack files that pricing needs, plus turning a refused domain result into an API
// error. Services take the data as an argument, so tests can run against other price lists.
import { loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import type { CoefficientTable, PriceList, VatRates } from '@/data/schemas';
import { ApiError } from './api-response';

export type PricingData = {
  priceLists: PriceList[];
  table: CoefficientTable;
  vatRates: VatRates;
};

export async function loadPricingData(): Promise<PricingData> {
  const [priceLists, table, vatRates] = await Promise.all([
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);
  return { priceLists, table, vatRates };
}

/** Every structured reason → HTTP status and English fallback. The UI translates by `code`. */
const REFUSALS: Record<string, { status: number; message: string }> = {
  unknown_asset: { status: 404, message: 'This item does not exist or has no price' },
  quote_not_found: { status: 404, message: 'This quote does not exist' },
  contract_not_found: { status: 404, message: 'This contract does not exist' },
  no_price_list_on_date: { status: 422, message: 'No price list applies on this date' },
  no_vat_rate_on_date: { status: 422, message: 'No VAT rate applies on this date' },
  below_minimum: { status: 422, message: 'The financed amount is below the 300 € minimum' },
  above_maximum: { status: 422, message: 'The financed amount is above the 250,000 € maximum' },
  unknown_term: { status: 422, message: 'This lease term is not offered' },
  down_payment_exceeds_price: { status: 422, message: 'The down payment is above the price' },
  signed_before_quote: { status: 422, message: 'A contract cannot be signed before its quote' },
  start_before_signing: { status: 422, message: 'A lease cannot start before it is signed' },
  asset_unavailable: { status: 409, message: 'This item is not available for leasing' },
  quote_already_signed: { status: 409, message: 'This quote has already been signed' },
  price_changed: { status: 409, message: 'The price changed since the quote. Please confirm it' },
};

/** The error for a refused result, e.g. `below_minimum` → 422 BELOW_MINIMUM. */
export function refusal(reason: string, details?: unknown): ApiError {
  const known = REFUSALS[reason];
  if (!known) throw new Error(`no refusal defined for "${reason}"`);
  return new ApiError(known.status, reason.toUpperCase(), known.message, details);
}
