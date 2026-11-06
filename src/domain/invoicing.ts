// The invoice schedule of a locked contract. The net amounts are fixed at signing; VAT is
// taken from the rate valid on each due date (docs/DECISIONS.md). Billing is in advance:
// invoice N is due on start + (N-1) months, day-of-month anchored and clamped.
import type { VatRates } from '@/data/schemas';
import { addMonthsClamped, previousDay } from './calendar';
import { vatCents, vatRateOn } from './vat';

export type InvoiceLine = {
  /** 1-based position in the schedule. */
  number: number;
  dueDate: string;
  periodStart: string;
  /** Inclusive: a lease started on the 5th has periods ending on the 4th. */
  periodEnd: string;
  netCents: number;
  vatRatePercent: number;
  vatCents: number;
  totalCents: number;
  /** True when the VAT rate differs from the previous invoice: the UI shows the banner here. */
  vatRateChanged: boolean;
};

export type ScheduleResult =
  { ok: true; invoices: InvoiceLine[] } | { ok: false; reason: 'no_vat_rate_on_date' };

/**
 * All invoices of a contract. `netTotalCents` comes from the quote; the last invoice absorbs
 * the leftover cents, so the nets add up to it exactly.
 */
export function scheduleInvoices(
  contract: {
    startDate: string;
    termMonths: number;
    monthlyNetRentCents: number;
    netTotalCents: number;
  },
  vatRates: VatRates
): ScheduleResult {
  const { startDate, termMonths, monthlyNetRentCents, netTotalCents } = contract;
  if (!Number.isInteger(termMonths) || termMonths < 1) {
    throw new RangeError(`termMonths must be a positive integer, got ${termMonths}`);
  }

  const invoices: InvoiceLine[] = [];
  let previousRatePercent: number | undefined;
  for (let n = 1; n <= termMonths; n++) {
    const dueDate = addMonthsClamped(startDate, n - 1);
    const rate = vatRateOn(vatRates, dueDate);
    if (!rate.ok) return { ok: false, reason: rate.reason };

    const netCents =
      n === termMonths
        ? netTotalCents - monthlyNetRentCents * (termMonths - 1)
        : monthlyNetRentCents;
    const vat = vatCents(netCents, rate.rateBasisPoints);
    invoices.push({
      number: n,
      dueDate,
      periodStart: dueDate,
      periodEnd: previousDay(addMonthsClamped(startDate, n)),
      netCents,
      vatRatePercent: rate.ratePercent,
      vatCents: vat,
      totalCents: netCents + vat,
      vatRateChanged: previousRatePercent !== undefined && rate.ratePercent !== previousRatePercent,
    });
    previousRatePercent = rate.ratePercent;
  }
  return { ok: true, invoices };
}

/**
 * The day an invoice is issued. A lease month is billed in advance: the invoice goes out on
 * its due date, the first day of the period it covers. One-off invoices (buyout, early
 * exit) give 30 days to pay, so they were issued 30 days before they are due.
 */
export function invoiceIssueDate(invoice: { type: string; due_date: string }): string {
  if (invoice.type === 'lease') return invoice.due_date;
  let day = invoice.due_date;
  for (let i = 0; i < 30; i++) day = previousDay(day);
  return day;
}

/**
 * A Finnish payment reference (viitenumero) for the demo's fake payment details: the check
 * digit weighs the base digits 7, 3, 1 from the right (10 minus the sum's last digit).
 */
export function paymentReference(base: number): string {
  const digits = String(base);
  const weights = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    sum += Number(digits[digits.length - 1 - i]) * weights[i % 3]!;
  }
  return digits + String((10 - (sum % 10)) % 10);
}
