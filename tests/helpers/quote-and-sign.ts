// Signing needs a stored quote (D-034). For tests that just need a contract: quote the lease on
// its day, then sign that quote at the price it showed.
import { signLease, type LeaseDataPack, type SignLeaseInput } from '@/server/contracts';
import type { PrismaClient } from '@/server/prisma-client';
import { createQuote } from '@/server/quotes';

export type Lease = Omit<SignLeaseInput, 'quoteId' | 'shownMonthlyNetRentCents'> & {
  assetId: string;
  termMonths: number;
  downPaymentCents: number;
};

export async function quoteAndSign(db: PrismaClient, data: LeaseDataPack, lease: Lease) {
  const { assetId, termMonths, downPaymentCents, ...signing } = lease;
  const quoted = await createQuote(db, data, {
    assetId,
    termMonths,
    downPaymentCents,
    today: signing.today,
    actor: 'customer',
  });
  if (!quoted.ok) return quoted;
  return signLease(db, data, {
    ...signing,
    quoteId: quoted.id,
    shownMonthlyNetRentCents: quoted.quote.monthlyNetRentCents,
  });
}
