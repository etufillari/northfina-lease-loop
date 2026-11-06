import type { Asset, CoefficientTable, PriceList, VatRates } from '@/data/schemas';
import { listPriceOn } from './price-list';
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
  vatPreview: {
    invoiceDate: string;
    ratePercent: number;
    monthlyNetRentCents: number;
    monthlyVatCents: number;
    monthlyGrossRentCents: number;
  };
  sources: {
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
        | 'no_vat_rate_on_date';
      status?: Asset['status'];
    };

/**
 * Builds a read-only quote from the current asset and the supplied data pack.
 * All money remains in integer cents; pricing and VAT retain their own rounding rules.
 */
export function quoteFor(
  asset: Asset,
  priceLists: readonly PriceList[],
  coefficientTable: CoefficientTable,
  vatRates: VatRates,
  input: QuoteInput
): QuoteResult {
  if (asset.status !== 'available') {
    return { ok: false, reason: 'asset_unavailable', status: asset.status };
  }

  const listPrice = listPriceOn(priceLists, input.assetId, input.date);
  if (!listPrice.ok) return listPrice;

  const pricing = leasePriceFor(
    coefficientTable,
    listPrice.priceCents,
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
      vatPreview: {
        invoiceDate: input.date,
        ratePercent: vat.ratePercent,
        monthlyNetRentCents: vat.netAmountCents,
        monthlyVatCents: vat.vatCents,
        monthlyGrossRentCents: vat.grossCents,
      },
      sources: {
        priceListVersion: listPrice.priceListVersion,
        coefficientTableId: coefficientTable.id,
        coefficientTableVersion: coefficientTable.version,
      },
    },
  };
}
