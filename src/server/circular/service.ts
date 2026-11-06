import { monthlyFactorFor } from '@/domain/coefficient';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PrismaClient } from '@/generated/prisma/client';
import { assetConditionSchema } from '@/data/schemas';
import {
  loadCoefficientTable,
  loadPriceLists,
  loadRefurbishmentCosts,
  loadResidualCurves,
} from '@/data/load';
import {
  planRefurbishment,
  requiredWorkComplete,
  type WorkPlan,
} from '@/domain/circular/refurbishment';
import { residualValue, assetAgeMonths } from '@/domain/circular/valuation';
import { anniversary } from '@/domain/lease-engine/calendar';
import { toAsset } from '@/server/assets';
import { auditedCommand } from '@/server/lease-engine/commands';
import { EngineServiceError, type CommandContext } from '@/server/lease-engine/contracts';

const id = z.string().min(1).max(100);
function invalid(reason: string): never {
  throw new EngineServiceError('INVALID_TRANSITION', reason);
}

export async function receiveReturn(
  db: PrismaClient,
  context: CommandContext,
  input: { assetId?: string; leaseId?: string; returnId?: string; receivedOn: string }
) {
  const payload = z
    .strictObject({
      assetId: id.optional(),
      leaseId: id.optional(),
      returnId: id.optional(),
      receivedOn: z.iso.date(),
    })
    .refine((value) => Boolean(value.returnId) !== Boolean(value.assetId))
    .parse(input);
  return auditedCommand(
    db,
    context,
    'circular_receive',
    payload.returnId ?? payload.assetId ?? '',
    payload,
    async (tx) => {
      if (payload.returnId) {
        const receipt = await tx.assetReturn.findUnique({ where: { id: payload.returnId } });
        if (!receipt || receipt.status !== 'REQUESTED' || !receipt.leaseId)
          invalid('return_request_not_receivable');
        const lease = await tx.engineLease.findUnique({ where: { id: receipt.leaseId } });
        const allocation = await tx.engineAllocation.findUnique({
          where: { assetId: receipt.assetId },
        });
        if (
          !lease ||
          lease.assetId !== receipt.assetId ||
          allocation?.leaseId !== lease.id ||
          !['COMPLETED', 'TERMINATED'].includes(lease.status)
        )
          invalid('lease_not_completed_or_wrong_asset');
        const end = lease.terminatedOn
          ? { ok: true as const, value: lease.terminatedOn }
          : anniversary(lease.startDate, lease.termMonths);
        if (!end.ok || payload.receivedOn < end.value) invalid('return_before_lease_end');
        const received = await tx.assetReturn.update({
          where: { id: receipt.id },
          data: { status: 'RECEIVED', receivedOn: payload.receivedOn },
        });
        await tx.asset.update({
          where: { id: receipt.assetId },
          data: { status: 'returned' },
        });
        return received;
      }

      const assetId = payload.assetId;
      if (!assetId) invalid('asset_required');
      const asset = await tx.asset.findUnique({ where: { id: assetId } });
      if (!asset) throw new EngineServiceError('NOT_FOUND');
      if (payload.leaseId) {
        const lease = await tx.engineLease.findUnique({ where: { id: payload.leaseId } });
        const allocation = await tx.engineAllocation.findUnique({ where: { assetId: asset.id } });
        if (
          !lease ||
          lease.assetId !== asset.id ||
          allocation?.leaseId !== lease.id ||
          !['COMPLETED', 'TERMINATED'].includes(lease.status)
        )
          invalid('lease_not_completed_or_wrong_asset');
        const end = lease.terminatedOn
          ? { ok: true as const, value: lease.terminatedOn }
          : anniversary(lease.startDate, lease.termMonths);
        if (!end.ok || payload.receivedOn < end.value) invalid('return_before_lease_end');
        if (await tx.assetReturn.findUnique({ where: { leaseId: lease.id } }))
          invalid('already_returned');
      } else if (
        asset.status !== 'returned' ||
        (await tx.assetReturn.findFirst({ where: { assetId: asset.id, status: { not: 'READY' } } }))
      ) {
        invalid('not_an_imported_return');
      }
      const receipt = await tx.assetReturn.create({
        data: {
          id: randomUUID(),
          assetId: asset.id,
          leaseId: payload.leaseId ?? null,
          receivedOn: payload.receivedOn,
        },
      });
      await tx.asset.update({
        where: { id: asset.id },
        data: { status: 'returned', previous_lives: { increment: payload.leaseId ? 1 : 0 } },
      });
      return receipt;
    }
  );
}

