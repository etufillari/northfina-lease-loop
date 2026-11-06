// The billing run (Spine step 5): issues every invoice that is due by `today` for a customer's
// active contracts. It runs when the customer opens their account, so the demo clock moving
// forward bills the months in between. Idempotent: an invoice is identified by its contract and
// due date (unique in the database), and issuing again creates nothing.
import type { PrismaClient } from '@/generated/prisma/client';
import { Prisma } from '@/generated/prisma/client';
import { loadVatRates } from '@/data/load';
import { invoicesDue, type DueInvoice } from '@/domain/invoice-issuance';
import { withAudit, type AuditEntry, type TransactionClient } from './audit';
import { billingRows } from './demo-history';

export const billingActor = 'system:billing';

type Pending = { contractId: string; invoices: DueInvoice[] };

async function pendingInvoices(
  database: PrismaClient | TransactionClient,
  customerId: string,
  today: string
): Promise<Pending[]> {
  const [contracts, vat] = await Promise.all([
    database.contract.findMany({
      where: { customerId, status: 'active' },
      select: {
        id: true,
        status: true,
        startDate: true,
        termMonths: true,
        monthlyNetCents: true,
        isDemo: true,
        invoices: { select: { dueDate: true } },
      },
    }),
    loadVatRates(),
  ]);
  return contracts.flatMap((contract) => {
    const due = invoicesDue(
      contract,
      today,
      vat.rates,
      contract.invoices.map((invoice) => invoice.dueDate)
    );
    // Without a VAT rate for a due date the invoice can't be issued correctly; the lease page
    // already says the schedule is unavailable, so leave it unbilled rather than guess.
    return due.ok && due.invoices.length
      ? [{ contractId: contract.id, invoices: due.invoices }]
      : [];
  });
}

/** Issues the customer's due invoices. Returns how many were issued. */
export async function issueDueInvoices(
  db: PrismaClient,
  customerId: string,
  today: string
): Promise<number> {
  // Most page views have nothing to issue: check first so they write no audit row.
  if (!(await pendingInvoices(db, customerId, today)).length) return 0;
  const entry: AuditEntry = {
    actor: billingActor,
    action: 'invoice.issued',
    entityType: 'customer',
    entityId: customerId,
    details: { today },
  };
  try {
    return await withAudit(db, entry, async (tx) => {
      // Read again inside the transaction: another request may have issued them meanwhile.
      const pending = await pendingInvoices(tx, customerId, today);
      for (const { contractId, invoices } of pending) {
        const rows = billingRows(contractId, invoices);
        await tx.invoice.createMany({ data: rows.invoices });
        await tx.payment.createMany({ data: rows.payments });
        await tx.leaseEvent.createMany({ data: rows.events });
      }
      entry.details = {
        today,
        invoices: pending.flatMap(({ contractId, invoices }) =>
          invoices.map((invoice) => ({ contractId, dueDate: invoice.dueDate, paid: invoice.paid }))
        ),
      };
      return pending.reduce((sum, item) => sum + item.invoices.length, 0);
    });
  } catch (error) {
    // Two page loads raced and the other one issued the same invoices: nothing left to do.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return 0;
    throw error;
  }
}
