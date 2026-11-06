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
import {
  handoverReportFields,
  passOnRecipientSchema,
  recordPassOn,
  resolvePassOn,
  type PassOnServiceFailure,
} from './pass-on';
import { z } from 'zod';

const endOfTermBase = {
  completedOn: isoDateSchema,
  actor: z.string().trim().min(1).max(100),
};

export const endOfTermRequestSchema = z.discriminatedUnion('action', [
  z.strictObject({ ...endOfTermBase, action: z.literal('bought'), buyoutPaidCents: centsSchema }),
  z.strictObject({ ...endOfTermBase, action: z.literal('returned') }),
  z.strictObject({
    ...endOfTermBase,
    ...handoverReportFields,
    action: z.literal('passed_on'),
    recipient: passOnRecipientSchema,
  }),
]);

export type EndOfTermRequest = z.infer<typeof endOfTermRequestSchema>;

export type EndOfTermServiceFailure =
  | { ok: false; reason: 'contract_not_found' }
  | { ok: false; reason: 'invoice_schedule_not_generated' }
  | { ok: false; reason: 'asset_not_reserved'; status: string }
  | PassOnServiceFailure
  | EndOfTermFailure;

export type EndOfTermAvailability =
  | { status: 'ready' }
  | {
      status: 'blocked';
      reason:
        | 'contract_not_active'
        | 'term_not_finished'
        | 'rent_balance_outstanding'
        | 'invoice_schedule_not_generated';
      outstandingRentCents: number;
    };

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

export function outstandingRentCents(
  invoices: readonly InvoiceWithPayments[],
  asOf: string
): number {
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

export function hasCompleteInvoiceSchedule(
  row: Pick<ContractRow, 'term_months'> & { invoices: Pick<InvoiceRow, 'sequence'>[] }
): boolean {
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

/** Says whether the customer can choose today, and why not, for the contract page. */
export function endOfTermAvailabilityFor(
  row: ContractWithInvoices,
  asOf: string
): EndOfTermAvailability {
  const outstanding = outstandingRentCents(row.invoices, asOf);
  const decision = decide(row, { action: 'returned', completedOn: asOf, actor: 'availability' });
  if (decision.ok) {
    return hasCompleteInvoiceSchedule(row)
      ? { status: 'ready' }
      : {
          status: 'blocked',
          reason: 'invoice_schedule_not_generated',
          outstandingRentCents: outstanding,
        };
  }
  if (
    decision.reason === 'contract_not_active' ||
    decision.reason === 'term_not_finished' ||
    decision.reason === 'rent_balance_outstanding'
  ) {
    return { status: 'blocked', reason: decision.reason, outstandingRentCents: outstanding };
  }
  return { status: 'blocked', reason: 'contract_not_active', outstandingRentCents: outstanding };
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
          recipientType: input.action === 'passed_on' ? input.recipient.type : null,
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

        const passOnDetails =
          input.action === 'passed_on'
            ? {
                condition: input.condition,
                usageValue: input.usageValue,
                recipient: input.recipient,
                completedOn: input.completedOn,
                actor: input.actor,
              }
            : null;
        const resolvedPassOn = passOnDetails ? await resolvePassOn(tx, asset, passOnDetails) : null;
        if (resolvedPassOn && !resolvedPassOn.ok) {
          throw new EndOfTermTransactionFailure(resolvedPassOn);
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
        const passOnRecord =
          passOnDetails && resolvedPassOn
            ? await recordPassOn(tx, current, passOnDetails, resolvedPassOn)
            : null;
        if (!passOnRecord) {
          await tx.asset.update({
            where: { id: current.asset_id },
            data: { status: currentDecision.assetStatus },
          });
        }
        await tx.assetHistory.create({
          data: {
            asset_id: current.asset_id,
            contract_id: current.id,
            event_type: currentDecision.historyEvent,
            occurred_on: input.completedOn,
            from_status: 'reserved',
            to_status: currentDecision.assetStatus,
            condition: passOnDetails?.condition ?? null,
            usage_unit: passOnDetails ? asset.usage_unit : null,
            usage_value: passOnDetails?.usageValue ?? null,
            actor: input.actor,
            details_json: passOnRecord ? JSON.stringify(passOnRecord) : null,
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
