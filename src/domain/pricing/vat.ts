import { isoDateSchema, type VatRates } from '@/data/schemas';

export type VatResult =
  | {
      ok: true;
      netAmountCents: number;
      ratePercent: number;
      vatCents: number;
      grossCents: number;
    }
  | { ok: false; reason: 'no_rate_on_date' };

function assertNonNegativeCents(value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(
      `netAmountCents must be a non-negative whole number of cents, got ${value}`
    );
  }
}

/**
 * Calculates VAT for one net amount on one invoice date.
 *
 * VAT is rounded once to the nearest cent, with half-cent values rounded up. The date range
 * is inclusive at both ends; a null valid_to means the rate remains valid indefinitely.
 */
export function vatOn(vatRates: VatRates, netAmountCents: number, invoiceDate: string): VatResult {
  if (!isoDateSchema.safeParse(invoiceDate).success) {
    throw new RangeError(`invoiceDate must be a valid ISO date, got "${invoiceDate}"`);
  }
  assertNonNegativeCents(netAmountCents);

  const rate = vatRates.rates.find(
    (candidate) =>
      candidate.valid_from <= invoiceDate &&
      (candidate.valid_to === null || invoiceDate <= candidate.valid_to)
  );
  if (!rate) return { ok: false, reason: 'no_rate_on_date' };

  const vatCents = Math.round((netAmountCents * rate.rate_percent) / 100);

  return {
    ok: true,
    netAmountCents,
    ratePercent: rate.rate_percent,
    vatCents,
    grossCents: netAmountCents + vatCents,
  };
}
