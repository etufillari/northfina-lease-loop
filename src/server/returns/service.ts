import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { RefurbishmentCosts } from '@/data/schemas';
import { assetCategorySchema, assetConditionSchema, usageUnitSchema } from '@/data/schemas';
import type { PrismaClient } from '@/generated/prisma/client';
import { planRefurbishment } from '@/domain/refurbishment';
import { withAudit } from '@/server/audit';
import { ReturnServiceError, type LeaseReader, type ReturnReceiptDTO } from './types';

export const returnInspectionSchema = z.strictObject({
  assetId: z.string().trim().min(1).max(100),
  receivedOn: z.iso.date(),
  condition: assetConditionSchema,
  usage: z.strictObject({
    unit: usageUnitSchema,
    value: z.number().int().nonnegative().max(2_147_483_647),
  }),
  usageReductionEvidence: z.string().trim().min(1).max(500).optional(),
  usageSinceLastService: z
    .strictObject({
      unit: usageUnitSchema,
      value: z.number().int().nonnegative().max(2_147_483_647),
    })
    .optional(),
});
const returnRequestSchema = returnInspectionSchema.extend({
  leaseId: z.string().trim().min(1).max(100),
  idempotencyKey: z.string().trim().min(1).max(200),
  actor: z.string().trim().min(1).max(100),
});

export const completeWorkRequestSchema = z.strictObject({
  completedOn: z.iso.date(),
  evidenceReference: z.string().trim().min(1).max(500).optional(),
});
const completeWorkRequestWithActorSchema = completeWorkRequestSchema.extend({
  actor: z.string().trim().min(1).max(100),
});

type ReturnRequest = z.infer<typeof returnRequestSchema>;

