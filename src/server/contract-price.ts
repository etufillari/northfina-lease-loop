// The net list price a signed contract is priced from. A contract signed under a longer-term
// offer (identified by the reservation `token`) keeps the list price locked in that offer;
// otherwise it is the catalogue price on the signing day.
//
// The invoices page and the early-exit route both call this, so the price a customer is shown
// and the price the server charges always come from the same contract.
import type { PriceList } from '@/data/schemas';
import { contractListPrice, type ListPriceResult, listPriceOn } from '@/domain/price-list';
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
    signedOn: string;
    token?: string;
    priceLists: readonly PriceList[];
  }
): Promise<ContractPrice> {
  const reservation = input.token
    ? await db.assetReservation.findFirst({
        where: { token: input.token, asset_id: input.assetId, reservation_type: 'offer' },
      })
    : null;
  const offer =
    reservation && reservation.list_price_cents !== null && reservation.price_list_version !== null
      ? {
          priceCents: reservation.list_price_cents,
          priceListVersion: reservation.price_list_version,
        }
      : null;
  const catalogue = listPriceOn(input.priceLists, input.assetId, input.signedOn);

  return {
    price: contractListPrice({ offer, catalogue }),
    catalogue,
    offeredOn: reservation?.offered_on ?? null,
    offer,
  };
}
