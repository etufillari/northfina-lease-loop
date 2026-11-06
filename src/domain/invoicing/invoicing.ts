// The invoices of a contract: the down payment, if any, then one for each month of rent.
// Net amounts are locked; VAT is not. Each invoice takes the rate on its own date and stores
// it, so a past invoice keeps the VAT it was billed with. One dated in the future has not been
// billed yet, so a rate announced after signing still reaches it: see `futureVatCorrections`.
import type { Contract, Invoice, InvoiceKind } from '@/data/lease-schemas';
import type { VatRates } from '@/data/schemas';
import { addDays, addMonths } from '../dates';
import { vatCents, vatRateOn } from '../vat';

type ScheduledContract = Pick<
  Contract,
  'id' | 'start_on' | 'term_months' | 'down_payment_cents' | 'monthly_net_rent_cents'
>;

/** The VAT an invoice should move to, and the rate it is leaving. */
export type VatCorrection = Pick<
  Invoice,
  'id' | 'contract_id' | 'sequence' | 'vat_rate_basis_points' | 'vat_cents' | 'total_cents'
> & { from_basis_points: number };

/** What a set of invoices adds up to, VAT and all. */
export type InvoiceTotals = {
  total_net_cents: number;
  total_vat_cents: number;
  total_cents: number;
};

type InvoiceDates = Pick<Invoice, 'period_start' | 'period_end' | 'invoice_date' | 'due_date'>;

function buildInvoice(
  contractId: string,
  sequence: number,
  kind: InvoiceKind,
  netCents: number,
  dates: InvoiceDates,
  vatRates: VatRates
): Omit<Invoice, 'id'> {
  const rate = vatRateOn(vatRates, dates.invoice_date);
  if (!rate.ok) throw new RangeError(`no VAT rate on ${dates.invoice_date}`);

  const vat = vatCents(netCents, rate.rateBasisPoints);
  return {
    contract_id: contractId,
    sequence,
    kind,
    ...dates,
    net_cents: netCents,
    vat_rate_basis_points: rate.rateBasisPoints,
    vat_cents: vat,
    total_cents: netCents + vat,
    status: 'issued',
  };
}

/**
 * Every invoice of a contract, without ids. A down payment is billed on the start date, with
 * VAT at that date's rate like any other payment, so every euro of the quote is on an invoice.
 * Then one rent invoice per month, each due on its invoice date and each a full month, so a
 * mid-month start needs no proration. Dates always count from the start date, so a clamped
 * month does not stick: a contract starting 31 Jan is invoiced 28 Feb and then 31 Mar. The
 * rent is one rounded figure, so the net rent adds up to exactly rent × term.
 */
export function invoiceSchedule(
  contract: ScheduledContract,
  vatRates: VatRates
): Omit<Invoice, 'id'>[] {
  const { id, start_on, term_months, down_payment_cents, monthly_net_rent_cents } = contract;
  const hasDownPayment = down_payment_cents > 0;

  const rents = Array.from({ length: term_months }, (_, month) => {
    const invoiceDate = addMonths(start_on, month);
    return buildInvoice(
      id,
      month + (hasDownPayment ? 2 : 1),
      'rent',
      monthly_net_rent_cents,
      {
        period_start: invoiceDate,
        period_end: addDays(addMonths(start_on, month + 1), -1),
        invoice_date: invoiceDate,
        due_date: invoiceDate,
      },
      vatRates
    );
  });
  if (!hasDownPayment) return rents;

  const downPayment = buildInvoice(
    id,
    1,
    'down_payment',
    down_payment_cents,
    {
      period_start: start_on,
      period_end: start_on,
      invoice_date: start_on,
      due_date: start_on,
    },
    vatRates
  );
  return [downPayment, ...rents];
}

/**
 * Adds up what is really billed, so a total crossing a VAT change is exact. A cancelled invoice
 * is never paid and does not count. A buyout only counts once it has been invoiced.
 */
export function invoiceTotals(
  invoices: readonly Pick<Invoice, 'status' | 'net_cents' | 'vat_cents' | 'total_cents'>[]
): InvoiceTotals {
  const totals: InvoiceTotals = { total_net_cents: 0, total_vat_cents: 0, total_cents: 0 };
  for (const invoice of invoices) {
    if (invoice.status === 'cancelled') continue;
    totals.total_net_cents += invoice.net_cents;
    totals.total_vat_cents += invoice.vat_cents;
    totals.total_cents += invoice.total_cents;
  }
  return totals;
}

/**
 * The invoices dated after `today` that are no longer on the rate of their own date. An invoice
 * dated today or earlier has been billed, and a paid or cancelled one is finished, so those
 * never change. Neither does the net amount. A date with no known rate keeps what it has.
 */
export function futureVatCorrections(
  invoices: readonly Invoice[],
  vatRates: VatRates,
  today: string
): VatCorrection[] {
  return invoices.flatMap((invoice) => {
    if (invoice.status !== 'issued' || invoice.invoice_date <= today) return [];

    const rate = vatRateOn(vatRates, invoice.invoice_date);
    if (!rate.ok || rate.rateBasisPoints === invoice.vat_rate_basis_points) return [];

    const vat = vatCents(invoice.net_cents, rate.rateBasisPoints);
    return [
      {
        id: invoice.id,
        contract_id: invoice.contract_id,
        sequence: invoice.sequence,
        from_basis_points: invoice.vat_rate_basis_points,
        vat_rate_basis_points: rate.rateBasisPoints,
        vat_cents: vat,
        total_cents: invoice.net_cents + vat,
      },
    ];
  });
}
