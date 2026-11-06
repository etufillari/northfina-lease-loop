// VAT: which rate applies on a day. Compute the VAT itself with percentOfCents (money.ts),
// so every amount in the app follows the same rounding rule.
import type { VatRates } from '@/data/schemas';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The VAT rate in percent (e.g. 25.5) on `isoDate`, or `null` if no rate covers that day.
 * Both ends of a rate's validity are inclusive; `valid_to: null` means "still valid".
 */
export function vatPercentOn(vatRates: VatRates, isoDate: string): number | null {
  if (!ISO_DATE.test(isoDate)) {
    throw new RangeError(`isoDate must look like YYYY-MM-DD, got "${isoDate}"`);
  }
  const rate = vatRates.rates.find(
    (r) => r.valid_from <= isoDate && (r.valid_to === null || isoDate <= r.valid_to)
  );
  return rate ? rate.rate_percent : null;
}

export type VatChangeInput = { validFrom: string; ratePercent: number };

/** The day before an ISO date, with no clock involved. */
function dayBefore(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

/**
 * The data pack's VAT rates with the admin's changes laid on top. Every rate (from the data
 * pack or the admin) applies from its start date until the next one starts; an admin change on
 * the same date as a data pack rate replaces it. The result is one gap-free list again, so
 * vatPercentOn works on it unchanged.
 */
export function mergeVatRates(base: VatRates, changes: readonly VatChangeInput[]): VatRates {
  if (changes.length === 0) return base;
  const starts = new Map<string, { ratePercent: number; fictional: boolean; admin: boolean }>();
  for (const rate of base.rates) {
    starts.set(rate.valid_from, {
      ratePercent: rate.rate_percent,
      fictional: rate.fictional ?? false,
      admin: false,
    });
  }
  for (const change of changes) {
    starts.set(change.validFrom, { ratePercent: change.ratePercent, fictional: true, admin: true });
  }
  const sorted = [...starts.entries()].sort(([a], [b]) => a.localeCompare(b));
  // Keep the data pack's end date for the last base rate if it had one and nothing follows.
  const lastBase = [...base.rates].sort((a, b) => a.valid_from.localeCompare(b.valid_from)).at(-1);
  return {
    ...base,
    rates: sorted.map(([validFrom, rate], index) => {
      const next = sorted[index + 1];
      const validTo = next
        ? dayBefore(next[0])
        : !rate.admin && lastBase?.valid_from === validFrom
          ? lastBase.valid_to
          : null;
      return {
        rate_percent: rate.ratePercent,
        valid_from: validFrom,
        valid_to: validTo,
        ...(rate.fictional ? { fictional: true } : {}),
      };
    }),
  };
}
