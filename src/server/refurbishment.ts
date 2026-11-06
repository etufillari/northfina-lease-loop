import type { Asset as AssetRow } from '@/generated/prisma/client';
import { loadRefurbishmentCosts } from '@/data/load';
import {
  assetConditionSchema,
  isoDateSchema,
  type Asset,
  type AssetCondition,
} from '@/data/schemas';
import {
  refurbishmentQuoteFor,
  type RefurbishmentFailure,
  type RefurbishmentQuote,
} from '@/domain/refurbishment';
import { withAudit, type TransactionClient } from './audit';
import { toAsset } from './assets';
import type { PrismaClient } from './prisma-client';
import { z } from 'zod';

const targetConditionField = { targetCondition: assetConditionSchema.optional() };

export const refurbishmentQuoteRequestSchema = z.strictObject(targetConditionField);
export type RefurbishmentQuoteRequest = z.infer<typeof refurbishmentQuoteRequestSchema>;

export const refurbishmentCompletionRequestSchema = z.strictObject({
  ...targetConditionField,
  completedOn: isoDateSchema,
  actor: z.string().trim().min(1).max(100),
});
export type RefurbishmentCompletionRequest = z.infer<typeof refurbishmentCompletionRequestSchema>;

type RefurbishmentSuccess = {
  ok: true;
  asset: Asset;
  quote: RefurbishmentQuote;
};

export type RefurbishmentServiceFailure =
  | { ok: false; reason: 'asset_not_found' }
  | { ok: false; reason: 'asset_not_returned'; status: string }
  | RefurbishmentFailure;

export type RefurbishmentResult = RefurbishmentSuccess | RefurbishmentServiceFailure;

class RefurbishmentTransactionFailure extends Error {
  constructor(readonly failure: RefurbishmentServiceFailure) {
    super('The asset changed while refurbishment was being completed');
    this.name = 'RefurbishmentTransactionFailure';
  }
}

function targetConditionFor(input: { targetCondition?: AssetCondition }): AssetCondition {
  return input.targetCondition ?? 'good';
}

function quoteForRow(
  row: AssetRow,
  targetCondition: AssetCondition,
  refurbishmentCosts: Awaited<ReturnType<typeof loadRefurbishmentCosts>>
): RefurbishmentResult {
  if (row.status !== 'returned') {
    return { ok: false, reason: 'asset_not_returned', status: row.status };
  }

  const asset = toAsset(row);
  const result = refurbishmentQuoteFor(asset, refurbishmentCosts, targetCondition);
  if (!result.ok) return result;
  return { ok: true, asset, quote: result.quote };
}

async function findAsset(db: PrismaClient | TransactionClient, assetId: string) {
  return db.asset.findUnique({ where: { id: assetId } });
}

/** Calculates a refurbishment quote without changing the asset. */
export async function quoteRefurbishment(
  db: PrismaClient,
  assetId: string,
  input: RefurbishmentQuoteRequest
): Promise<RefurbishmentResult> {
  const row = await findAsset(db, assetId);
  if (!row) return { ok: false, reason: 'asset_not_found' };

  return quoteForRow(row, targetConditionFor(input), await loadRefurbishmentCosts());
}

async function writePassport(
  tx: TransactionClient,
  asset: AssetRow,
  quote: RefurbishmentQuote,
  input: RefurbishmentCompletionRequest
): Promise<void> {
  await tx.assetHistory.create({
    data: {
      asset_id: asset.id,
      event_type: 'condition_assessed',
      occurred_on: input.completedOn,
      from_status: 'returned',
      to_status: 'returned',
      condition: asset.condition,
      usage_unit: asset.usage_unit,
      usage_value: asset.usage_value,
      actor: input.actor,
      details_json: JSON.stringify({
        targetCondition: quote.targetCondition,
        targetUsageValue: quote.usageAfterValue,
      }),
    },
  });
  await tx.assetHistory.create({
    data: {
      asset_id: asset.id,
      event_type: 'refurbished',
      occurred_on: input.completedOn,
      from_status: 'returned',
      to_status: 'returned',
      condition: quote.targetCondition,
      usage_unit: asset.usage_unit,
      usage_value: quote.usageAfterValue,
      actor: input.actor,
      details_json: JSON.stringify({
        conditionUpgradeCents: quote.conditionUpgradeCents,
        fixedWork: quote.fixedWork,
        totalCostCents: quote.totalCostCents,
      }),
    },
  });
  await tx.assetHistory.create({
    data: {
      asset_id: asset.id,
      event_type: 'made_available',
      occurred_on: input.completedOn,
      from_status: 'returned',
      to_status: 'available',
      condition: quote.targetCondition,
      usage_unit: asset.usage_unit,
      usage_value: quote.usageAfterValue,
      actor: input.actor,
    },
  });
}

/** Applies an accepted quote and makes the returned asset available atomically. */
export async function completeRefurbishment(
  db: PrismaClient,
  assetId: string,
  input: RefurbishmentCompletionRequest
): Promise<RefurbishmentResult> {
  const refurbishmentCosts = await loadRefurbishmentCosts();
  const targetCondition = targetConditionFor(input);

  try {
    const updated = await withAudit(
      db,
      {
        actor: input.actor,
        action: 'asset.refurbished',
        entityType: 'asset',
        entityId: assetId,
        details: {
          completedOn: input.completedOn,
          targetCondition,
        },
      },
      async (tx) => {
        const current = await findAsset(tx, assetId);
        if (!current) {
          throw new RefurbishmentTransactionFailure({ ok: false, reason: 'asset_not_found' });
        }

        const result = quoteForRow(current, targetCondition, refurbishmentCosts);
        if (!result.ok) throw new RefurbishmentTransactionFailure(result);

        const updatedAsset = await tx.asset.update({
          where: { id: assetId },
          data: {
            condition: result.quote.targetCondition,
            usage_value: result.quote.usageAfterValue,
            status: 'available',
          },
        });
        await writePassport(tx, current, result.quote, input);
        return { updatedAsset, quote: result.quote };
      }
    );

    return { ok: true, asset: toAsset(updated.updatedAsset), quote: updated.quote };
  } catch (error) {
    if (error instanceof RefurbishmentTransactionFailure) return error.failure;
    throw error;
  }
}
