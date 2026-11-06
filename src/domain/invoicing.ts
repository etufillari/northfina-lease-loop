// The invoices of a contract.
//
// THE BILLING MODEL
// - Billed monthly in advance: the first rent invoice is dated on the start date.
// - Every period is one full contract month from the start date (15 Sep–14 Oct), so a
//   mid-month start needs no partial first month and the rent never has to be split.
// - The due date is the invoice date. It does not move for weekends: the data pack has no
//   bank-holiday calendar, and a February invoice stays in February.
// - A down payment is its own invoice (sequence 0) on the start date, with VAT added, because
//   list prices and so down payments are net.
//
// WHY IT ADDS UP: the net of every invoice is a locked integer, so the invoices sum to
// `down payment + term × rent` with nothing left over. VAT is rounded per invoice, so each
// invoice can be checked by hand, and the VAT total is simply the sum of the invoices. It
// cannot be a fixed number at signing, because the rates can change during the contract.
import type { VatRates } from '@/data/schemas';
import { addMonthsClamped, previousDay } from './calendar';
import { contractEndDate } from './contract';
import { vatAmounts, vatRateOn, type VatAmounts } from './vat';

export type BillingTerms = {
  startDate: string;
  termMonths: number;
  monthlyNetRentCents: number;
  downPaymentCents: number;
};

export type InvoiceLine = VatAmounts & {
  /** 0 is the down payment, 1..term are the rents. Unique per contract. */
  sequence: number;
  kind: 'down_payment' | 'rent';
  invoiceDate: string;
  dueDate: string;
  /** The month a rent covers; null for a down payment. */
  periodStart: string | null;
  periodEnd: string | null;
};

export type InvoiceTotals = { netCents: number; vatCents: number; grossCents: number };

export type ScheduleResult =
  | { ok: true; invoices: InvoiceLine[] }
  | { ok: false; reason: 'no_vat_rate_on_date'; date: string };

/** Every invoice of a contract. Same input, same output, so it is safe to call again. */
export function buildInvoiceSchedule(terms: BillingTerms, vatRates: VatRates): ScheduleResult {
  const { startDate, termMonths, monthlyNetRentCents, downPaymentCents } = terms;
  const invoices: InvoiceLine[] = [];

  const add = (
    sequence: number,
    kind: InvoiceLine['kind'],
    invoiceDate: string,
    netCents: number,
    period: Pick<InvoiceLine, 'periodStart' | 'periodEnd'>
  ): boolean => {
    const rate = vatRateOn(vatRates, invoiceDate);
    if (!rate.ok) return false;
    invoices.push({
      sequence,
      kind,
      invoiceDate,
      dueDate: invoiceDate,
      ...period,
      ...vatAmounts(netCents, rate.ratePercent),
    });
    return true;
  };

  if (downPaymentCents > 0) {
    const noPeriod = { periodStart: null, periodEnd: null };
    if (!add(0, 'down_payment', startDate, downPaymentCents, noPeriod)) {
      return { ok: false, reason: 'no_vat_rate_on_date', date: startDate };
    }
  }

  for (let month = 0; month < termMonths; month++) {
    const invoiceDate = addMonthsClamped(startDate, month);
    const periodEnd = previousDay(addMonthsClamped(startDate, month + 1));
    const period = { periodStart: invoiceDate, periodEnd };
    if (!add(month + 1, 'rent', invoiceDate, monthlyNetRentCents, period)) {
      return { ok: false, reason: 'no_vat_rate_on_date', date: invoiceDate };
    }
  }

  return { ok: true, invoices };
}

/** Invoices dated on or before `asOf`, the ones that can be issued. */
export function invoicesDueBy<T extends { invoiceDate: string }>(
  invoices: readonly T[],
  asOf: string
): T[] {
  return invoices.filter((invoice) => invoice.invoiceDate <= asOf);
}

export function sumInvoices(invoices: readonly VatAmounts[]): InvoiceTotals {
  return invoices.reduce(
    (total, invoice) => ({
      netCents: total.netCents + invoice.netCents,
      vatCents: total.vatCents + invoice.vatCents,
      grossCents: total.grossCents + invoice.grossCents,
    }),
    { netCents: 0, vatCents: 0, grossCents: 0 }
  );
}

export type VatChange = { fromPercent: number; toPercent: number };

/**
 * Marks each invoice whose VAT rate differs from the invoice before it, so the UI can say why
 * the total moved although the price is locked. Expects the invoices in order.
 */
export function withVatChanges<T extends { vatRatePercent: number }>(
  invoices: readonly T[]
): (T & { vatChange: VatChange | null })[] {
  return invoices.map((invoice, index) => {
    const before = invoices[index - 1];
    const changed = before !== undefined && before.vatRatePercent !== invoice.vatRatePercent;
    return {
      ...invoice,
      vatChange: changed
        ? { fromPercent: before.vatRatePercent, toPercent: invoice.vatRatePercent }
        : null,
    };
  });
}

export type CostForecast = {
  invoices: InvoiceLine[];
  totals: InvoiceTotals;
  /** The optional buyout, with VAT at the last day of the term. */
  buyout: VatAmounts & { invoiceDate: string };
  /** What the customer pays in all if they also buy the item at the end. */
  totalWithBuyoutGrossCents: number;
};

export type CostForecastResult =
  { ok: true; forecast: CostForecast } | { ok: false; reason: 'no_vat_rate_on_date'; date: string };

/** Total cost using the VAT rates known today. A forecast: future rates can still change. */
export function forecastCost(
  terms: BillingTerms & { buyoutNetCents: number },
  vatRates: VatRates
): CostForecastResult {
  const schedule = buildInvoiceSchedule(terms, vatRates);
  if (!schedule.ok) return schedule;

  const invoiceDate = contractEndDate(terms.startDate, terms.termMonths);
  const rate = vatRateOn(vatRates, invoiceDate);
  if (!rate.ok) return { ok: false, reason: 'no_vat_rate_on_date', date: invoiceDate };

  const totals = sumInvoices(schedule.invoices);
  const buyout = { ...vatAmounts(terms.buyoutNetCents, rate.ratePercent), invoiceDate };
  return {
    ok: true,
    forecast: {
      invoices: schedule.invoices,
      totals,
      buyout,
      totalWithBuyoutGrossCents: totals.grossCents + buyout.grossCents,
    },
  };
}