export async function receiveAssetReturn(
  db: PrismaClient,
  leaseReader: LeaseReader,
  costs: RefurbishmentCosts,
  input: ReturnRequest
): Promise<ReturnReceiptDTO> {
  const parsed = returnRequestSchema.safeParse(input);
  if (!parsed.success) throw new ReturnServiceError('INVALID_REQUEST');
  const request = parsed.data;
  const payloadHash = hashRequest(request);

  const replay = await db.assetReturn.findUnique({
    where: { idempotencyKey: request.idempotencyKey },
    include: { work: { orderBy: { code: 'asc' } } },
  });
  if (replay) {
    if (replay.payloadHash !== payloadHash) {
      throw new ReturnServiceError('IDEMPOTENCY_CONFLICT');
    }
    return toReceiptDTO(replay);
  }

  const lease = await leaseReader.readLease(request.leaseId);
  if (!lease) throw new ReturnServiceError('NOT_FOUND');
  if (lease.leaseId !== request.leaseId || lease.assetId !== request.assetId) {
    throw new ReturnServiceError('LEASE_ASSET_MISMATCH');
  }
  if (lease.status !== 'COMPLETED' && lease.status !== 'TERMINATED') {
    throw new ReturnServiceError('LEASE_NOT_RETURNABLE');
  }

  const returnId = randomUUID();
  try {
    return await withAudit(
      db,
      {
        actor: request.actor,
        action: 'asset_return.received',
        entityType: 'asset_return',
        entityId: returnId,
        details: { leaseId: request.leaseId, assetId: request.assetId },
      },
      async (tx) => {
        const engineLease = await tx.engineLease.findUnique({ where: { id: request.leaseId } });
        if (!engineLease) throw new ReturnServiceError('NOT_FOUND');
        if (engineLease.assetId !== request.assetId || engineLease.assetId !== lease.assetId) {
          throw new ReturnServiceError('LEASE_ASSET_MISMATCH');
        }
        if (engineLease.status !== 'COMPLETED' && engineLease.status !== 'TERMINATED') {
          throw new ReturnServiceError('LEASE_NOT_RETURNABLE');
        }

        const existingReturn = await tx.assetReturn.findUnique({
          where: { leaseId: request.leaseId },
          include: { work: { orderBy: { code: 'asc' } } },
        });
        if (existingReturn) throw new ReturnServiceError('ALREADY_RETURNED');

        const allocation = await tx.engineAllocation.findUnique({
          where: { assetId: request.assetId },
        });
        if (!allocation || allocation.leaseId !== request.leaseId) {
          throw new ReturnServiceError('ASSET_NOT_ALLOCATED');
        }

        const asset = await tx.asset.findUnique({ where: { id: request.assetId } });
        if (!asset) throw new ReturnServiceError('NOT_FOUND');
        if (asset.status !== 'reserved' || asset.reserved_by !== engineLease.contractId) {
          throw new ReturnServiceError('ASSET_UNAVAILABLE');
        }

        const category = assetCategorySchema.safeParse(asset.category);
        const currentCondition = assetConditionSchema.safeParse(asset.condition);
        if (
          !category.success ||
          !currentCondition.success ||
          asset.usage_unit !== request.usage.unit
        ) {
          throw new ReturnServiceError('INVALID_INSPECTION');
        }
        if (request.usage.value < asset.usage_value && !request.usageReductionEvidence) {
          throw new ReturnServiceError('USAGE_REDUCTION_EVIDENCE_REQUIRED');
        }

        const plan = planRefurbishment(
          {
            category: category.data,
            condition: request.condition,
            usage: request.usage,
            ...(request.usageSinceLastService
              ? { usageSinceLastService: request.usageSinceLastService }
              : {}),
          },
          costs
        );
        if (!plan.ok) throw new ReturnServiceError('INVALID_INSPECTION');
        const requiredWork = plan.value.work.filter((item) => item.mandatory);
        const status = requiredWork.length > 0 ? 'REFURBISHMENT_PENDING' : 'READY';

        await tx.assetReturn.create({
          data: {
            id: returnId,
            leaseId: request.leaseId,
            assetId: request.assetId,
            idempotencyKey: request.idempotencyKey,
            payloadHash,
            status,
            condition: request.condition,
            usageUnit: request.usage.unit,
            usageValue: request.usage.value,
            usageReductionEvidence: request.usageReductionEvidence ?? null,
            receivedAt: new Date(`${request.receivedOn}T00:00:00.000Z`),
          },
        });
        for (const item of requiredWork) {
          await tx.refurbishmentWork.create({
            data: {
              id: randomUUID(),
              returnId,
              code: item.code,
              kind: item.kind,
              costCents: item.costCents,
              mandatory: true,
              resetsUsage: item.resetsUsage,
              fromCondition: item.fromCondition ?? null,
              toCondition: item.toCondition ?? null,
              status: 'PENDING',
            },
          });
        }

        await tx.asset.update({
          where: { id: request.assetId },
          data: {
            status: status === 'READY' ? 'available' : 'returned',
            reserved_by: null,
            condition: request.condition,
            usage_unit: request.usage.unit,
            usage_value: request.usage.value,
            previous_lives: { increment: 1 },
          },
        });
        if (status === 'READY') {
          await tx.engineAllocation.delete({ where: { assetId: request.assetId } });
        }

        const receipt = await tx.assetReturn.findUniqueOrThrow({
          where: { id: returnId },
          include: { work: { orderBy: { code: 'asc' } } },
        });
        return toReceiptDTO(receipt);
      }
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const duplicate = await db.assetReturn.findUnique({
        where: { idempotencyKey: request.idempotencyKey },
        include: { work: { orderBy: { code: 'asc' } } },
      });
      if (duplicate?.payloadHash === payloadHash) return toReceiptDTO(duplicate);
      if (duplicate) throw new ReturnServiceError('IDEMPOTENCY_CONFLICT');
      throw new ReturnServiceError('ALREADY_RETURNED');
    }
    throw error;
  }
}

