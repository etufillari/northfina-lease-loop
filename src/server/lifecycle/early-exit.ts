import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  centsSchema,
  earlyExitActionSchema,
  isoDateSchema,
  type AssetCondition,
  type AssetCategory,
} from '@/data/schemas';
import { loadResidualCurves, loadVatRates } from '@/data/load';
import {
  earlyExitQuoteFor,
  nextInvoiceDateAfter,
  type EarlyExitQuote,
} from '@/domain/lifecycle/early-exit';
import { paymentStateFor } from '@/domain/invoicing/payments';
import { vatOn } from '@/domain/pricing/vat';
import { withAudit, type TransactionClient } from '../audit';
import type { PrismaClient } from '../prisma-client';

const earlyExitRequestFields = {
  action: earlyExitActionSchema,
  requestedOn: isoDateSchema,
};

export const earlyExitQuoteRequestSchema = z.strictObject(earlyExitRequestFields);
export type EarlyExitQuoteRequest = z.infer<typeof earlyExitQuoteRequestSchema>;

export const earlyExitCreationRequestSchema = z.strictObject({
  ...earlyExitRequestFields,
  actor: z.string().trim().min(1).max(100),
});
export type EarlyExitCreationRequest = z.infer<typeof earlyExitCreationRequestSchema>;

export const earlyExitProcessRequestSchema = z.strictObject({
  processedOn: isoDateSchema,
  settlementPaidCents: centsSchema,
  actor: z.string().trim().min(1).max(100),
});
export type EarlyExitProcessRequest = z.infer<typeof earlyExitProcessRequestSchema>;

type EarlyExitSnapshot = {
  quote: EarlyExitQuote;
  vatRateBasisPoints: number;
  vatCents: number;
  settlementTotalCents: number;
  asset: {
    category: AssetCategory;
    condition: AssetCondition;
    usageValue: number;
  };
};

type EarlyExitResponse = {
  id?: string;
  contractId: string;
  status: 'pending' | 'completed';
  requestedOn: string;
  effectiveOn: string;
  action: 'bought' | 'returned';
  quote: EarlyExitQuote;
  vatRateBasisPoints: number;
  vatCents: number;
  settlementTotalCents: number;
  settlementPaidCents: number | null;
  completedOn: string | null;
};

export type EarlyExitFailure =
  | { ok: false; reason: 'contract_not_found' }
  | { ok: false; reason: 'contract_not_active'; status: string }
  | { ok: false; reason: 'invoice_schedule_not_generated' }
  | { ok: false; reason: 'asset_not_reserved'; status: string }
  | { ok: false; reason: 'interest_snapshot_missing' }
  | { ok: false; reason: 'request_before_start' }
  | { ok: false; reason: 'early_exit_not_available' }
  | { ok: false; reason: 'no_vat_rate_on_date'; effectiveOn: string }
  | { ok: false; reason: 'early_exit_request_exists'; requestId: string }
  | { ok: false; reason: 'early_exit_request_not_found' }
  | { ok: false; reason: 'early_exit_request_not_pending'; status: string }
  | { ok: false; reason: 'early_exit_not_due'; effectiveOn: string; processedOn: string }
  | {
      ok: false;
      reason: 'settlement_amount_mismatch';
      expectedCents: number;
      receivedCents: number;
    }
  | { ok: false; reason: 'rent_balance_outstanding'; outstandingRentCents: number }
  | { ok: false; reason: 'future_invoice_paid' }
  | { ok: false; reason: 'asset_snapshot_changed' }
  | { ok: false; reason: 'asset_not_reserved_at_processing'; status: string };

type ContractGraph = Awaited<ReturnType<typeof findContract>>;

class EarlyExitRequestExists extends Error {
  constructor(readonly requestId: string) {
    super('An early-exit request already exists for this contract');
    this.name = 'EarlyExitRequestExists';
  }
}

class EarlyExitTransactionFailure extends Error {
  constructor(readonly failure: EarlyExitFailure) {
    super('The contract changed while processing the early exit');
    this.name = 'EarlyExitTransactionFailure';
  }
}

async function findContract(db: PrismaClient | TransactionClient, contractId: string) {
  return db.contract.findUnique({
    where: { id: contractId },
    include: {
      asset: true,
      invoices: { orderBy: { sequence: 'asc' }, include: { payments: true } },
      early_exit_request: true,
    },
  });
}

function hasCompleteSchedule(contract: NonNullable<ContractGraph>): boolean {
  return (
    contract.invoices.length === contract.term_months &&
    contract.invoices.every((invoice, index) => invoice.sequence === index + 1)
  );
}

function parseSnapshot(json: string): EarlyExitSnapshot {
  return JSON.parse(json) as EarlyExitSnapshot;
}

