import { randomUUID } from 'node:crypto';
import type { Contract as ContractRow, Invoice as InvoiceRow } from '@/generated/prisma/client';
import { invoiceStatusSchema } from '@/data/schemas';
import { loadVatRates } from '@/data/load';
import {
  invoiceScheduleFor,
  type InvoiceScheduleContract,
  type ScheduledInvoice,
} from '@/domain/invoicing';
import { withAudit } from './audit';
import type { PrismaClient } from './prisma-client';
import { z } from 'zod';

export const invoiceGenerationRequestSchema = z.strictObject({
  actor: z.string().trim().min(1).max(100),
});

export type InvoiceGenerationRequest = z.infer<typeof invoiceGenerationRequestSchema>;

export type InvoiceRecord = {
  id: string;
  contractId: string;
  sequence: number;
  status: 'issued' | 'paid' | 'overdue' | 'cancelled';
  periodStart: string;
  periodEnd: string;
  dueOn: string;
  netRentCents: number;
  vatRateBasisPoints: number;
  vatCents: number;
  totalCents: number;
  issuedAt: string;
  paidAt: string | null;
};

export type InvoiceGenerationFailure =
  | { ok: false; reason: 'contract_not_found' }
  | { ok: false; reason: 'contract_not_active'; status: string }
  | {
      ok: false;
      reason: 'no_vat_rate_on_date';
      sequence: number;
      invoiceDate: string;
    };

export type InvoiceGenerationResult =
  { ok: true; created: boolean; invoices: InvoiceRecord[] } | InvoiceGenerationFailure;

export type InvoiceListResult =
  | { ok: true; invoices: InvoiceRecord[] }
  | { ok: false; reason: 'contract_not_found' | 'invoice_schedule_not_generated' };

class InvoiceScheduleAlreadyExists extends Error {
  constructor(readonly rows: InvoiceRow[]) {
    super('The invoice schedule was created by another request');
    this.name = 'InvoiceScheduleAlreadyExists';
  }
}

function toInvoiceRecord(row: InvoiceRow): InvoiceRecord {
  return {
    id: row.id,
    contractId: row.contract_id,
    sequence: row.sequence,
    status: invoiceStatusSchema.parse(row.status),
    periodStart: row.period_start,
    periodEnd: row.period_end,
    dueOn: row.due_on,
    netRentCents: row.net_rent_cents,
    vatRateBasisPoints: row.vat_rate_basis_points,
    vatCents: row.vat_cents,
    totalCents: row.total_cents,
    issuedAt: row.issued_at.toISOString(),
    paidAt: row.paid_at?.toISOString() ?? null,
  };
}

function contractForSchedule(row: ContractRow): InvoiceScheduleContract {
  return {
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    termMonths: row.term_months,
    monthlyNetRentCents: row.monthly_net_rent_cents,
  };
}

function assertCompleteSchedule(rows: InvoiceRow[], termMonths: number): InvoiceRow[] {
  if (rows.length !== termMonths || rows.some((row, index) => row.sequence !== index + 1)) {
    throw new Error('Stored invoice schedule is incomplete or out of sequence');
  }
  return rows;
}

function invoiceRowData(contractId: string, invoice: ScheduledInvoice) {
  return {
    id: randomUUID(),
    contract_id: contractId,
    sequence: invoice.sequence,
    status: 'issued',
    period_start: invoice.periodStart,
    period_end: invoice.periodEnd,
    due_on: invoice.dueOn,
    net_rent_cents: invoice.netRentCents,
    vat_rate_basis_points: invoice.vatRateBasisPoints,
    vat_cents: invoice.vatCents,
    total_cents: invoice.totalCents,
  };
}

async function findContract(db: PrismaClient, contractId: string): Promise<ContractRow | null> {
  return db.contract.findUnique({ where: { id: contractId } });
}

/** Generates the complete invoice schedule from the contract's locked rent. */
export async function generateInvoices(
  db: PrismaClient,
  input: InvoiceGenerationRequest & { contractId: string }
): Promise<InvoiceGenerationResult> {
  const contract = await findContract(db, input.contractId);
  if (!contract) return { ok: false, reason: 'contract_not_found' };
  if (contract.status !== 'active') {
    return { ok: false, reason: 'contract_not_active', status: contract.status };
  }

  const existing = await db.invoice.findMany({
    where: { contract_id: contract.id },
    orderBy: { sequence: 'asc' },
  });
  if (existing.length > 0) {
    return {
      ok: true,
      created: false,
      invoices: assertCompleteSchedule(existing, contract.term_months).map(toInvoiceRecord),
    };
  }

  const vatRates = await loadVatRates();
  const schedule = invoiceScheduleFor(contractForSchedule(contract), vatRates);
  if (!schedule.ok) return schedule;

  try {
    const rows = await withAudit(
      db,
      {
        actor: input.actor,
        action: 'invoices.generated',
        entityType: 'contract',
        entityId: contract.id,
        details: {
          invoiceCount: schedule.invoices.length,
          firstDueOn: schedule.invoices[0]?.dueOn,
          lastDueOn: schedule.invoices.at(-1)?.dueOn,
          monthlyNetRentCents: contract.monthly_net_rent_cents,
        },
      },
      async (tx) => {
        const concurrent = await tx.invoice.findMany({
          where: { contract_id: contract.id },
          orderBy: { sequence: 'asc' },
        });
        if (concurrent.length > 0) throw new InvoiceScheduleAlreadyExists(concurrent);

        const created: InvoiceRow[] = [];
        for (const invoice of schedule.invoices) {
          created.push(await tx.invoice.create({ data: invoiceRowData(contract.id, invoice) }));
        }
        return created;
      }
    );

    return { ok: true, created: true, invoices: rows.map(toInvoiceRecord) };
  } catch (error) {
    if (error instanceof InvoiceScheduleAlreadyExists) {
      return {
        ok: true,
        created: false,
        invoices: assertCompleteSchedule(error.rows, contract.term_months).map(toInvoiceRecord),
      };
    }
    throw error;
  }
}

/** Returns an already-generated schedule without changing any data. */
export async function listInvoices(
  db: PrismaClient,
  contractId: string
): Promise<InvoiceListResult> {
  const contract = await findContract(db, contractId);
  if (!contract) return { ok: false, reason: 'contract_not_found' };

  const rows = await db.invoice.findMany({
    where: { contract_id: contractId },
    orderBy: { sequence: 'asc' },
  });
  if (rows.length === 0) return { ok: false, reason: 'invoice_schedule_not_generated' };

  return {
    ok: true,
    invoices: assertCompleteSchedule(rows, contract.term_months).map(toInvoiceRecord),
  };
}
