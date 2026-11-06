import type { VatRate } from '@/data/schemas';
import type { LeaseTerms } from '@/domain/lease-engine/types';
import { anniversary } from '@/domain/lease-engine/calendar';
import { resolveVat } from '@/domain/lease-engine/invoice';
import { earlyReturnNet } from './exit';
import { roundRatio } from './money';

/** Same signed cap and tax/date rules used by the settlement command. No payments implied. */
export function calculateExitQuote(
  terms: LeaseTerms,
  buyoutNetCents: number,
  elapsedMonths: number,
  rates: readonly VatRate[]
) {
  if (!Number.isInteger(elapsedMonths) || elapsedMonths < 1 || elapsedMonths >= terms.termMonths)
    throw new RangeError('Exit must be inside the lease term');
  const date = anniversary(terms.startDate, elapsedMonths);
  if (!date.ok) throw new RangeError('Invalid exit date');
  const tax = resolveVat(rates, date.value);
  if (!tax.ok) throw new RangeError('Invalid exit tax configuration');
  const fee = earlyReturnNet(
    terms.monthlyNetCents,
    terms.termMonths,
    elapsedMonths,
    buyoutNetCents
  );
  const vatCents = roundRatio(BigInt(fee.feeNetCents) * BigInt(tax.value.rateBps), 10000n);
  const grossCents = fee.feeNetCents + vatCents;
  if (!Number.isSafeInteger(grossCents)) throw new RangeError('Exit overflow');
  return {
    ...fee,
    elapsedMonths,
    remainingMonths: terms.termMonths - elapsedMonths,
    monthlyNetCents: terms.monthlyNetCents,
    effectiveOn: date.value,
    vatCents,
    grossCents,
    rateBps: tax.value.rateBps,
  };
}
