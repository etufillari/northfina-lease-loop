// The invoices slice's event handlers. CONTRACT_SIGNED builds the schedule from the signed
// terms (D2–D5) and writes it in the signing transaction; if the schedule cannot be built (no
// VAT rate on a day) the handler throws and the signing rolls back. Registered at import time;
// src/server/event-handlers.ts imports this module.
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import type { EventOf } from '@/domain/events';
import { earlyExitCost, exitBilling, type ExitMode } from '@/domain/exits';
import { buildSchedule } from '@/domain/invoicing';
import { invoiceRowSchema } from '@/domain/rows/invoice';
import { invoiceKindSchema, invoiceStatusSchema } from '@/domain/statuses';
import type { TransactionClient } from './audit';
import { onEvent } from './events';
import { parseRow } from './row-rules';
import { loadExitData, planInputOf, readExitContext, type ExitData } from './exit-data';
import { writeSchedule } from './invoices';

/** Writes the schedule of a just-signed contract, invoice 0 on the signing day (D5). */
export async function handleContractSigned(
  tx: TransactionClient,
  event: EventOf<'CONTRACT_SIGNED'>,
  vatRates?: VatRates
): Promise<number> {
  const schedule = buildSchedule({
    signedOn: event.signedOn,
    startDate: event.startDate,
    termMonths: event.termMonths,
    downPaymentCents: event.downPaymentCents,
    monthlyNetCents: event.netRentCents,
    vatRates: vatRates ?? (await loadVatRates()),
  });
  if (!schedule.ok) {
    throw new Error(`No VAT rate on ${schedule.date} for contract ${event.contractId}`);
  }
  return writeSchedule(tx, event.contractId, schedule.invoices);
}

onEvent('CONTRACT_SIGNED', (tx, event) => handleContractSigned(tx, event));

// The exits (docs/features/exits.md). CONTRACT_BOUGHT_OUT, UNIT_RETURNED and UNIT_PASSED_ON
// bill the exit from the event: the cost is planned again from the same rows and data the
// exit used (src/server/exit-data.ts), inside the exit's transaction, so the invoice is the
// amount the customer was shown. A buy whose recomputed price is not the event's amount
// throws and the exit rolls back. The unpaid rents are cancelled, the buyout or early-exit
// invoice is added after the last sequence; nothing is billed when the plan says so.

type ExitEvent =
  EventOf<'CONTRACT_BOUGHT_OUT'> | EventOf<'UNIT_RETURNED'> | EventOf<'UNIT_PASSED_ON'>;

const MODE_OF = {
  CONTRACT_BOUGHT_OUT: 'buy',
  UNIT_RETURNED: 'return',
  UNIT_PASSED_ON: 'pass_on',
} as const satisfies Record<ExitEvent['type'], ExitMode>;

/** Bills an exit and cancels the rents it replaces. Returns the new invoice's id, or null. */
export async function handleExit(
  tx: TransactionClient,
  event: ExitEvent,
  data?: ExitData
): Promise<string | null> {
  const context = await readExitContext(tx, event.contractId);
  if (!context) throw new Error(`Exit of unknown contract ${event.contractId}`);
  const mode = MODE_OF[event.type];
  const reported =
    event.type === 'CONTRACT_BOUGHT_OUT'
      ? { condition: context.asset.condition, usage: context.asset.usage }
      : { condition: event.condition, usage: event.usage };
  const input = planInputOf(context, data ?? (await loadExitData()), {
    mode,
    today: event.date,
    reported,
  });
  const cost = earlyExitCost({ ...input, invoices: context.invoices, reported });
  if (event.type === 'CONTRACT_BOUGHT_OUT' && cost.buy.totalCents !== event.amountCents) {
    throw new Error(
      `Buyout of ${event.contractId}: the event says ${event.amountCents}, the plan ${cost.buy.totalCents}`
    );
  }
  const billing = exitBilling({
    mode,
    cost,
    today: event.date,
    invoices: input.invoices,
    vatRates: input.vatRates,
  });
  if (!billing.ok)
    throw new Error(`No VAT rate on ${event.date} for the exit of ${event.contractId}`);

  if (billing.cancelInvoiceIds.length > 0) {
    // D23: both statuses parsed before the write; only a still-unpaid rent is cancelled.
    const { count } = await tx.invoice.updateMany({
      where: { id: { in: billing.cancelInvoiceIds }, status: invoiceStatusSchema.parse('issued') },
      data: { status: invoiceStatusSchema.parse('cancelled') },
    });
    if (count !== billing.cancelInvoiceIds.length) {
      throw new Error(`A rent of ${event.contractId} was paid while it was being cancelled`);
    }
  }
  const { invoice } = billing;
  if (!invoice) return null;
  const last = await tx.invoice.aggregate({
    where: { contract_id: event.contractId },
    _max: { sequence: true },
  });
  const created = await tx.invoice.create({
    // D27: the row parsed first (no period, VAT from the net, gross = net + VAT).
    data: parseRow('invoice', invoiceRowSchema, {
      contract_id: event.contractId,
      sequence: (last._max.sequence ?? 0) + 1,
      period_start: null,
      period_end: null,
      issue_date: invoice.issueDate,
      due_date: invoice.dueDate,
      net_cents: invoice.netCents,
      vat_rate_bp: invoice.vatRateBasisPoints,
      vat_cents: invoice.vatCents,
      gross_cents: invoice.grossCents,
      kind: invoiceKindSchema.parse(invoice.kind),
      status: invoiceStatusSchema.parse('issued'),
    }),
  });
  return created.id;
}

onEvent('CONTRACT_BOUGHT_OUT', (tx, event) => handleExit(tx, event));
onEvent('UNIT_RETURNED', (tx, event) => handleExit(tx, event));
onEvent('UNIT_PASSED_ON', (tx, event) => handleExit(tx, event));