export async function completeRefurbishmentWork(
  db: PrismaClient,
  returnId: string,
  workCode: string,
  input: z.infer<typeof completeWorkRequestWithActorSchema>
): Promise<ReturnReceiptDTO> {
  const parsed = completeWorkRequestWithActorSchema.safeParse(input);
  if (!parsed.success || !returnId || !workCode) {
    throw new ReturnServiceError('INVALID_REQUEST');
  }
  const request = parsed.data;

  return withAudit(
    db,
    {
      actor: request.actor,
      action: 'refurbishment_work.completed',
      entityType: 'asset_return',
      entityId: returnId,
      details: { workCode, completedOn: request.completedOn },
    },
    async (tx) => {
      const receipt = await tx.assetReturn.findUnique({
        where: { id: returnId },
        include: { work: { orderBy: { code: 'asc' } } },
      });
      if (!receipt) throw new ReturnServiceError('NOT_FOUND');
      if (receipt.status !== 'REFURBISHMENT_PENDING') {
        throw new ReturnServiceError('RETURN_NOT_PENDING');
      }
      if (request.completedOn < receipt.receivedAt.toISOString().slice(0, 10)) {
        throw new ReturnServiceError('INVALID_REQUEST');
      }

      const work = receipt.work.find((item) => item.code === workCode);
      if (!work) throw new ReturnServiceError('WORK_NOT_FOUND');
      if (work.status === 'COMPLETED') {
        throw new ReturnServiceError('WORK_ALREADY_COMPLETED');
      }
      if (work.resetsUsage && !request.evidenceReference) {
        throw new ReturnServiceError('WORK_EVIDENCE_REQUIRED');
      }

      const asset = await tx.asset.findUnique({ where: { id: receipt.assetId } });
      if (!asset || asset.status !== 'returned') {
        throw new ReturnServiceError('ASSET_UNAVAILABLE');
      }
      const allocation = await tx.engineAllocation.findUnique({
        where: { assetId: receipt.assetId },
      });
      if (!allocation || allocation.leaseId !== receipt.leaseId) {
        throw new ReturnServiceError('ASSET_NOT_ALLOCATED');
      }

      if (work.kind === 'condition_upgrade' && asset.condition !== work.fromCondition) {
        throw new ReturnServiceError('WORK_OUT_OF_ORDER');
      }
      const completedAt = new Date(`${request.completedOn}T00:00:00.000Z`);
      await tx.refurbishmentWork.update({
        where: { id: work.id },
        data: {
          status: 'COMPLETED',
          evidenceReference: request.evidenceReference ?? null,
          completedAt,
        },
      });

      const pendingMandatory = receipt.work.filter(
        (item) => item.mandatory && item.id !== work.id && item.status !== 'COMPLETED'
      );
      const ready = pendingMandatory.length === 0;
      await tx.asset.update({
        where: { id: asset.id },
        data: {
          ...(work.kind === 'condition_upgrade' && work.toCondition
            ? { condition: work.toCondition }
            : {}),
          ...(work.resetsUsage ? { usage_value: 0 } : {}),
          status: ready ? 'available' : 'returned',
        },
      });
      await tx.assetReturn.update({
        where: { id: receipt.id },
        data: { status: ready ? 'READY' : 'REFURBISHMENT_PENDING' },
      });
      if (ready) {
        await tx.engineAllocation.delete({ where: { assetId: receipt.assetId } });
      }

      const updated = await tx.assetReturn.findUniqueOrThrow({
        where: { id: receipt.id },
        include: { work: { orderBy: { code: 'asc' } } },
      });
      return toReceiptDTO(updated);
    }
  );
}

function hashRequest(request: ReturnRequest): string {
  const { actor: _actor, idempotencyKey: _idempotencyKey, ...payload } = request;
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function toReceiptDTO(receipt: {
  id: string;
  leaseId: string;
  assetId: string;
  status: string;
  condition: string;
  usageUnit: string;
  usageValue: number;
  usageReductionEvidence: string | null;
  receivedAt: Date;
  work: readonly {
    id: string;
    code: string;
    kind: string;
    costCents: number;
    mandatory: boolean;
    resetsUsage: boolean;
    status: string;
    evidenceReference: string | null;
  }[];
}): ReturnReceiptDTO {
  const work = receipt.work.map((item) => ({
    workId: item.id,
    code: item.code,
    kind: z.enum(['condition_upgrade', 'fixed']).parse(item.kind),
    costCents: item.costCents,
    mandatory: item.mandatory,
    resetsUsage: item.resetsUsage,
    status: z.enum(['PENDING', 'COMPLETED']).parse(item.status),
    evidenceReference: item.evidenceReference,
  }));
  const status = z.enum(['REFURBISHMENT_PENDING', 'READY']).parse(receipt.status);
  return {
    returnId: receipt.id,
    leaseId: receipt.leaseId,
    assetId: receipt.assetId,
    status,
    condition: assetConditionSchema.parse(receipt.condition),
    usage: { unit: usageUnitSchema.parse(receipt.usageUnit), value: receipt.usageValue },
    usageReductionEvidence: receipt.usageReductionEvidence,
    receivedOn: receipt.receivedAt.toISOString().slice(0, 10),
    work,
    requiredCostCents: work.reduce((total, item) => total + item.costCents, 0),
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
