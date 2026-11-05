// The monthly invoices for a contract. This is the only place that decides invoice dates and
// periods: early exit, end of term and the UI ask the schedule instead of doing date maths.
import type { VatRates } from '@/data/schemas';
import { addDays, addMonthsClamped } from './calendar';
import { vatRateOn, withVat, type VatBreakdown } from './vat';

/**
 * How a contract is billed, frozen at signing like its price (D-016).
 * - `start_day_full_months`: in advance, on the start day each month (clamped to the month's
 *   last day), every invoice a full month at the same net rent.
 */
export type BillingRule = 'start_day_full_months';

/** What the schedule needs from a contract. */
export interface BilledContract {
  startDate: string;
  termMonths: number;
  monthlyNetRentCents: number;
  billing: BillingRule;
}

export interface Invoice extends VatBreakdown {
  /** 1 for the first month of the lease. */
  number: number;
  /** Also the due date. VAT is charged at the rate valid on this date (D-011). */
  invoiceDate: string;
  periodStart: string;
  /** Last day covered, inclusive. */
  periodEnd: string;
  vatRatePercent: number;
}

export type ScheduleResult =
  | { ok: true; invoices: Invoice[]; totals: VatBreakdown }
  | { ok: false; reason: 'no_vat_rate'; invoiceDate: string };

export function invoiceSchedule(contract: BilledContract, vatRates: VatRates): ScheduleResult {
  switch (contract.billing) {
    case 'start_day_full_months':
      return startDayFullMonths(contract, vatRates);
  }
}

function startDayFullMonths(contract: BilledContract, vatRates: VatRates): ScheduleResult {
  const invoices: Invoice[] = [];
  for (let month = 0; month < contract.termMonths; month++) {
    // Count every date from the start, never from the previous invoice, so a 31st never drifts.
    const periodStart = addMonthsClamped(contract.startDate, month);
    const periodEnd = addDays(addMonthsClamped(contract.startDate, month + 1), -1);
    const vat = vatRateOn(vatRates, periodStart);
    if (!vat.ok) return { ok: false, reason: 'no_vat_rate', invoiceDate: periodStart };

    invoices.push({
      number: month + 1,
      invoiceDate: periodStart,
      periodStart,
      periodEnd,
      vatRatePercent: vat.ratePercent,
      ...withVat(contract.monthlyNetRentCents, vat.ratePercent),
    });
  }
  return { ok: true, invoices, totals: sumInvoices(invoices) };
}

/** Totals are sums of the rounded invoices, so they always match what the customer paid. */
function sumInvoices(invoices: readonly Invoice[]): VatBreakdown {
  return invoices.reduce(
    (total, i) => ({
      netCents: total.netCents + i.netCents,
      vatCents: total.vatCents + i.vatCents,
      grossCents: total.grossCents + i.grossCents,
    }),
    { netCents: 0, vatCents: 0, grossCents: 0 }
  );
}