export async function requestReturn(
  db: PrismaClient,
  context: CommandContext,
  input: { leaseId: string; customerId: string; usageValue: number; requestedOn: string }
) {
  const payload = z
    .strictObject({
      leaseId: id,
      customerId: id,
      usageValue: z.number().int().nonnegative().max(2_147_483_647),
      requestedOn: z.iso.date(),
    })
    .parse(input);
  return auditedCommand(
    db,
    context,
    'circular_request_return',
    payload.leaseId,
    payload,
    async (tx) => {
      const lease = await tx.engineLease.findUnique({ where: { id: payload.leaseId } });
      if (!lease || lease.customerId !== payload.customerId)
        throw new EngineServiceError('NOT_FOUND');
      if (!['COMPLETED', 'TERMINATED'].includes(lease.status))
        invalid('lease_not_ready_for_return');
      const settlement = await tx.leaseSettlement.findUnique({
        where: { leaseId: lease.id },
      });
      if (settlement?.option === 'BUYOUT') invalid('bought_out_asset_cannot_be_returned');
      const asset = await tx.asset.findUnique({ where: { id: lease.assetId } });
      if (!asset) throw new EngineServiceError('NOT_FOUND');
      if (payload.usageValue < asset.usage_value) invalid('usage_cannot_decrease');
      const end = lease.terminatedOn
        ? { ok: true as const, value: lease.terminatedOn }
        : anniversary(lease.startDate, lease.termMonths);
      if (!end.ok || payload.requestedOn < end.value) invalid('return_before_lease_end');
      if (await tx.assetReturn.findUnique({ where: { leaseId: lease.id } }))
        invalid('already_returned');
      const allocation = await tx.engineAllocation.findUnique({ where: { assetId: asset.id } });
      if (allocation?.leaseId !== lease.id) invalid('allocation_missing_or_wrong_life');
      const receipt = await tx.assetReturn.create({
        data: {
          id: randomUUID(),
          assetId: asset.id,
          leaseId: lease.id,
          requestedOn: payload.requestedOn,
          receivedOn: null,
          usageValue: payload.usageValue,
          status: 'REQUESTED',
        },
      });
      await tx.asset.update({
        where: { id: asset.id },
        data: {
          status: 'returned',
          usage_value: payload.usageValue,
          previous_lives: { increment: 1 },
          reserved_by: null,
          reserved_until: null,
        },
      });
      return receipt;
    }
  );
}

export async function inspectReturn(
  db: PrismaClient,
  context: CommandContext,
  input: { returnId: string; condition: string; usageValue: number; target?: string }
) {
  const payload = z
    .strictObject({
      returnId: id,
      condition: assetConditionSchema,
      usageValue: z.number().int().nonnegative().max(2_147_483_647),
      target: z.enum(['good', 'like_new']).default('good'),
    })
    .parse(input);
  const costs = await loadRefurbishmentCosts();
  return auditedCommand(db, context, 'circular_inspect', payload.returnId, payload, async (tx) => {
    const receipt = await tx.assetReturn.findUnique({ where: { id: payload.returnId } });
    if (!receipt) throw new EngineServiceError('NOT_FOUND');
    if (receipt.status !== 'RECEIVED') invalid('already_inspected');
    const asset = await tx.asset.findUniqueOrThrow({ where: { id: receipt.assetId } });
    if (payload.usageValue < asset.usage_value)
      invalid('usage_cannot_decrease_without_replacement');
    const plan = planRefurbishment(
      {
        ...toAsset(asset),
        condition: payload.condition,
        usage: { unit: toAsset(asset).usage.unit, value: payload.usageValue },
      },
      costs,
      payload.target
    );
    await tx.asset.update({
      where: { id: asset.id },
      data: { condition: payload.condition, usage_value: payload.usageValue },
    });
    return tx.assetReturn.update({
      where: { id: receipt.id },
      data: {
        status: 'INSPECTED',
        condition: payload.condition,
        usageValue: payload.usageValue,
        planJson: JSON.stringify(plan),
      },
    });
  });
}

