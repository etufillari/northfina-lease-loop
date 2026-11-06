// Spine step 5: monthly invoices from a signed contract.
//
// Rules (and why):
// - One invoice per month of the term, rent paid in advance. Invoice n is dated and due on the
//   start date + (n − 1) months, always counted from the START date, so a lease starting on
//   31 January is due on 28 Feb (29 Feb in leap years), then 31 Mar, not drifting to the 28th.
// - Every month is a full month, because the lease starts on the signing day and runs in whole
//   months from there. No partial first month to prorate.
// - The net rent is the locked contract rent on every invoice. VAT is charged at the rate in
//   force on the invoice date, so a VAT change moves the total, never the rent.
// - Each invoice's VAT is rounded once, half up (percentOfCents). The net rents add up to
//   exactly term × monthly rent, the contract total.
//
// Invoices are derived, not stored: given the same contract they are always the same, so they
// can't drift from the contract. "Issued" just means the invoice date has been reached.
import type { VatRates } from '@/data/schemas';
import { addDays, addMonths } from './contract';
import { percentOfCents } from './money';
import { vatPercentOn } from './vat';

export type InvoiceContract = { startDate: string; termMonths: number; monthlyNetCents: number };

export type Invoice = {
  /** 1 for the first month of the lease. */
  number: number;
  /** Invoice date = due date: the rent for a month is paid at its start. */
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  netCents: number;
  vatPercent: number;
  vatCents: number;
  totalCents: number;
  /** Set when this invoice's VAT rate differs from the previous invoice's. */
  vatChangedFrom: number | null;
};

export type InvoiceScheduleResult =
  { ok: true; invoices: Invoice[] } | { ok: false; reason: 'no_vat_rate'; dueDate: string };

export function invoiceSchedule(
  contract: InvoiceContract,
  vatRates: VatRates
): InvoiceScheduleResult {
  const invoices: Invoice[] = [];
  for (let number = 1; number <= contract.termMonths; number++) {
    const dueDate = addMonths(contract.startDate, number - 1);
    const vatPercent = vatPercentOn(vatRates, dueDate);
    if (vatPercent === null) return { ok: false, reason: 'no_vat_rate', dueDate };
    const vatCents = percentOfCents(contract.monthlyNetCents, vatPercent);
    const previous = invoices.at(-1);
    invoices.push({
      number,
      dueDate,
      periodStart: dueDate,
      periodEnd: addDays(addMonths(contract.startDate, number), -1),
      netCents: contract.monthlyNetCents,
      vatPercent,
      vatCents,
      totalCents: contract.monthlyNetCents + vatCents,
      vatChangedFrom: previous && previous.vatPercent !== vatPercent ? previous.vatPercent : null,
    });
  }
  return { ok: true, invoices };
}

export type InvoiceTotals = { netCents: number; vatCents: number; totalCents: number };

export function sumInvoices(invoices: readonly Invoice[]): InvoiceTotals {
  return invoices.reduce(
    (sum, invoice) => ({
      netCents: sum.netCents + invoice.netCents,
      vatCents: sum.vatCents + invoice.vatCents,
      totalCents: sum.totalCents + invoice.totalCents,
    }),
    { netCents: 0, vatCents: 0, totalCents: 0 }
  );
}

/** Invoices whose date has been reached on `today` ("issued"), and the rest ("upcoming"). */
export function splitByDate(
  invoices: readonly Invoice[],
  today: string
): { issued: Invoice[]; upcoming: Invoice[] } {
  return {
    issued: invoices.filter((invoice) => invoice.dueDate <= today),
    upcoming: invoices.filter((invoice) => invoice.dueDate > today),
  };
}

/**
 * The next VAT change still ahead on `today`: the first not-yet-issued invoice whose rate
 * differs from the invoice before it. Once that invoice is issued the change has happened and
 * there is nothing left to warn about, so this returns `null` (until a later change comes up).
 */
export function upcomingVatChange(
  invoices: readonly Invoice[],
  today: string
): { invoice: Invoice; previous: Invoice } | null {
  const index = invoices.findIndex(
    (invoice) => invoice.vatChangedFrom !== null && invoice.dueDate > today
  );
  const invoice = invoices[index];
  const previous = invoices[index - 1];
  return invoice && previous ? { invoice, previous } : null;
}

export type InvoiceStatus = 'upcoming' | 'due' | 'paid';
export type InvoicePaymentRecord = { invoiceNumber: number; paidDate: string };
export type InvoiceWithStatus = Invoice & {
  status: InvoiceStatus;
  paidDate: string | null;
  /** True for the first month's rent, which is paid by signing the contract. */
  paidAtSigning: boolean;
};

/**
 * Each invoice's status on `today`: paid if a payment was made on or before `today`, otherwise
 * due once its date is reached, otherwise upcoming.
 *
 * A payment only counts from its own date. Pay January's invoice while visiting January, then
 * travel back to November, and that payment hasn't happened yet, so the invoice is upcoming
 * again; travel forward and it is paid again.
 *
 * The first month's rent is paid by signing: invoice 1 is paid on `signedDate` without a
 * separate payment, so invoices to pay start from month 2. (Before the signing day, when
 * travelling back in time, it is upcoming like the rest.)
 */
export function withStatus(
  invoices: readonly Invoice[],
  payments: readonly InvoicePaymentRecord[],
  today: string,
  signedDate: string
): InvoiceWithStatus[] {
  const paidOn = new Map(payments.map((p) => [p.invoiceNumber, p.paidDate]));
  return invoices.map((invoice) => {
    const paidAtSigning = invoice.number === 1 && signedDate <= today;
    const payment = paidOn.get(invoice.number);
    const paidDate = paidAtSigning
      ? signedDate
      : payment !== undefined && payment <= today
        ? payment
        : null;
    const status: InvoiceStatus = paidDate ? 'paid' : invoice.dueDate <= today ? 'due' : 'upcoming';
    return { ...invoice, status, paidDate, paidAtSigning };
  });
}

/** A readable invoice number: the contract number and the month, e.g. "1A2B3C4D-05". */
export function invoiceLabel(contractNumber: string, invoiceNumber: number): string {
  return `${contractNumber}-${String(invoiceNumber).padStart(2, '0')}`;
}
