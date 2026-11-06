// Invoice payments. The invoices are derived from each contract (src/domain/invoicing.ts); only
// payments are stored. This is a DEMO payment: no money moves and no bank details are taken,
// because handling real payments safely is out of scope for this app.
import { loadVatRates } from '@/data/load';
import type { PrismaClient } from '@/generated/prisma/client';
import {
  invoiceSchedule,
  withStatus,
  type InvoicePaymentRecord,
  type InvoiceWithStatus,
} from '@/domain/invoicing';
import { withAudit } from './audit';
import { getContract, listContracts, type Contract } from './contracts';

export async function listPayments(
  db: PrismaClient,
  contractId: string
): Promise<InvoicePaymentRecord[]> {
  const rows = await db.invoicePayment.findMany({
    where: { contract_id: contractId },
    orderBy: { invoice_number: 'asc' },
  });
  return rows.map((row) => ({ invoiceNumber: row.invoice_number, paidDate: row.paid_date }));
}

/** A contract's invoices with their status on `today`, or `null` if no VAT rate covers one. */
export async function contractInvoices(
  db: PrismaClient,
  contract: Contract,
  today: string
): Promise<InvoiceWithStatus[] | null> {
  const [vatRates, payments] = await Promise.all([loadVatRates(), listPayments(db, contract.id)]);
  const schedule = invoiceSchedule(contract, vatRates);
  return schedule.ok ? withStatus(schedule.invoices, payments, today, contract.signedDate) : null;
}

export type ReceivedInvoice = { contract: Contract; invoice: InvoiceWithStatus };

/**
 * Every invoice that has reached the viewer by `today` (due or paid), newest first, across
 * their contracts. `filter` is the same as listContracts: `null` = all contracts (staff).
 */
export async function receivedInvoices(
  db: PrismaClient,
  filter: { customerId: string | null } | null,
  today: string
): Promise<ReceivedInvoice[]> {
  const contracts = await listContracts(db, filter);
  const perContract = await Promise.all(
    contracts.map(async (contract) => {
      const invoices = (await contractInvoices(db, contract, today)) ?? [];
      return invoices
        .filter((invoice) => invoice.status !== 'upcoming')
        .map((invoice) => ({ contract, invoice }));
    })
  );
  return perContract.flat().sort((a, b) => b.invoice.dueDate.localeCompare(a.invoice.dueDate));
}

export type PayInvoiceResult =
  | { ok: true; paidDate: string; amountCents: number }
  | {
      ok: false;
      reason: 'contract_not_found' | 'invoice_not_found' | 'not_issued' | 'already_paid';
    };

/**
 * Records that invoice `invoiceNumber` of a contract was paid on `todayIso`, with an
 * `invoice.paid` audit row in the same transaction. Only an issued, unpaid invoice can be
 * paid; the database's unique key stops the same invoice being paid twice at once.
 */
export async function payInvoice(
  db: PrismaClient,
  input: { contractId: string; invoiceNumber: number; actor: string },
  todayIso: string
): Promise<PayInvoiceResult> {
  const contract = await getContract(db, input.contractId);
  if (!contract) return { ok: false, reason: 'contract_not_found' };
  const invoice = (await contractInvoices(db, contract, todayIso))?.find(
    (candidate) => candidate.number === input.invoiceNumber
  );
  if (!invoice) return { ok: false, reason: 'invoice_not_found' };
  if (invoice.status === 'paid') return { ok: false, reason: 'already_paid' };
  if (invoice.status === 'upcoming') return { ok: false, reason: 'not_issued' };

  try {
    await withAudit(
      db,
      {
        actor: input.actor,
        action: 'invoice.paid',
        entityType: 'invoice',
        entityId: `${contract.id}#${invoice.number}`,
        details: { amountCents: invoice.totalCents, dueDate: invoice.dueDate, demo: true },
      },
      // A payment recorded on a later date (made while time-travelling ahead) hasn't happened
      // yet on todayIso, so paying now moves it to today instead of adding a second one.
      (tx) =>
        tx.invoicePayment.upsert({
          where: {
            contract_id_invoice_number: {
              contract_id: contract.id,
              invoice_number: invoice.number,
            },
          },
          update: { paid_date: todayIso, amount_cents: invoice.totalCents },
          create: {
            contract_id: contract.id,
            invoice_number: invoice.number,
            paid_date: todayIso,
            amount_cents: invoice.totalCents,
          },
        })
    );
  } catch (error) {
    // Paid a moment ago in another tab: the unique key refused the second payment.
    if ((error as { code?: string }).code === 'P2002') return { ok: false, reason: 'already_paid' };
    throw error;
  }
  return { ok: true, paidDate: todayIso, amountCents: invoice.totalCents };
}