function contractInput(contract: NonNullable<ContractGraph>) {
  if (contract.annual_interest_basis_points === null) return null;
  return {
    startsOn: contract.starts_on,
    endsOn: contract.ends_on,
    termMonths: contract.term_months,
    monthlyNetRentCents: contract.monthly_net_rent_cents,
    buyoutCents: contract.buyout_cents,
    annualInterestBasisPoints: contract.annual_interest_basis_points,
  };
}

function vatDetails(
  settlementNetCents: number,
  effectiveOn: string,
  rates: Awaited<ReturnType<typeof loadVatRates>>
) {
  const vat = vatOn(rates, settlementNetCents, effectiveOn);
  if (!vat.ok) return { ok: false as const, reason: 'no_vat_rate_on_date' as const };
  return {
    ok: true as const,
    vatRateBasisPoints: Math.round(vat.ratePercent * 100),
    vatCents: vat.vatCents,
    settlementTotalCents: vat.grossCents,
  };
}

async function calculateQuote(
  contract: NonNullable<ContractGraph>,
  input: EarlyExitQuoteRequest
): Promise<{ ok: true; snapshot: EarlyExitSnapshot } | EarlyExitFailure> {
  if (contract.status !== 'active') {
    return { ok: false, reason: 'contract_not_active', status: contract.status };
  }
  if (!hasCompleteSchedule(contract))
    return { ok: false, reason: 'invoice_schedule_not_generated' };
  if (contract.asset.status !== 'reserved') {
    return { ok: false, reason: 'asset_not_reserved', status: contract.asset.status };
  }

  const contractData = contractInput(contract);
  if (!contractData) return { ok: false, reason: 'interest_snapshot_missing' };
  if (input.requestedOn < contract.starts_on) return { ok: false, reason: 'request_before_start' };
  if (input.requestedOn >= contract.ends_on)
    return { ok: false, reason: 'early_exit_not_available' };

  const effectiveOn = nextInvoiceDateAfter(
    contract.starts_on,
    contract.term_months,
    input.requestedOn
  );
  if (!effectiveOn) return { ok: false, reason: 'early_exit_not_available' };

  const residualCurves = await loadResidualCurves();
  const result = earlyExitQuoteFor({
    action: input.action,
    effectiveOn,
    contract: contractData,
    asset: {
      category: contract.asset.category as AssetCategory,
      condition: contract.asset.condition as AssetCondition,
      usageValue: contract.asset.usage_value,
      firstLeasedOn: contract.asset.first_leased_on ?? contract.starts_on,
      originalListPriceCents: contract.asset.original_list_price_cents ?? contract.list_price_cents,
    },
    residualCurves,
  });
  if (!result.ok) {
    if (result.reason === 'term_finished') return { ok: false, reason: 'early_exit_not_available' };
    return { ok: false, reason: 'early_exit_not_available' };
  }

  const rates = await loadVatRates();
  const vat = vatDetails(result.quote.settlementNetCents, effectiveOn, rates);
  if (!vat.ok) return { ok: false, reason: 'no_vat_rate_on_date', effectiveOn };
  const { vatRateBasisPoints, vatCents, settlementTotalCents } = vat;

  return {
    ok: true,
    snapshot: {
      quote: result.quote,
      vatRateBasisPoints,
      vatCents,
      settlementTotalCents,
      asset: {
        category: contract.asset.category as AssetCategory,
        condition: contract.asset.condition as AssetCondition,
        usageValue: contract.asset.usage_value,
      },
    },
  };
}

function responseFromRow(
  row: NonNullable<ContractGraph>['early_exit_request'],
  contractId: string
): EarlyExitResponse {
  if (!row) throw new Error('Early-exit request is missing');
  const snapshot = parseSnapshot(row.quote_snapshot_json);
  return {
    id: row.id,
    contractId,
    status: row.status === 'completed' ? 'completed' : 'pending',
    requestedOn: row.requested_on,
    effectiveOn: row.effective_on,
    action: row.action as 'bought' | 'returned',
    quote: snapshot.quote,
    vatRateBasisPoints: row.vat_rate_basis_points,
    vatCents: row.vat_cents,
    settlementTotalCents: row.settlement_total_cents,
    settlementPaidCents: row.settlement_paid_cents,
    completedOn: row.completed_on,
  };
}

export async function quoteEarlyExit(
  db: PrismaClient,
  contractId: string,
  input: EarlyExitQuoteRequest
): Promise<{ ok: true; quote: EarlyExitSnapshot } | EarlyExitFailure> {
  const contract = await findContract(db, contractId);
  if (!contract) return { ok: false, reason: 'contract_not_found' };
  const calculated = await calculateQuote(contract, input);
  if (!calculated.ok) return calculated;
  return { ok: true, quote: calculated.snapshot };
}

