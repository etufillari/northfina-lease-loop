import type { Asset, CoefficientTable, PriceList, ResidualCurves, VatRates } from '@/data/schemas';
import type { UsedItemValuation } from '../second-life/used-item-value';
import { itemPriceOn, type PriceBasis } from './item-price';
import { leasePriceFor } from './pricing';
import { vatOn } from './vat';

export type QuoteInput = {
  assetId: string;
  date: string;
  downPaymentCents: number;
  termMonths: number;
};

export type QuoteData = {
  asset: {
    id: string;
    status: 'available';
  };
  pricing: {
    netListPriceCents: number;
    downPaymentCents: number;
    financedCents: number;
    termMonths: number;
    coefficientBand: string;
    annualInterestBasisPoints: number;
    monthlyFactor: number;
    monthlyNetRentCents: number;
    buyoutPercent: number;
    endOfTermBuyoutCents: number;
    totalCostWithBuyoutCents: number;
  };
  /** How a used item's price was reached; `null` for a new item at list price. */
  valuation: UsedItemValuation | null;
  vatPreview: {
    invoiceDate: string;
    ratePercent: number;
    monthlyNetRentCents: number;
    monthlyVatCents: number;
    monthlyGrossRentCents: number;
  };
  sources: {
    priceBasis: PriceBasis;
    priceListVersion: number;
    coefficientTableId: string;
    coefficientTableVersion: number;
  };
};

export type QuoteResult =
  | { ok: true; quote: QuoteData }
  | {
      ok: false;
      reason:
        | 'asset_unavailable'
        | 'no_price_list_on_date'
        | 'unknown_asset'
        | 'down_payment_exceeds_list_price'
        | 'below_minimum'
        | 'above_maximum'
        | 'unknown_term'
        | 'no_vat_rate_on_date'
        | 'original_price_not_found'
        | 'invalid_lifecycle_dates'
        | 'residual_value_unavailable';
      status?: Asset['status'];
    };

/**
 * Builds a read-only quote from the current asset and the supplied data pack.
 * A new item is priced from its list price, a used item from its market value.
 * All money remains in integer cents; pricing and VAT retain their own rounding rules.
 */
export function quoteFor(
  asset: Asset,
  priceLists: readonly PriceList[],
  residualCurves: ResidualCurves,
  coefficientTable: CoefficientTable,
  vatRates: VatRates,
  input: QuoteInput
): QuoteResult {
  if (asset.status !== 'available') {
    return { ok: false, reason: 'asset_unavailable', status: asset.status };
  }

  const itemPrice = itemPriceOn(asset, priceLists, residualCurves, input.date);
  if (!itemPrice.ok) return itemPrice;

  const pricing = leasePriceFor(
    coefficientTable,
    itemPrice.priceCents,
    input.downPaymentCents,
    input.termMonths
  );
  if (!pricing.ok) return pricing;

  const vat = vatOn(vatRates, pricing.monthlyNetRentCents, input.date);
  if (!vat.ok) return { ok: false, reason: 'no_vat_rate_on_date' };

  return {
    ok: true,
    quote: {
      asset: { id: asset.id, status: asset.status },
      pricing: {
        netListPriceCents: pricing.netListPriceCents,
        downPaymentCents: pricing.downPaymentCents,
        financedCents: pricing.financedCents,
        termMonths: pricing.termMonths,
        coefficientBand: pricing.band.band,
        annualInterestBasisPoints: Math.round(pricing.band.annual_interest_percent * 100),
        monthlyFactor: pricing.factor,
        monthlyNetRentCents: pricing.monthlyNetRentCents,
        buyoutPercent: pricing.buyoutPercent,
        endOfTermBuyoutCents: pricing.endOfTermBuyoutCents,
        totalCostWithBuyoutCents: pricing.totalCostWithBuyoutCents,
      },
      valuation: itemPrice.valuation,
      vatPreview: {
        invoiceDate: input.date,
        ratePercent: vat.ratePercent,
        monthlyNetRentCents: vat.netAmountCents,
        monthlyVatCents: vat.vatCents,
        monthlyGrossRentCents: vat.grossCents,
      },
      sources: {
        priceBasis: itemPrice.basis,
        priceListVersion: itemPrice.priceListVersion,
        coefficientTableId: coefficientTable.id,
        coefficientTableVersion: coefficientTable.version,
      },
    },
  };
}
