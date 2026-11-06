// Reading invoices. They are created with the contract, in the same transaction, so there is
// no way to write one here. Each read carries the customer, for the ownership check.
import { invoiceSchema, type Invoice, type InvoiceStatus } from '@/data/lease-schemas';
import { withVatChanges, type VatChange } from '@/domain/invoicing/vat-change';
import type { Invoice as InvoiceRow, PrismaClient } from '@/generated/prisma/client';

export function toInvoice(row: InvoiceRow): Invoice {
  return invoiceSchema.parse({
    id: row.id,
    contract_id: row.contract_id,
    sequence: row.sequence,
    kind: row.kind,
    period_start: row.period_start,
    period_end: row.period_end,
    invoice_date: row.invoice_date,
    due_date: row.due_date,
    net_cents: row.net_cents,
    vat_rate_basis_points: row.vat_rate_basis_points,
    vat_cents: row.vat_cents,
    total_cents: row.total_cents,
    status: row.status,
  });
}

/** An invoice as the screens see it: the rate as a plain percentage, and what changed. */
export type InvoiceView = Invoice & { vat_rate_percent: number; vat_change: VatChange | null };

/** Takes whole contracts, in order: each invoice is compared with the rent before it. */
function toInvoiceViews(rows: readonly InvoiceRow[]): InvoiceView[] {
  return withVatChanges(rows.map(toInvoice)).map((invoice) => ({
    ...invoice,
    vat_rate_percent: invoice.vat_rate_basis_points / 100,
  }));
}

export async function listInvoices(
  db: PrismaClient,
  filter: { customerId?: string; contractId?: string; status?: InvoiceStatus } = {}
): Promise<InvoiceView[]> {
  const rows = await db.invoice.findMany({
    where: { contract_id: filter.contractId, contract: { customer_id: filter.customerId } },
    orderBy: [{ contract_id: 'asc' }, { sequence: 'asc' }],
  });
  // The status filter comes last: a paid December must still explain an unpaid January.
  return toInvoiceViews(rows).filter(
    (invoice) => filter.status === undefined || invoice.status === filter.status
  );
}

/** One invoice, with the customer it belongs to. */
export async function getInvoice(
  db: PrismaClient,
  id: string
): Promise<{ invoice: InvoiceView; customerId: string } | null> {
  const row = await db.invoice.findUnique({
    where: { id },
    select: {
      contract: {
        select: { customer_id: true, invoices: { orderBy: { sequence: 'asc' } } },
      },
    },
  });
  const invoice = row && toInvoiceViews(row.contract.invoices).find((view) => view.id === id);
  return invoice ? { invoice, customerId: row.contract.customer_id } : null;
}