export async function finishRefurbishment(
  db: PrismaClient,
  context: CommandContext,
  input: { returnId: string; completedWorkIds: string[]; completedOn: string }
) {
  const payload = z
    .strictObject({ returnId: id, completedWorkIds: z.array(id), completedOn: z.iso.date() })
    .parse(input);
  const [curves, prices, coefficients] = await Promise.all([
    loadResidualCurves(),
    loadPriceLists(),
    loadCoefficientTable(),
  ]);
  return auditedCommand(db, context, 'circular_finish', payload.returnId, payload, async (tx) => {
    const receipt = await tx.assetReturn.findUnique({ where: { id: payload.returnId } });
    if (!receipt) throw new EngineServiceError('NOT_FOUND');
    if (
      receipt.status !== 'INSPECTED' ||
      !receipt.planJson ||
      !receipt.receivedOn ||
      payload.completedOn < receipt.receivedOn
    )
      invalid('invalid_refurbishment_state_or_date');
    const plan: WorkPlan = JSON.parse(receipt.planJson);
    if (!requiredWorkComplete(plan, payload.completedWorkIds)) invalid('mandatory_work_incomplete');
    const asset = await tx.asset.findUniqueOrThrow({ where: { id: receipt.assetId } });
    if (asset.status !== 'returned') invalid('asset_not_returned');
    const firstContract = await tx.contract.findFirst({
      where: { asset_id: asset.id },
      orderBy: { start_date: 'asc' },
    });
    const originalNet =
      firstContract && firstContract.financed_cents > 0
        ? firstContract.financed_cents + firstContract.down_payment_cents
        : (prices.find((list) => list.version === firstContract?.price_list_version) ?? prices[0])
            ?.prices[asset.id];
    if (originalNet === undefined) invalid('original_price_missing');
    const restored = {
      ...toAsset(asset),
      condition: plan.resultingCondition,
      usage: { unit: toAsset(asset).usage.unit, value: plan.resultingUsage },
    };
    const offerNet = residualValue(
      restored,
      originalNet,
      assetAgeMonths(asset.model_year, payload.completedOn),
      curves
    );
    const financeable = monthlyFactorFor(coefficients, offerNet, 36).ok;
    // Keep the allocation until company approval publishes the next offer.
    await tx.asset.update({
      where: { id: asset.id },
      data: {
        status: 'returned',
        condition: plan.resultingCondition,
        usage_value: plan.resultingUsage,
        reserved_by: null,
        reserved_until: null,
      },
    });
    const completed = await tx.assetReturn.update({
      where: { id: receipt.id },
      data: {
        status: financeable ? 'PENDING_APPROVAL' : 'REVIEW_REQUIRED',
        completedOn: payload.completedOn,
        costCents: plan.costCents,
        offerNetCents: offerNet,
      },
    });
    return { receipt: completed, offer: null };
  });
}

export async function reviewRefurbishment(
  db: PrismaClient,
  context: CommandContext,
  input: {
    returnId: string;
    decision: 'APPROVE' | 'REJECT';
    reviewedOn: string;
    reason?: string;
  }
) {
  const payload = z
    .strictObject({
      returnId: id,
      decision: z.enum(['APPROVE', 'REJECT']),
      reviewedOn: z.iso.date(),
      reason: z.string().trim().min(1).max(500).optional(),
    })
    .refine((value) => value.decision !== 'REJECT' || Boolean(value.reason))
    .parse(input);
  const coefficients = await loadCoefficientTable();
  return auditedCommand(
    db,
    context,
    'circular_review_return',
    payload.returnId,
    payload,
    async (tx) => {
      const receipt = await tx.assetReturn.findUnique({ where: { id: payload.returnId } });
      if (
        !receipt ||
        receipt.status !== 'PENDING_APPROVAL' ||
        receipt.offerNetCents === null ||
        !receipt.completedOn
      )
        invalid('return_not_awaiting_approval');
      if (payload.reviewedOn < receipt.completedOn) invalid('review_before_work_completed');
      const asset = await tx.asset.findUnique({ where: { id: receipt.assetId } });
      if (!asset || asset.status !== 'returned') invalid('asset_not_awaiting_approval');
      const allocation = await tx.engineAllocation.findUnique({ where: { assetId: asset.id } });
      if (allocation && allocation.leaseId !== receipt.leaseId)
        invalid('allocation_belongs_to_another_life');
      if (
        payload.decision === 'APPROVE' &&
        !monthlyFactorFor(coefficients, receipt.offerNetCents, 36).ok
      )
        invalid('proposal_not_financeable');
      const existingOffer = await tx.circularOffer.findUnique({
        where: { returnId: receipt.id },
      });
      if (existingOffer) invalid('offer_already_published');
      if (payload.decision === 'REJECT') {
        const rejected = await tx.assetReturn.update({
          where: { id: receipt.id },
          data: {
            status: 'REJECTED',
            reviewedBy: context.actor,
            reviewedOn: payload.reviewedOn,
            reviewReason: payload.reason,
          },
        });
        return { receipt: rejected, offer: null };
      }
      if (allocation) await tx.engineAllocation.delete({ where: { assetId: asset.id } });
      const offer = await tx.circularOffer.create({
        data: {
          id: randomUUID(),
          assetId: asset.id,
          returnId: receipt.id,
          netListCents: receipt.offerNetCents,
          publishedOn: payload.reviewedOn,
        },
      });
      const approved = await tx.assetReturn.update({
        where: { id: receipt.id },
        data: {
          status: 'READY',
          reviewedBy: context.actor,
          reviewedOn: payload.reviewedOn,
          reviewReason: null,
        },
      });
      await tx.asset.update({
        where: { id: asset.id },
        data: { status: 'available', reserved_by: null, reserved_until: null },
      });
      return { receipt: approved, offer };
    },
    {
      decision: payload.decision,
      reviewedOn: payload.reviewedOn,
      ...(payload.reason ? { reason: payload.reason } : {}),
    }
  );
}
