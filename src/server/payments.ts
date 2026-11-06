// The payments the affordability rule weighs (src/domain/affordability.ts): every invoice a
// new lease would bill, and every lease invoice the customer already pays. Read-only.
import type { VatRates } from '@/data/schemas';
import type { Payment } from '@/domain/affordability';
import { scheduleInvoices } from '@/domain/invoicing';
import type { PrismaClient } from '@/generated/prisma/client';

type Db = PrismaClient;

/**
 * The new lease's invoices, incl. VAT at each due date. A take-over bills the transferred
 * contract's invoices not yet due (exactly what moves to the successor).
 */
export async function newLeasePayments(
  db: Db,
  input: {
    startDate: string;
    asOf: string;
    termMonths: number;
    monthlyNetRentCents: number;
    netTotalCents: number;
    transferContractId: string | null;
    vatRates: VatRates;
  }
): Promise<Payment[] | null> {
  if (input.transferContractId) {
    const rows = await db.invoice.findMany({
      where: { contract_id: input.transferContractId, type: 'lease', due_date: { gt: input.asOf } },
      select: { due_date: true, total_cents: true },
    });
    return rows.map((row) => ({ dueDate: row.due_date, totalCents: row.total_cents }));
  }
  const schedule = scheduleInvoices(
    {
      startDate: input.startDate,
      termMonths: input.termMonths,
      monthlyNetRentCents: input.monthlyNetRentCents,
      netTotalCents: input.netTotalCents,
    },
    input.vatRates
  );
  return schedule.ok
    ? schedule.invoices.map((line) => ({ dueDate: line.dueDate, totalCents: line.totalCents }))
    : null;
}

/**
 * What the customer already pays: the lease invoices due from `fromDate` on that are theirs —
 * on their active leases, and any they took over (an invoice names its payer; one without
 * a payer belongs to the contract's customer). Buyout and exit invoices are one-offs, not
 * monthly commitments. A contract being taken over is left out: it is the new lease.
 */
export async function existingPayments(
  db: Db,
  input: { customerId: string; fromDate: string; excludeContractId?: string | null }
): Promise<Payment[]> {
  const rows = await db.invoice.findMany({
    where: {
      type: 'lease',
      due_date: { gte: input.fromDate },
      contract: { status: 'active' },
      ...(input.excludeContractId ? { NOT: { contract_id: input.excludeContractId } } : {}),
      OR: [
        { customer_id: input.customerId },
        { customer_id: null, contract: { customer_id: input.customerId } },
      ],
    },
    select: { due_date: true, total_cents: true },
  });
  return rows.map((row) => ({ dueDate: row.due_date, totalCents: row.total_cents }));
}
