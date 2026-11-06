// The invoices slice's rows (docs/kickoff-brief.md section 6: the Invoice table is ours).
// The schedule is computed in src/domain/invoicing and written here at signing, inside the
// signing transaction; paying an invoice is one audited change that emits INVOICE_PAID.
import type { Invoice as InvoiceRow } from '@/generated/prisma/client';
import { isoDateSchema } from '@/data/schemas';
import type { ScheduledInvoice } from '@/domain/invoicing';
import {
  invoiceKindSchema,
  invoiceStatusSchema,
  type InvoiceKind,
  type InvoiceStatus,
} from '@/domain/statuses';
import { invoiceRowSchema } from '@/domain/rows/invoice';
import type { AuthzRefusal } from '@/domain/authz/policy';
import { withAudit, type TransactionClient } from './audit';
import { authorize } from './authorize';
import { contractCustomerId, getContract, listContracts } from './contracts';
import { emit } from './events';
import type { PrismaClient } from './prisma-client';
import { parseRow } from './row-rules';

/** An invoice as the API and the pages see it. Money in cents, rates in basis points. */
export type InvoiceView = {
  id: string;
  contractId: string;
  sequence: number;
  kind: InvoiceKind;
  periodStart: string | null;
  periodEnd: string | null;
  issueDate: string;
  dueDate: string;
  netCents: number;
  vatRateBasisPoints: number;
  vatCents: number;
  grossCents: number;
  status: InvoiceStatus;
  paidOn: string | null;
};

/** Row → view. Validates the status-like columns, so a value edited in by hand is caught. */
export function toInvoiceView(row: InvoiceRow): InvoiceView {
  return {
    id: row.id,
    contractId: row.contract_id,
    sequence: row.sequence,
    kind: invoiceKindSchema.parse(row.kind),
    periodStart: row.period_start,
    periodEnd: row.period_end,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    netCents: row.net_cents,
    vatRateBasisPoints: row.vat_rate_bp,
    vatCents: row.vat_cents,
    grossCents: row.gross_cents,
    status: invoiceStatusSchema.parse(row.status),
    paidOn: row.paid_on,
  };
}

/**
 * Inserts a contract's whole schedule, every invoice `issued`. Takes the caller's `tx`: it is
 * always part of a larger audited change (signing), never a change of its own.
 */
export async function writeSchedule(
  tx: TransactionClient,
  contractId: string,
  invoices: readonly ScheduledInvoice[]
): Promise<number> {
  const { count } = await tx.invoice.createMany({
    // Every row parsed first (D27): gross = net + VAT, the period, the status.
    data: invoices.map((invoice) =>
      parseRow('invoice', invoiceRowSchema, {
        contract_id: contractId,
        sequence: invoice.sequence,
        period_start: invoice.periodStart,
        period_end: invoice.periodEnd,
        issue_date: invoice.issueDate,
        due_date: invoice.dueDate,
        net_cents: invoice.netCents,
        vat_rate_bp: invoice.vatRateBasisPoints,
        vat_cents: invoice.vatCents,
        gross_cents: invoice.grossCents,
        kind: invoice.kind,
        status: 'issued',
      })
    ),
  });
  return count;
}

/** A contract's invoices in sequence order; empty for an unknown contract. */
export async function listInvoices(
  db: PrismaClient | TransactionClient,
  contractId: string
): Promise<InvoiceView[]> {
  const rows = await db.invoice.findMany({
    where: { contract_id: contractId },
    orderBy: { sequence: 'asc' },
  });
  return rows.map(toInvoiceView);
}

/**
 * The customer an invoice bills, for the access check. Null for an unknown invoice. The
 * invoice row is ours; its contract is read through the contract slice's `contractCustomerId`
 * (team rule 3), never with a query on the Contract table.
 */
export async function invoiceCustomerId(
  db: PrismaClient | TransactionClient,
  invoiceId: string
): Promise<string | null> {
  const row = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: { contract_id: true },
  });
  return row ? contractCustomerId(db, row.contract_id) : null;
}