export async function requestEarlyExit(
  db: PrismaClient,
  contractId: string,
  input: EarlyExitCreationRequest
): Promise<{ ok: true; request: EarlyExitResponse } | EarlyExitFailure> {
  const contract = await findContract(db, contractId);
  if (!contract) return { ok: false, reason: 'contract_not_found' };
  if (contract.early_exit_request) {
    return {
      ok: false,
      reason: 'early_exit_request_exists',
      requestId: contract.early_exit_request.id,
    };
  }

  const calculated = await calculateQuote(contract, input);
  if (!calculated.ok) return calculated;

  const requestId = randomUUID();
  try {
    const row = await withAudit(
      db,
      {
        actor: input.actor,
        action: 'contract.early_exit_requested',
        entityType: 'contract',
        entityId: contract.id,
        details: {
          requestId,
          action: input.action,
          requestedOn: input.requestedOn,
          effectiveOn: calculated.snapshot.quote.effectiveOn,
          settlementNetCents: calculated.snapshot.quote.settlementNetCents,
        },
      },
      async (tx) => {
        const current = await findContract(tx, contract.id);
        if (!current)
          throw new EarlyExitTransactionFailure({ ok: false, reason: 'contract_not_found' });
        if (current.early_exit_request)
          throw new EarlyExitRequestExists(current.early_exit_request.id);
        if (current.status !== 'active') {
          throw new EarlyExitTransactionFailure({
            ok: false,
            reason: 'contract_not_active',
            status: current.status,
          });
        }
        const created = await tx.earlyExitRequest.create({
          data: {
            id: requestId,
            contract_id: current.id,
            action: input.action,
            status: 'pending',
            requested_on: input.requestedOn,
            effective_on: calculated.snapshot.quote.effectiveOn,
            settlement_net_cents: calculated.snapshot.quote.settlementNetCents,
            vat_rate_basis_points: calculated.snapshot.vatRateBasisPoints,
            vat_cents: calculated.snapshot.vatCents,
            settlement_total_cents: calculated.snapshot.settlementTotalCents,
            quote_snapshot_json: JSON.stringify(calculated.snapshot),
          },
        });
        return created;
      }
    );

    return { ok: true, request: responseFromRow(row, contract.id) };
  } catch (error) {
    if (error instanceof EarlyExitRequestExists) {
      return { ok: false, reason: 'early_exit_request_exists', requestId: error.requestId };
    }
    if (error instanceof EarlyExitTransactionFailure) return error.failure;
    throw error;
  }
}

function preEffectiveBalance(
  contract: NonNullable<ContractGraph>,
  effectiveOn: string,
  asOf: string
): { outstandingRentCents: number; futureInvoicePaid: boolean } {
  let outstandingRentCents = 0;
  let futureInvoicePaid = false;
  for (const invoice of contract.invoices) {
    const state = paymentStateFor({
      totalCents: invoice.total_cents,
      dueOn: invoice.due_on,
      payments: invoice.payments.map((payment) => ({
        amountCents: payment.amount_cents,
        paidOn: payment.paid_on,
      })),
      asOf,
    });
    if (invoice.due_on < effectiveOn) outstandingRentCents += state.remainingCents;
    if (invoice.due_on >= effectiveOn && state.totalPaidCents > 0) futureInvoicePaid = true;
  }
  return { outstandingRentCents, futureInvoicePaid };
}

