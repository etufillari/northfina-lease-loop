// Issuing and showing invoices. An issued invoice is stored with its VAT rate and amounts and
// is never recalculated. Later invoices stay a forecast until their date, so a VAT change
// announced after signing still reaches every invoice it applies to.
import { randomUUID } from 'node:crypto';
import type { Invoice as InvoiceRow } from '@/generated/prisma/client';
import {
  buildInvoiceSchedule,
  invoicesDueBy,
  sumInvoices,
  withVatChanges,
  type InvoiceLine,
  type InvoiceTotals,
  type VatChange,
} from '@/domain/invoicing';
import { withAudit } from './audit';
import { refusal, type PricingData } from './pricing-data';
import type { PrismaClient } from './prisma-client';

export type Invoice = InvoiceLine & {
  status: 'issued' | 'forecast';
  /** Set on the first invoice at a new VAT rate, to explain why the total moved. */
  vatChange: VatChange | null;
};

export type InvoiceTimeline = {
  contractId: string;
  invoices: Invoice[];
  /** Everything over the whole contract, issued and forecast. */
  totals: InvoiceTotals;
  issuedTotals: InvoiceTotals;
  contractNetTotalCents: number;
  /** True when the net of all invoices equals the contract total, to the cent. */
  reconciled: boolean;
};

export function toInvoiceRowData(contractId: string, line: InvoiceLine) {
  return {
    id: randomUUID(),
    contract_id: contractId,
    sequence: line.sequence,
    kind: line.kind,
    invoice_date: line.invoiceDate,
    due_date: line.dueDate,
    period_start: line.periodStart,
    period_end: line.periodEnd,
    net_cents: line.netCents,
    vat_rate_percent: line.vatRatePercent,
    vat_cents: line.vatCents,
    gross_cents: line.grossCents,
  };
}

function toInvoiceLine(row: InvoiceRow): InvoiceLine {
  return {
    sequence: row.sequence,
    kind: row.kind === 'down_payment' ? 'down_payment' : 'rent',
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    netCents: row.net_cents,
    vatRatePercent: row.vat_rate_percent,
    vatCents: row.vat_cents,
    grossCents: row.gross_cents,
  };
}

async function scheduleFor(db: PrismaClient, data: PricingData, contractId: string) {
  const contract = await db.contract.findUnique({ where: { id: contractId } });
  if (!contract) throw refusal('contract_not_found');

  // Only locked values from the contract go in. The price lists are never read here.
  const schedule = buildInvoiceSchedule(
    {
      startDate: contract.start_date,
      termMonths: contract.term_months,
      monthlyNetRentCents: contract.monthly_net_rent_cents,
      downPaymentCents: contract.down_payment_cents,
    },
    data.vatRates
  );
  if (!schedule.ok) throw refusal(schedule.reason, { date: schedule.date });
  return { contract, schedule: schedule.invoices };
}

/** The whole contract: stored invoices as they were issued, forecasts for the rest. */
export async function getInvoiceTimeline(
  db: PrismaClient,
  data: PricingData,
  contractId: string
): Promise<InvoiceTimeline> {
  const { contract, schedule } = await scheduleFor(db, data, contractId);
  const rows = await db.invoice.findMany({
    where: { contract_id: contractId },
    orderBy: { sequence: 'asc' },
  });

  const issued = rows.map(toInvoiceLine);
  const issuedSequences = new Set(issued.map((line) => line.sequence));
  const merged = [
    ...issued.map((line) => ({ ...line, status: 'issued' as const })),
    ...schedule
      .filter((line) => !issuedSequences.has(line.sequence))
      .map((line) => ({ ...line, status: 'forecast' as const })),
  ].sort((a, b) => a.sequence - b.sequence);

  const totals = sumInvoices(merged);
  return {
    contractId,
    invoices: withVatChanges(merged),
    totals,
    issuedTotals: sumInvoices(issued),
    contractNetTotalCents: contract.contract_net_total_cents,
    reconciled: totals.netCents === contract.contract_net_total_cents,
  };
}

/**
 * Issues every invoice dated on or before `asOf` that does not exist yet. Calling it again
 * adds nothing and writes no audit row; the unique key on (contract, sequence) backs this up.
 */
export async function issueInvoices(
  db: PrismaClient,
  data: PricingData,
  input: { contractId: string; asOf: string; actor: string }
): Promise<{ issued: number[] }> {
  const { schedule } = await scheduleFor(db, data, input.contractId);
  const existing = await db.invoice.findMany({
    where: { contract_id: input.contractId },
    select: { sequence: true },
  });
  const existingSequences = new Set(existing.map((row) => row.sequence));
  const missing = invoicesDueBy(schedule, input.asOf).filter(
    (line) => !existingSequences.has(line.sequence)
  );
  if (missing.length === 0) return { issued: [] };

  const issued = missing.map((line) => line.sequence);
  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'invoice.issued',
      entityType: 'contract',
      entityId: input.contractId,
      details: { asOf: input.asOf, sequences: issued },
    },
    (tx) =>
      tx.invoice.createMany({
        data: missing.map((line) => toInvoiceRowData(input.contractId, line)),
      })
  );
  return { issued };
}
