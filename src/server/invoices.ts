// Invoice payments. The invoices are derived from each contract (src/domain/invoicing.ts); only
// payments are stored. This is a DEMO payment: no money moves and no bank details are taken,
// because handling real payments safely is out of scope for this app.

import type { PrismaClient } from '@/generated/prisma/client';
import { effectiveVatRates } from './vat';
import {
  invoiceSchedule,
  withStatus,
  type Invoice,
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
  const [vatRates, payments] = await Promise.all([
    effectiveVatRates(db),
    listPayments(db, contract.id),
  ]);
  const schedule = invoiceSchedule(contract, vatRates);
  if (!schedule.ok) return null;
  await issueDueInvoices(db, contract, schedule.invoices, today);
  return withStatus(schedule.invoices, payments, today, contract.signedDate);
}

/**
 * Issues every invoice whose date has been reached on `today` and isn't issued yet: records it
 * as billed and writes an `invoice.issued` audit row, in one transaction per invoice. Runs
 * whenever a contract's invoices are read, so issuing happens exactly once, on (or after) the
 * invoice date, however the app is used. The record is dated on the invoice date, so travelling
 * back in time still shows the invoice as upcoming before that date.
 */
export async function issueDueInvoices(
  db: PrismaClient,
  contract: Contract,
  invoices: readonly Invoice[],
  today: string
): Promise<number> {
  const issued = new Set(
    (
      await db.invoiceIssue.findMany({
        where: { contract_id: contract.id },
        select: { invoice_number: true },
      })
    ).map((row) => row.invoice_number)
  );
  let count = 0;
  for (const invoice of invoices) {
    if (invoice.dueDate > today || issued.has(invoice.number)) continue;
    try {
      await withAudit(
        db,
        {
          actor: 'billing',
          action: 'invoice.issued',
          entityType: 'invoice',
          entityId: `${contract.id}#${invoice.number}`,
          details: {
            invoiceDate: invoice.dueDate,
            netCents: invoice.netCents,
            vatPercent: invoice.vatPercent,
            totalCents: invoice.totalCents,
          },
        },
        (tx) =>
          tx.invoiceIssue.create({
            data: {
              contract_id: contract.id,
              invoice_number: invoice.number,
              issued_date: invoice.dueDate,
              net_cents: invoice.netCents,
              vat_basis_points: Math.round(invoice.vatPercent * 100),
              vat_cents: invoice.vatCents,
              total_cents: invoice.totalCents,
            },
          })
      );
      count += 1;
    } catch (error) {
      // Issued a moment ago by another request: the unique key keeps it to one.
      if ((error as { code?: string }).code !== 'P2002') throw error;
    }
  }
  return count;
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
  const contracts = await listContracts(db, filter, today);
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

/**
 * Pays every invoice that is due on `todayIso` (demo payments, each with its own audit row):
 * for one contract, or across the contracts `filter` selects (as in listContracts).
 */
export async function payAllDue(
  db: PrismaClient,
  input: { contractId?: string; filter: { customerId: string | null } | null; actor: string },
  todayIso: string
): Promise<{ paidCount: number; paidCents: number }> {
  let due: ReceivedInvoice[];
  if (input.contractId) {
    const contract = await getContract(db, input.contractId);
    const invoices = contract ? ((await contractInvoices(db, contract, todayIso)) ?? []) : [];
    due = contract ? invoices.map((invoice) => ({ contract, invoice })) : [];
  } else {
    due = await receivedInvoices(db, input.filter, todayIso);
  }
  let paidCount = 0;
  let paidCents = 0;
  for (const { contract, invoice } of due.filter((r) => r.invoice.status === 'due')) {
    const result = await payInvoice(
      db,
      { contractId: contract.id, invoiceNumber: invoice.number, actor: input.actor },
      todayIso
    );
    if (result.ok) {
      paidCount += 1;
      paidCents += result.amountCents;
    }
  }
  return { paidCount, paidCents };
}
