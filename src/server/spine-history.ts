import { ApiError } from './api-response';
import { toAsset } from './assets';
import type { DemoContext } from './demo-context';
import type { PrismaClient } from './prisma-client';

/** Public item history deliberately excludes identities, agreement IDs, answers and prices. */
export async function getPassport(db: PrismaClient, assetId: string) {
  const [row, lives] = await Promise.all([
    db.asset.findUnique({ where: { id: assetId } }),
    db.contract.findMany({
      where: { asset_id: assetId },
      orderBy: { life_number: 'asc' },
      select: {
        life_number: true,
        start_date: true,
        end_date: true,
        closed_on: true,
        status: true,
      },
    }),
  ]);
  if (!row) throw new ApiError(404, 'ASSET_NOT_FOUND', 'The item was not found');
  const completedKnownLives = lives.filter((life) => life.status !== 'active').length;
  return {
    asset: toAsset(row),
    lives,
    earlierLivesWithoutRecords: Math.max(0, row.previous_lives - completedKnownLives),
  };
}

/** The demo operator can inspect the trail; a customer sees actions for their selected persona. */
export async function getScopedAudit(db: PrismaClient, context: DemoContext) {
  const rows = await db.auditLog.findMany({
    where: context.operator ? {} : { actor: { endsWith: `:${context.customer.id}` } },
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    take: 50,
  });
  return rows.map((row) => ({
    id: row.id,
    at: row.created_at.toISOString(),
    actor: row.actor,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
  }));
}
