// Smart Problem 1 / scenario card 3: when VAT changes between two monthly payments, say exactly
// what changed. The net rent is locked in the contract, so the whole difference is VAT.
// Pure: both payments and the VAT table are arguments.
import type { VatRate } from '@/data/schemas';

type Payment = { dueDate: string; netCents: number; vatBasisPoints: number; totalCents: number };

export type VatChange = {
  fromBasisPoints: number;
  toBasisPoints: number;
  /** The new monthly total minus the previous one, in cents. */
  differenceCents: number;
  netCents: number;
  /** The new rate is a made-up hackathon rate (marked in the data pack). */
  fictional: boolean;
};

/** The VAT change from one payment to the next, or null when the rate is the same. */
export function vatChange(
  previous: Payment | undefined,
  next: Payment,
  rates: readonly VatRate[]
): VatChange | null {
  if (!previous || previous.vatBasisPoints === next.vatBasisPoints) return null;
  const rate = rates.find(
    (item) =>
      item.valid_from <= next.dueDate && (item.valid_to === null || item.valid_to >= next.dueDate)
  );
  return {
    fromBasisPoints: previous.vatBasisPoints,
    toBasisPoints: next.vatBasisPoints,
    differenceCents: next.totalCents - previous.totalCents,
    netCents: next.netCents,
    fictional: rate?.fictional === true,
  };
}
