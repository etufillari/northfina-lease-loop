// Why an invoice total can change while the rent is locked. Each rent invoice is compared with
// the rent invoice before it on the same contract. Other kinds are left out: a down payment or
// a buyout is a different amount, so comparing it with a rent would explain nothing.
import type { Invoice } from '@/data/lease-schemas';

export type VatChange = {
  from_percent: number;
  to_percent: number;
  /** Zero on every locked contract: this is the proof that the price did not move. */
  net_change_cents: number;
  /** What the customer pays more, or less when the rate falls. */
  total_change_cents: number;
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
