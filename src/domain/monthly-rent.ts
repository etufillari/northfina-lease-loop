import type { CoefficientTable } from '@/data/schemas';
import { monthlyFactorFor } from './coefficient';

export const MAX_DOWN_PAYMENT_CENTS = 50_000_000;
export const LEASE_TERM_MONTHS = [0, 12, 24, 36, 48] as const;

export type MonthlyRentResult =
  | { ok: true; monthlyRentCents: number }
  | {
      ok: false;
      reason: 'no_list_price' | 'below_minimum' | 'above_maximum' | 'unknown_term';
    };

export function canStartLease(
  listPriceCents: number | undefined,
  downPaymentCents: number | undefined,
  termMonths: number
): boolean {
  if (listPriceCents === undefined || downPaymentCents === undefined) return false;
  return termMonths > 0 || downPaymentCents >= listPriceCents;
}

export function parseDownPaymentCents(value: string): number | undefined {
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(value)) return undefined;

  const [whole = '0', fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return cents <= MAX_DOWN_PAYMENT_CENTS ? cents : undefined;
}

export function monthlyRentFor(
  table: CoefficientTable,
  listPriceCents: number | undefined,
  downPaymentCents: number,
  termMonths: number
): MonthlyRentResult {
  if (!Number.isInteger(downPaymentCents)) {
    throw new RangeError(`downPaymentCents must be whole cents, got ${downPaymentCents}`);
  }
  if (downPaymentCents < 0) {
    throw new RangeError(`downPaymentCents cannot be negative, got ${downPaymentCents}`);
  }
  if (listPriceCents !== undefined && !Number.isInteger(listPriceCents)) {
    throw new RangeError(`listPriceCents must be whole cents, got ${listPriceCents}`);
  }
  if (listPriceCents !== undefined && listPriceCents < 0) {
    throw new RangeError(`listPriceCents cannot be negative, got ${listPriceCents}`);
  }
  if (!Number.isInteger(termMonths)) {
    return { ok: false, reason: 'unknown_term' };
  }
  if (listPriceCents === undefined) return { ok: false, reason: 'no_list_price' };

  const financedCents = Math.max(0, listPriceCents - downPaymentCents);
  if (termMonths === 0 || financedCents === 0) {
    return { ok: true, monthlyRentCents: 0 };
  }

  const result = monthlyFactorFor(table, financedCents, termMonths);
  if (!result.ok) return result;

  // Round the calculated net monthly rent once to the nearest euro cent.
  return { ok: true, monthlyRentCents: Math.round(financedCents * result.factor) };
}
