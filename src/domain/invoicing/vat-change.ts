// Why an invoice total can change while the rent is locked. Each rent invoice is compared with
// the rent invoice before it on the same contract. Other kinds are left out: a down payment or
// a buyout is a different amount, so comparing it with a rent would explain nothing.
import type { Invoice } from '@/data/lease-schemas';
import type { VatRates } from '@/data/schemas';
import { addMonths } from '../dates';
import { toBasisPoints, vatCents, vatRateOn } from '../vat';

export type VatChange = {
  from_percent: number;
  to_percent: number;
  /** Zero on every locked contract: this is the proof that the price did not move. */
  net_change_cents: number;
  /** What the customer pays more, or less when the rate falls. */
  total_change_cents: number;
};

/** What a customer should hear before signing: the monthly total will not stay as quoted. */
export type UpcomingVatChange = {
  effective_on: string;
  rate_percent: number;
  monthly_total_cents: number;
  monthly_change_cents: number;
};

type ComparedInvoice = Pick<
  Invoice,
  'contract_id' | 'kind' | 'net_cents' | 'vat_rate_basis_points' | 'total_cents'
>;

const percent = (basisPoints: number) => basisPoints / 100;

function vatChange(previous: ComparedInvoice, invoice: ComparedInvoice): VatChange | null {
  if (previous.vat_rate_basis_points === invoice.vat_rate_basis_points) return null;

  return {
    from_percent: percent(previous.vat_rate_basis_points),
    to_percent: percent(invoice.vat_rate_basis_points),
    net_change_cents: invoice.net_cents - previous.net_cents,
    total_change_cents: invoice.total_cents - previous.total_cents,
  };
}

/**
 * Adds `vat_change` to each invoice: what changed since the previous rent, or `null` when the
 * rate did not. Pass every invoice of a contract in order, before any filtering, or an invoice
 * is compared with the wrong one. Several contracts can share a list.
 */
export function withVatChanges<T extends ComparedInvoice>(
  invoices: readonly T[]
): (T & { vat_change: VatChange | null })[] {
  const previousRent = new Map<string, T>();

  return invoices.map((invoice) => {
    if (invoice.kind !== 'rent') return { ...invoice, vat_change: null };

    const previous = previousRent.get(invoice.contract_id);
    previousRent.set(invoice.contract_id, invoice);
    return { ...invoice, vat_change: previous ? vatChange(previous, invoice) : null };
  });
}

/**
 * The first VAT change that reaches a rent of this lease, or `null` when every rent keeps the
 * rate of the first one. A change after the last rent does not count: it would never be billed.
 */
export function upcomingVatChange(
  vatRates: VatRates,
  lease: { startOn: string; termMonths: number; monthlyNetRentCents: number }
): UpcomingVatChange | null {
  const { startOn, termMonths, monthlyNetRentCents } = lease;
  const current = vatRateOn(vatRates, startOn);
  if (!current.ok) return null;

  const lastRentOn = addMonths(startOn, termMonths - 1);
  const next = [...vatRates.rates]
    .sort((a, b) => a.valid_from.localeCompare(b.valid_from))
    .find(
      (rate) =>
        rate.valid_from > startOn &&
        rate.valid_from <= lastRentOn &&
        toBasisPoints(rate.rate_percent) !== current.rateBasisPoints
    );
  if (!next) return null;

  const vatNow = vatCents(monthlyNetRentCents, current.rateBasisPoints);
  const vatThen = vatCents(monthlyNetRentCents, toBasisPoints(next.rate_percent));
  return {
    effective_on: next.valid_from,
    rate_percent: next.rate_percent,
    monthly_total_cents: monthlyNetRentCents + vatThen,
    monthly_change_cents: vatThen - vatNow,
  };
}
