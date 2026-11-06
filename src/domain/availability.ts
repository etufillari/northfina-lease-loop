import type { AssetStatus } from '@/data/schemas';

/** Inventory and offer availability only; eligibility and pricing are checked separately. */
export function isAvailableForCustomer(input: {
  status: AssetStatus;
  offerReady: boolean;
  reservedForCustomerId: string | null;
  customerId: string;
}): boolean {
  return (
    input.status === 'available' &&
    input.offerReady &&
    (input.reservedForCustomerId === null || input.reservedForCustomerId === input.customerId)
  );
}
