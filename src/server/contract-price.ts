// The net list price a signed contract is priced from. A contract signed under a longer-term
// offer (identified by the reservation `token`) keeps the list price locked in that offer;
// otherwise it is the catalogue price on the signing day.
//
// The invoices page and the early-exit route both call this, so the price a customer is shown
// and the price the server charges always come from the same contract.
import type { PriceList } from '@/data/schemas';
import {
  contractListPrice,
  effectiveAssetPriceOn,
  type ListPriceResult,
  listPriceOn,
} from '@/domain/price-list';
import type { PrismaClient } from './prisma-client';

export type ContractPrice = {
  /** The price the contract is priced from. */
  price: ListPriceResult;
  /** The catalogue price on the signing day, for showing the offer's price protection. */
  catalogue: ListPriceResult;
  /** The day the offer was made, when the contract was signed under one. */
  offeredOn: string | null;
  /** The locked offer price, when the token matches an offer for this asset. */
  offer: { priceCents: number; priceListVersion: number } | null;
};

export async function loadContractPrice(
  db: PrismaClient,
  input: {
    assetId: string;
    asset?: { id: string; relist_price_cents?: number | null };
    signedOn: string;
    termMonths: number;
    downPaymentCents: number;
    token?: string;
    priceLists: readonly PriceList[];
  }
): Promise<ContractPrice> {
  // Only a signed offer (status `completed`) locks a price, and only for the terms it was
  // made on: the token is in the URL, so a released or expired offer, or the same token sent
  // with other terms, must fall back to the catalogue price.
  const found = input.token
    ? await db.assetReservation.findFirst({
        where: {
          token: input.token,
          asset_id: input.assetId,
          reservation_type: 'offer',
          status: 'completed',
        },
      })
    : null;
  const reservation =
    found &&
    found.term_months === input.termMonths &&
    found.down_payment_cents === input.downPaymentCents
      ? found
      : null;
  const offer =
    reservation && reservation.list_price_cents !== null && reservation.price_list_version !== null
      ? {
          priceCents: reservation.list_price_cents,
          priceListVersion: reservation.price_list_version,
        }
      : null;
  const catalogue = input.asset
    ? effectiveAssetPriceOn(input.priceLists, input.asset, input.signedOn)
    : listPriceOn(input.priceLists, input.assetId, input.signedOn);

  return {
    price: contractListPrice({ offer, catalogue }),
    catalogue,
    offeredOn: reservation?.offered_on ?? null,
    offer,
  };
}