export async function processEarlyExit(
  db: PrismaClient,
  contractId: string,
  input: EarlyExitProcessRequest
): Promise<{ ok: true; termination: EarlyExitResponse } | EarlyExitFailure> {
  const contract = await findContract(db, contractId);
  if (!contract) return { ok: false, reason: 'contract_not_found' };
  const request = contract.early_exit_request;
  if (!request) return { ok: false, reason: 'early_exit_request_not_found' };
  if (request.status === 'completed') {
    return { ok: true, termination: responseFromRow(request, contract.id) };
  }
  if (request.status !== 'pending') {
    return { ok: false, reason: 'early_exit_request_not_pending', status: request.status };
  }
  if (input.processedOn < request.effective_on) {
    return {
      ok: false,
      reason: 'early_exit_not_due',
      effectiveOn: request.effective_on,
      processedOn: input.processedOn,
    };
  }
  if (input.settlementPaidCents !== request.settlement_total_cents) {
    return {
      ok: false,
      reason: 'settlement_amount_mismatch',
      expectedCents: request.settlement_total_cents,
      receivedCents: input.settlementPaidCents,
    };
  }

  const balance = preEffectiveBalance(contract, request.effective_on, input.processedOn);
  if (balance.outstandingRentCents > 0) {
    return {
      ok: false,
      reason: 'rent_balance_outstanding',
      outstandingRentCents: balance.outstandingRentCents,
    };
  }
  if (balance.futureInvoicePaid) return { ok: false, reason: 'future_invoice_paid' };

  const snapshot = parseSnapshot(request.quote_snapshot_json);
  if (
    contract.asset.condition !== snapshot.asset.condition ||
    contract.asset.usage_value !== snapshot.asset.usageValue
  ) {
    return { ok: false, reason: 'asset_snapshot_changed' };
  }
  if (contract.asset.status !== 'reserved') {
    return { ok: false, reason: 'asset_not_reserved_at_processing', status: contract.asset.status };
  }

  try {
    const completed = await withAudit(
      db,
      {
        actor: input.actor,
        action: 'contract.early_exit_completed',
        entityType: 'contract',
        entityId: contract.id,
        details: {
          requestId: request.id,
          action: request.action,
          effectiveOn: request.effective_on,
          settlementPaidCents: input.settlementPaidCents,
          assetStatus: { from: 'reserved', to: request.action === 'bought' ? 'sold' : 'returned' },
        },
      },
      async (tx) => {
        const current = await findContract(tx, contract.id);
        if (!current)
          throw new EarlyExitTransactionFailure({ ok: false, reason: 'contract_not_found' });
        const currentRequest = current.early_exit_request;
        if (!currentRequest) {
          throw new EarlyExitTransactionFailure({
            ok: false,
            reason: 'early_exit_request_not_found',
          });
        }
        if (currentRequest.status === 'completed') return currentRequest;
        if (currentRequest.status !== 'pending') {
          throw new EarlyExitTransactionFailure({
            ok: false,
            reason: 'early_exit_request_not_pending',
            status: currentRequest.status,
          });
        }
        if (current.status !== 'active') {
          throw new EarlyExitTransactionFailure({
            ok: false,
            reason: 'contract_not_active',
            status: current.status,
          });
        }
        if (current.asset.status !== 'reserved') {
          throw new EarlyExitTransactionFailure({
            ok: false,
            reason: 'asset_not_reserved_at_processing',
            status: current.asset.status,
          });
        }
        const currentBalance = preEffectiveBalance(
          current,
          currentRequest.effective_on,
          input.processedOn
        );
        if (currentBalance.outstandingRentCents > 0) {
          throw new EarlyExitTransactionFailure({
            ok: false,
            reason: 'rent_balance_outstanding',
            outstandingRentCents: currentBalance.outstandingRentCents,
          });
        }
        if (currentBalance.futureInvoicePaid) {
          throw new EarlyExitTransactionFailure({ ok: false, reason: 'future_invoice_paid' });
        }
        if (input.settlementPaidCents !== currentRequest.settlement_total_cents) {
          throw new EarlyExitTransactionFailure({
            ok: false,
            reason: 'settlement_amount_mismatch',
            expectedCents: currentRequest.settlement_total_cents,
            receivedCents: input.settlementPaidCents,
          });
        }

        await tx.invoice.updateMany({
          where: {
            contract_id: current.id,
            due_on: { gte: currentRequest.effective_on },
            status: { in: ['issued', 'overdue'] },
          },
          data: { status: 'cancelled' },
        });
        await tx.contract.update({
          where: { id: current.id },
          data: {
            status: 'terminated',
            termination_action: currentRequest.action,
            terminated_on: currentRequest.effective_on,
          },
        });
        await tx.asset.update({
          where: { id: current.asset_id },
          data: { status: currentRequest.action === 'bought' ? 'sold' : 'returned' },
        });
        await tx.assetHistory.create({
          data: {
            asset_id: current.asset_id,
            contract_id: current.id,
            event_type: currentRequest.action === 'bought' ? 'bought_out' : 'returned',
            occurred_on: currentRequest.effective_on,
            from_status: 'reserved',
            to_status: currentRequest.action === 'bought' ? 'sold' : 'returned',
            condition: current.asset.condition,
            usage_unit: current.asset.usage_unit,
            usage_value: current.asset.usage_value,
            actor: input.actor,
            details_json: JSON.stringify({
              earlyExitRequestId: currentRequest.id,
              settlementPaidCents: input.settlementPaidCents,
            }),
          },
        });
        return tx.earlyExitRequest.update({
          where: { id: currentRequest.id },
          data: {
            status: 'completed',
            settlement_paid_cents: input.settlementPaidCents,
            completed_on: input.processedOn,
          },
        });
      }
    );
    return { ok: true, termination: responseFromRow(completed, contract.id) };
  } catch (error) {
    if (error instanceof EarlyExitTransactionFailure) return error.failure;
    throw error;
  }
}
