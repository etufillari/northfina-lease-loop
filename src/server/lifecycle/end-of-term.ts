import type { Contract as ContractRow, Invoice as InvoiceRow } from '@/generated/prisma/client';
import {
  contractStatusSchema,
  centsSchema,
  endOfTermActionSchema,
  isoDateSchema,
} from '@/data/schemas';
import {
  endOfTermFor,
  type EndOfTermDecision,
  type EndOfTermFailure,
} from '@/domain/lifecycle/end-of-term';
import { paymentStateFor } from '@/domain/invoicing/payments';
import { withAudit, type TransactionClient } from '../audit';
import type { PrismaClient } from '../prisma-client';
import { z } from 'zod';

const endOfTermBase = {
  completedOn: isoDateSchema,
  actor: z.string().trim().min(1).max(100),
};

export const endOfTermRequestSchema = z.discriminatedUnion('action', [
  z.strictObject({ ...endOfTermBase, action: z.literal('bought'), buyoutPaidCents: centsSchema }),
  z.strictObject({ ...endOfTermBase, action: z.literal('returned') }),
  z.strictObject({ ...endOfTermBase, action: z.literal('passed_on') }),
]);

export type EndOfTermRequest = z.infer<typeof endOfTermRequestSchema>;

export type EndOfTermServiceFailure =
  | { ok: false; reason: 'contract_not_found' }
  | { ok: false; reason: 'invoice_schedule_not_generated' }
  | { ok: false; reason: 'asset_not_reserved'; status: string }
  | EndOfTermFailure;

export type CompletedContract = {
  id: string;
  assetId: string;
  status: 'completed';
  action: 'bought' | 'returned' | 'passed_on';
  completedOn: string;
  buyoutCents: number;
  buyoutPaidCents: number | null;
};

export type EndOfTermResult = { ok: true; contract: CompletedContract } | EndOfTermServiceFailure;

type InvoiceWithPayments = InvoiceRow & {
  payments: { amount_cents: number; paid_on: string }[];
};

type ContractWithInvoices = ContractRow & {
  invoices: InvoiceWithPayments[];
};

class EndOfTermTransactionFailure extends Error {
  constructor(readonly failure: EndOfTermServiceFailure) {
    super('The contract changed while completing its term');
    this.name = 'EndOfTermTransactionFailure';
  }
}

function outstandingRentCents(invoices: readonly InvoiceWithPayments[], asOf: string): number {
  return invoices.reduce((total, invoice) => {
    const state = paymentStateFor({
      totalCents: invoice.total_cents,
      dueOn: invoice.due_on,
      payments: invoice.payments.map((payment) => ({
        amountCents: payment.amount_cents,
        paidOn: payment.paid_on,
      })),
      asOf,
    });
    return total + state.remainingCents;
  }, 0);
}

function hasCompleteInvoiceSchedule(row: ContractWithInvoices): boolean {
  return (
    row.invoices.length === row.term_months &&
    row.invoices.every((invoice, index) => invoice.sequence === index + 1)
  );
}

function decide(row: ContractWithInvoices, input: EndOfTermRequest): EndOfTermDecision {
  return endOfTermFor({
    action: input.action,
    contractStatus: contractStatusSchema.parse(row.status),
    endsOn: row.ends_on,
    completedOn: input.completedOn,
    outstandingRentCents: outstandingRentCents(row.invoices, input.completedOn),
    buyoutCents: row.buyout_cents,
    buyoutPaidCents: input.action === 'bought' ? input.buyoutPaidCents : undefined,
  });
}

function toCompletedContract(row: ContractRow): CompletedContract {
  return {
    id: row.id,
    assetId: row.asset_id,
    status: 'completed',
    action: endOfTermActionSchema.parse(row.end_of_term_action),
    completedOn: row.completed_on ?? '',
    buyoutCents: row.buyout_cents,
    buyoutPaidCents: row.buyout_paid_cents,
  };
}

async function findContract(
  db: PrismaClient | TransactionClient,
  contractId: string
): Promise<ContractWithInvoices | null> {
  return db.contract.findUnique({
    where: { id: contractId },
    include: { invoices: { include: { payments: true }, orderBy: { sequence: 'asc' } } },
  });
}

/** Completes an active contract and moves its asset in one audited transaction. */
export async function completeContract(
  db: PrismaClient,
  contractId: string,
  input: EndOfTermRequest
): Promise<EndOfTermResult> {
  const existing = await findContract(db, contractId);
  if (!existing) return { ok: false, reason: 'contract_not_found' };
  if (!hasCompleteInvoiceSchedule(existing)) {
    return { ok: false, reason: 'invoice_schedule_not_generated' };
  }

  const decision = decide(existing, input);
  if (!decision.ok) return decision;

  try {
    const result = await withAudit(
      db,
      {
        actor: input.actor,
        action: 'contract.completed',
        entityType: 'contract',
        entityId: contractId,
        details: {
          action: input.action,
          completedOn: input.completedOn,
          assetId: existing.asset_id,
          assetStatus: { from: 'reserved', to: decision.assetStatus },
          buyoutCents: existing.buyout_cents,
          buyoutPaidCents: decision.buyoutPaidCents,
        },
      },
      async (tx) => {
        const current = await findContract(tx, contractId);
        if (!current) {
          throw new EndOfTermTransactionFailure({ ok: false, reason: 'contract_not_found' });
        }
        if (!hasCompleteInvoiceSchedule(current)) {
          throw new EndOfTermTransactionFailure({
            ok: false,
            reason: 'invoice_schedule_not_generated',
          });
        }

        const currentDecision = decide(current, input);
        if (!currentDecision.ok) throw new EndOfTermTransactionFailure(currentDecision);

        const asset = await tx.asset.findUnique({ where: { id: current.asset_id } });
        if (!asset || asset.status !== 'reserved') {
          throw new EndOfTermTransactionFailure({
            ok: false,
            reason: 'asset_not_reserved',
            status: asset?.status ?? 'missing',
          });
        }

        const updatedContract = await tx.contract.update({
          where: { id: current.id },
          data: {
            status: 'completed',
            end_of_term_action: input.action,
            buyout_paid_cents: currentDecision.buyoutPaidCents,
            completed_on: input.completedOn,
          },
        });
        await tx.asset.update({
          where: { id: current.asset_id },
          data: { status: currentDecision.assetStatus },
        });
        await tx.assetHistory.create({
          data: {
            asset_id: current.asset_id,
            contract_id: current.id,
            event_type: currentDecision.historyEvent,
            occurred_on: input.completedOn,
            from_status: 'reserved',
            to_status: currentDecision.assetStatus,
            actor: input.actor,
            details_json:
              input.action === 'passed_on' ? JSON.stringify({ action: input.action }) : null,
          },
        });

        return updatedContract;
      }
    );

    return { ok: true, contract: toCompletedContract(result) };
  } catch (error) {
    if (error instanceof EndOfTermTransactionFailure) return error.failure;
    throw error;
  }
}
