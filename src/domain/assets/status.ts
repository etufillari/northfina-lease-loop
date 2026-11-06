// Which asset statuses a person may set by hand. `leased` and `sold` follow from a contract,
// so they only change through signing and end of term: otherwise a leased item could be set
// back to available and leased twice.
import type { Asset, AssetStatus } from '@/data/schemas';

const SET_BY_CONTRACTS: readonly AssetStatus[] = ['leased', 'sold'];

export function canChangeStatusByHand(from: AssetStatus, to: AssetStatus): boolean {
  return !SET_BY_CONTRACTS.includes(from) && !SET_BY_CONTRACTS.includes(to);
}

/** True when the item is held for a customer other than this one, or for anyone at all. */
export function isHeldForSomeoneElse(
  reservedFor: string | null | undefined,
  customerId: string | undefined
): boolean {
  return reservedFor !== null && reservedFor !== undefined && reservedFor !== customerId;
}

/**
 * An asset as one viewer may see it. A held item reads as reserved for everyone else, and the
 * person it is held for sees it as available. Who it is held for stays private either way.
 */
export function assetForViewer(asset: Asset, customerId: string | undefined): Asset {
  const { reserved_for: reservedFor, ...visible } = asset;
  return isHeldForSomeoneElse(reservedFor, customerId) && asset.status === 'available'
    ? { ...visible, status: 'reserved' }
    : visible;
}
