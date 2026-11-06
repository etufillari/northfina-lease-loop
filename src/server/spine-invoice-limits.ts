import { ApiError } from './api-response';

/** Prisma Int columns are signed 32-bit, even when JavaScript can hold a larger integer. */
export function requireStorableInvoice(amount: {
  netCents: number;
  vatBasisPoints: number;
  vatCents: number;
  grossCents: number;
}): void {
  if (
    [amount.netCents, amount.vatBasisPoints, amount.vatCents, amount.grossCents].some(
      (value) => !Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647
    )
  ) {
    throw new ApiError(
      422,
      'AMOUNT_TOO_LARGE',
      'The invoice amount exceeds the supported storage range'
    );
  }
}
