// The monthly invoices for a contract. This is the only place that decides invoice dates and
// periods: early exit, end of term and the UI ask the schedule instead of doing date maths.
import type { VatRates } from '@/data/schemas';
import { addDays, addMonthsClamped } from './calendar';
import { vatRateOn, vatRateValidFrom, withVat, type VatBreakdown } from './vat';

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

/** What the invoices need: the billing terms plus the down payment. */
export interface InvoicedContract extends BilledContract {
  /** Net, billed on the start date as invoice 0 (D-037). 0 means no invoice 0. */
  downPaymentCents: number;
}

export interface Invoice extends VatBreakdown {
  /** 1 for the first month of the lease; 0 for the down payment. */
  number: number;
  /** Also the due date. VAT is charged at the rate valid on this date (D-011). */
  invoiceDate: string;
  periodStart: string;
  /** Last day covered, inclusive. */
  periodEnd: string;
  vatRatePercent: number;
}

export type ScheduleResult =
  | {
      ok: true;
      /** Invoice 0: the down payment, dated the start date, covering the whole term. */
      downPayment: Invoice | null;
      /** The monthly rents, numbered 1…term. */
      invoices: Invoice[];
      /** Down payment + rents: equals the contract's `totalNetCostCents` net. */
      totals: VatBreakdown;
    }
  | { ok: false; reason: 'no_vat_rate'; invoiceDate: string };

export function invoiceSchedule(contract: InvoicedContract, vatRates: VatRates): ScheduleResult {
  switch (contract.billing) {
    case 'start_day_full_months':
      return startDayFullMonths(contract, vatRates);
  }
}

function startDayFullMonths(contract: InvoicedContract, vatRates: VatRates): ScheduleResult {
  const down = downPaymentInvoice(contract, vatRates);
  if (down === 'no_vat_rate') {
    return { ok: false, reason: 'no_vat_rate', invoiceDate: contract.startDate };
  }
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
  return { ok: true, downPayment: down, invoices, totals: sumInvoices(withDown(down, invoices)) };
}

/**
 * The down payment is part of the price (`totalNetCostCents`), so it is invoiced like a rent:
 * net, with VAT at the rate on the start date, the day it falls due (D-037).
 */
function downPaymentInvoice(
  contract: InvoicedContract,
  vatRates: VatRates
): Invoice | null | 'no_vat_rate' {
  if (contract.downPaymentCents === 0) return null;
  const vat = vatRateOn(vatRates, contract.startDate);
  if (!vat.ok) return 'no_vat_rate';
  return {
    number: 0,
    invoiceDate: contract.startDate,
    periodStart: contract.startDate,
    periodEnd: addDays(addMonthsClamped(contract.startDate, contract.termMonths), -1),
    vatRatePercent: vat.ratePercent,
    ...withVat(contract.downPaymentCents, vat.ratePercent),
  };
}

function withDown(down: Invoice | null, invoices: readonly Invoice[]): readonly Invoice[] {
  return down ? [down, ...invoices] : invoices;
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

export interface BilledInvoices {
  downPayment: Invoice | null;
  invoices: Invoice[];
  totals: VatBreakdown;
  /** Invoices in the schedule that are never issued because the lease ended first. */
  cancelledCount: number;
}

/**
 * The invoices a lease actually issues when it ends on `endDate` (the ending's effective date).
 * An invoice dated on or after that day is cancelled: its month is settled by the ending itself
 * (D-033). A full-term ending hands over after the last invoice, so nothing is cancelled (D-029).
 * `null` means the lease hasn't ended: every invoice is issued.
 */
export function billedBefore(
  schedule: { downPayment: Invoice | null; invoices: readonly Invoice[] },
  endDate: string | null
): BilledInvoices {
  const issued = (i: Invoice) => endDate === null || i.invoiceDate < endDate;
  const downPayment =
    schedule.downPayment && issued(schedule.downPayment) ? schedule.downPayment : null;
  const invoices = schedule.invoices.filter(issued);
  const all = withDown(schedule.downPayment, schedule.invoices);
  const billed = withDown(downPayment, invoices);
  return {
    downPayment,
    invoices,
    totals: sumInvoices(billed),
    cancelledCount: all.length - billed.length,
  };
}

/** A monthly total that changes during the term: what the customer sees before signing. */
export interface VatStep extends VatBreakdown {
  /** The day the new VAT rate starts (from `vat-rates.json`). */
  validFrom: string;
  /** The first invoice billed at it. */
  firstInvoiceDate: string;
  vatRatePercent: number;
}

/**
 * Every point in the term where the monthly invoice changes because VAT does (Smart Problem 1).
 * The net rent never changes, so a step is always a VAT step. The down payment is not a month.
 */
export function vatSteps(
  schedule: { invoices: readonly Invoice[] },
  vatRates: VatRates
): VatStep[] {
  const steps: VatStep[] = [];
  schedule.invoices.forEach((invoice, i) => {
    const previous = schedule.invoices[i - 1];
    if (!previous || previous.vatRatePercent === invoice.vatRatePercent) return;
    steps.push({
      // The schedule found a rate on this date, so it has a start.
      validFrom: vatRateValidFrom(vatRates, invoice.invoiceDate) ?? invoice.invoiceDate,
      firstInvoiceDate: invoice.invoiceDate,
      vatRatePercent: invoice.vatRatePercent,
      netCents: invoice.netCents,
      vatCents: invoice.vatCents,
      grossCents: invoice.grossCents,
    });
  });
  return steps;
}
