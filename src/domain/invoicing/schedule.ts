// The invoice schedule of a contract (decisions D2–D5). Pure: the VAT rates come in as data.
//
// - D5: invoice 0 is the down payment, issued and due on the signing day. A zero down payment
//   gives no invoice 0: a 0,00 € invoice is noise to the customer and the sum invariants hold
//   either way.
// - D3/D4: invoice n (1 … term) is the rent for the full month from start + (n − 1) months to
//   the day before start + n months, both with the day of month clamped. It is billed in
//   advance: issued and due on its period's first day.
// - D2: each invoice takes the VAT rate in force on its issue date, never the signing rate.
//   The net is the locked monthly net rent; VAT is rounded per invoice line (D1, `splitVat`).
import type { VatRates } from '@/data/schemas';
import type { InvoiceKind } from '../statuses';
import { splitVat } from '../money-math';
import { vatRateOn } from '../vat';
import { addDays, addMonthsClamped, parseIsoDate } from './dates';

export const DOWN_PAYMENT_SEQUENCE = 0;

export type ScheduledInvoice = {
  sequence: number;
  kind: Extract<InvoiceKind, 'down_payment' | 'rent'>;
  /** Null for the down payment: it is not for a period. */
  periodStart: string | null;
  periodEnd: string | null;
  issueDate: string;
  dueDate: string;
  netCents: number;
  vatRateBasisPoints: number;
  vatCents: number;
  grossCents: number;
};

export type ScheduleInput = {
  signedOn: string;
  startDate: string;
  termMonths: number;
  downPaymentCents: number;
  monthlyNetCents: number;
  vatRates: VatRates;
};

export type ScheduleResult =
  | { ok: true; invoices: ScheduledInvoice[] }
  | { ok: false; reason: 'no_vat_rate_on_date'; date: string };

export type ScheduleTotals = { netCents: number; vatCents: number; grossCents: number };

function assertCents(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be whole non-negative cents, got ${value}`);
  }
}

/** The billing period of rent invoice `sequence` (1-based). */
export function rentPeriod(
  startDate: string,
  sequence: number
): { periodStart: string; periodEnd: string } {
  return {
    periodStart: addMonthsClamped(startDate, sequence - 1),
    periodEnd: addDays(addMonthsClamped(startDate, sequence), -1),
  };
}

/**
 * Builds the whole schedule at signing. A day with no VAT rate in the table is an answer
 * (`no_vat_rate_on_date`, with the day), not a crash; malformed input is a bug and throws.
 */
export function buildSchedule(input: ScheduleInput): ScheduleResult {
  const { signedOn, startDate, termMonths, downPaymentCents, monthlyNetCents, vatRates } = input;
  parseIsoDate(signedOn);
  parseIsoDate(startDate);
  if (!Number.isSafeInteger(termMonths) || termMonths < 1) {
    throw new RangeError(`termMonths must be a positive integer, got ${termMonths}`);
  }
  assertCents('downPaymentCents', downPaymentCents);
  assertCents('monthlyNetCents', monthlyNetCents);

  const invoices: ScheduledInvoice[] = [];
  const line = (
    sequence: number,
    kind: ScheduledInvoice['kind'],
    issueDate: string,
    netCents: number,
    period: { periodStart: string | null; periodEnd: string | null }
  ): string | null => {
    const rate = vatRateOn(vatRates, issueDate);
    if (!rate.ok) return issueDate;
    const split = splitVat(netCents, rate.rateBasisPoints);
    invoices.push({
      sequence,
      kind,
      ...period,
      issueDate,
      dueDate: issueDate,
      netCents: split.netCents,
      vatRateBasisPoints: rate.rateBasisPoints,
      vatCents: split.vatCents,
      grossCents: split.grossCents,
    });
    return null;
  };

  if (downPaymentCents > 0) {
    const missing = line(DOWN_PAYMENT_SEQUENCE, 'down_payment', signedOn, downPaymentCents, {
      periodStart: null,
      periodEnd: null,
    });
    if (missing) return { ok: false, reason: 'no_vat_rate_on_date', date: missing };
  }
  for (let sequence = 1; sequence <= termMonths; sequence += 1) {
    const period = rentPeriod(startDate, sequence);
    const missing = line(sequence, 'rent', period.periodStart, monthlyNetCents, period);
    if (missing) return { ok: false, reason: 'no_vat_rate_on_date', date: missing };
  }
  return { ok: true, invoices };
}

/** Sums net, VAT and gross over the given invoices. */
export function scheduleTotals(invoices: readonly ScheduleTotals[]): ScheduleTotals {
  return invoices.reduce<ScheduleTotals>(
    (sum, invoice) => ({
      netCents: sum.netCents + invoice.netCents,
      vatCents: sum.vatCents + invoice.vatCents,
      grossCents: sum.grossCents + invoice.grossCents,
    }),
    { netCents: 0, vatCents: 0, grossCents: 0 }
  );
}

/** True when two neighbouring invoices carry different VAT rates: the page explains why. */
export function hasVatRateChange(invoices: readonly { vatRateBasisPoints: number }[]): boolean {
  return new Set(invoices.map((invoice) => invoice.vatRateBasisPoints)).size > 1;
}

export type VatChange = {
  oldRateBasisPoints: number;
  newRateBasisPoints: number;
  /** The last day the old rate is in force. */
  lastOldDay: string;
  /** The day the new rate takes effect, from the rates table (not the invoice day). */
  firstNewDay: string;
};

/**
 * The first VAT rate change between neighbouring invoices, with the days it happens on, for
 * the explanation under the invoice table; null when every invoice has the same rate.
 */
export function firstVatChange(
  invoices: readonly { issueDate: string; vatRateBasisPoints: number }[],
  vatRates: VatRates
): VatChange | null {
  for (let index = 1; index < invoices.length; index += 1) {
    const previous = invoices[index - 1];
    const current = invoices[index];
    if (!previous || !current || previous.vatRateBasisPoints === current.vatRateBasisPoints) {
      continue;
    }
    const rate = vatRateOn(vatRates, current.issueDate);
    const firstNewDay = rate.ok ? rate.validFrom : current.issueDate;
    return {
      oldRateBasisPoints: previous.vatRateBasisPoints,
      newRateBasisPoints: current.vatRateBasisPoints,
      lastOldDay: addDays(firstNewDay, -1),
      firstNewDay,
    };
  }
  return null;
}
