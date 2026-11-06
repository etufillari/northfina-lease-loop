import type { LeaseTerms } from './lease-engine/types';

export type SignedContract = Readonly<{
  id: string;
  customerId: string;
  assetId: string;
  startDate: string;
  termMonths: number;
  monthlyNetCents: number;
  paymentDueDays: number;
}>;

const TERM_MONTHS = new Set([12, 24, 36, 48]);

export function toLeaseTerms(contract: SignedContract): LeaseTerms {
  if (!TERM_MONTHS.has(contract.termMonths)) {
    throw new RangeError(`Unsupported lease term: ${contract.termMonths}`);
  }
  if (
    !Number.isInteger(contract.monthlyNetCents) ||
    contract.monthlyNetCents <= 0 ||
    !Number.isInteger(contract.paymentDueDays) ||
    contract.paymentDueDays < 0 ||
    contract.paymentDueDays > 60
  ) {
    throw new RangeError('Signed contract contains invalid payment terms');
  }
  return {
    contractId: contract.id,
    assetId: contract.assetId,
    customerId: contract.customerId,
    startDate: contract.startDate,
    termMonths: contract.termMonths as LeaseTerms['termMonths'],
    monthlyNetCents: contract.monthlyNetCents,
    paymentDueDays: contract.paymentDueDays,
  };
}
