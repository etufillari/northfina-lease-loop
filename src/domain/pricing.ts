import type { CoefficientTable } from '@/data/schemas';
import { monthlyFactorFor } from './coefficient';

export const MAX_LEASE_TERM_MONTHS = 60;

/** Net quote only. Round monthly rent once to the nearest cent, halves upwards. */
export function quoteLease(
  table: CoefficientTable,
  priceCents: number,
  downPaymentCents: number,
  termMonths: number
) {
  if (!Number.isSafeInteger(priceCents) || !Number.isSafeInteger(downPaymentCents)) {
    throw new RangeError('Money must be safe integer cents');
  }
  if (priceCents < 0 || downPaymentCents < 0 || downPaymentCents > priceCents) {
    return { ok: false, reason: 'invalid_down_payment' } as const;
  }
  if (termMonths > MAX_LEASE_TERM_MONTHS) {
    return { ok: false, reason: 'unknown_term' } as const;
  }
  const financedCents = priceCents - downPaymentCents;
  const result = monthlyFactorFor(table, financedCents, termMonths);
  if (!result.ok) return result;
  return {
    ok: true,
    financedCents,
    monthlyNetCents: Math.round(financedCents * result.factor),
  } as const;
}