/** The customer of a contract: the contract slice's read, re-exported for the invoice routes. */
export { contractCustomerId };

/** Thrown inside the transaction when another request paid first, so nothing is written. */
class LostPaymentRace extends Error {}

export type PayInvoiceResult =
  | { ok: true; invoice: InvoiceView }
  | { ok: false; reason: 'not_found' | 'already_paid' | 'cancelled' | 'paid_before_signing' }
  | { ok: false; reason: 'forbidden'; refusal: AuthzRefusal };

/**
 * Marks an invoice paid on `paidOn` (the request's today), writes `invoice.paid` to the audit
 * log and emits INVOICE_PAID with the gross amount, all in one transaction. Paying early is
 * allowed (an advance payment); paying twice is an answer, not a crash.
 */
export async function payInvoice(
  db: PrismaClient,
  input: { id: string; paidOn: string; actor: string }
): Promise<PayInvoiceResult> {
  // D73: authorized before anything else is read: the contract's customer or the admin.
  const auth = await authorize(db, input.actor, 'pay_invoice', { invoice: input.id });
  if (!auth.ok) {
    return auth.reason.code === 'not_found'
      ? { ok: false, reason: 'not_found' }
      : { ok: false, reason: 'forbidden', refusal: auth.reason };
  }
  // D23 and product review 9: the day and both statuses parsed before any write.
  const paidOn = isoDateSchema.parse(input.paidOn);
  const issued = invoiceStatusSchema.parse('issued');
  const paid = invoiceStatusSchema.parse('paid');
  const existing = await db.invoice.findUnique({ where: { id: input.id } });
  if (!existing) return { ok: false, reason: 'not_found' };
  const status = invoiceStatusSchema.parse(existing.status);
  if (status === 'cancelled') return { ok: false, reason: 'cancelled' };
  if (status === paid) return { ok: false, reason: 'already_paid' };
  // Paying early is allowed (an advance), but never before the contract existed.
  const contract = await getContract(db, existing.contract_id);
  if (contract && paidOn < contract.signedOn) return { ok: false, reason: 'paid_before_signing' };

  let row: InvoiceRow;
  try {
    row = await withAudit(
      db,
      {
        actor: input.actor,
        action: 'invoice.paid',
        entityType: 'invoice',
        entityId: input.id,
        details: {
          sequence: existing.sequence,
          grossCents: existing.gross_cents,
          paidOn,
        },
      },
      async (tx) => {
        // The status guard in the where makes a concurrent second payment a no-op, not a double.
        const { count } = await tx.invoice.updateMany({
          where: { id: input.id, status: issued },
          data: { status: paid, paid_on: paidOn },
        });
        if (count === 0) throw new LostPaymentRace();
        await emit(tx, {
          type: 'INVOICE_PAID',
          invoiceId: input.id,
          contractId: existing.contract_id,
          amountCents: existing.gross_cents,
          date: paidOn,
        });
        return tx.invoice.findUniqueOrThrow({ where: { id: input.id } });
      }
    );
  } catch (error) {
    if (error instanceof LostPaymentRace) return { ok: false, reason: 'already_paid' };
    throw error;
  }
  return { ok: true, invoice: toInvoiceView(row) };
}

/**
 * Every invoice of one customer across their contracts, newest due day first (then the higher
 * sequence first), for the portal (D75). The contracts are the contract slice's
 * `listContracts` (team rule 3); only the Invoice table is queried here.
 */
export async function listCustomerInvoices(
  db: PrismaClient,
  filter: { customerId: string }
): Promise<InvoiceView[]> {
  const contracts = await listContracts(db, { customerId: filter.customerId });
  if (contracts.length === 0) return [];
  const rows = await db.invoice.findMany({
    where: { contract_id: { in: contracts.map((c) => c.id) } },
    orderBy: [{ due_date: 'desc' }, { sequence: 'desc' }],
  });
  return rows.map(toInvoiceView);
}
