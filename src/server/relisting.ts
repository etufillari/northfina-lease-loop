import type { PrismaClient } from '@/generated/prisma/client';
import {
  loadCoefficientTable,
  loadRefurbishmentCosts,
  loadResidualCurves,
  loadSecondLifeDemand,
  loadVatRates,
} from '@/data/load';
import { assetCategorySchema } from '@/data/schemas';
import { batteryIsRepairLine } from '@/domain/inspection';
import { batteryAfterWork, itemChanges } from '@/domain/item-changes';
import { relistOffer } from '@/domain/relist-offer';
import { matchWaitingList, refurbishDecision } from '@/domain/second-life';
import { ApiError } from './api-response';
import { withAudit, type TransactionClient } from './audit';
import { inspectionSchema, recoveryCalculationSchema } from './recovery-input';

type Database = PrismaClient | TransactionClient;

async function requireStaff(tx: TransactionClient, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role !== 'staff') throw new ApiError(403, 'FORBIDDEN', 'Access denied.');
}

async function loadCase(database: Database, requestId: string) {
  const request = await database.leaseRequest.findFirst({
    where: { id: requestId, kind: { in: ['return', 'exchange'] } },
    include: { contract: { include: { asset: true } }, assessment: true },
  });
  if (!request?.assessment) throw new ApiError(404, 'NOT_FOUND', 'Assessed return not found.');
  return {
    request,
    assessment: request.assessment,
    asset: request.contract.asset,
    category: assetCategorySchema.parse(request.contract.asset.category),
    inspection: inspectionSchema.parse(JSON.parse(request.assessment.inspectionJson)),
    snapshot: recoveryCalculationSchema.parse(JSON.parse(request.assessment.calculationJson)),
  };
}

function offerFor(
  found: Awaited<ReturnType<typeof loadCase>>,
  today: string,
  data: Awaited<ReturnType<typeof marketData>>
) {
  const { asset, category, inspection, snapshot } = found;
  return relistOffer(
    {
      category,
      originalPriceCents: snapshot.originalPriceCents,
      firstLeaseDate: snapshot.firstLeaseDate,
      condition: inspection.condition,
      targetCondition: inspection.targetCondition,
      usageValue: inspection.usageValue,
      maintenanceUsageValue: asset.maintenanceUsageValue,
      additionalRepairCents: inspection.additionalRepairCents,
      quotedPriceCents: snapshot.recovery.postRepairValueCents,
      customerRepairCents: snapshot.settlement.customerRepairNetCents,
      skipBatteryTask: batteryIsRepairLine(inspection.record),
      today,
    },
    data.curves,
    data.costs,
    data.table,
    data.vat.rates
  );
}

async function marketData() {
  const [curves, costs, table, vat] = await Promise.all([
    loadResidualCurves(),
    loadRefurbishmentCosts(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);
  return { curves, costs, table, vat };
}

/** What the public may see of an item's last refurbishment. No customer or inspector text. */
export async function publishedRefurbishment(db: PrismaClient, assetId: string) {
  const found = await db.returnAssessment.findFirst({
    where: { status: 'published', request: { contract: { assetId } } },
    orderBy: { updatedAt: 'desc' },
    select: { inspectionJson: true, calculationJson: true, updatedAt: true },
  });
  if (!found) return null;
  const inspection = inspectionSchema.parse(JSON.parse(found.inspectionJson));
  const { recovery } = recoveryCalculationSchema.parse(JSON.parse(found.calculationJson));
  return {
    date: found.updatedAt.toISOString().slice(0, 10),
    changes: itemChanges({
      condition: inspection.condition,
      targetCondition: inspection.targetCondition,
      workItems: recovery.workItems,
      record: inspection.record,
    }),
    battery: batteryAfterWork(recovery.workItems, inspection.record),
  };
}
export type PublishedRefurbishment = NonNullable<
  Awaited<ReturnType<typeof publishedRefurbishment>>
>;

/** The price this item would be published at today, for staff to review before deciding. */
export async function relistOfferFor(db: PrismaClient, requestId: string, today: string) {
  return offerFor(await loadCase(db, requestId), today, await marketData());
}

/**
 * Card 9: whether refurbishing pays off, and who on the waiting list should get the item.
 * Matching uses the condition the work brings it to, at the price it would be published at.
 */
export async function secondLifePlanFor(db: PrismaClient, requestId: string, today: string) {
  const [found, data, demand] = await Promise.all([
    loadCase(db, requestId),
    marketData(),
    loadSecondLifeDemand(),
  ]);
  const offer = offerFor(found, today, data);
  const decision = refurbishDecision(offer);
  const condition = found.inspection.targetCondition;
  return {
    decision,
    condition,
    match: decision.refurbish
      ? matchWaitingList(
          { category: found.category, condition, priceNetCents: offer.priceNetCents },
          demand,
          today,
          data.table,
          data.vat.rates
        )
      : null,
  };
}
export type SecondLifePlan = Awaited<ReturnType<typeof secondLifePlanFor>>;

/** Puts a ready item back on the market at the price the staff member reviewed. */
export async function publishRelisting(
  db: PrismaClient,
  input: { requestId: string; staffId: string; today: string; expectedPriceCents: number }
) {
  const data = await marketData();
  return withAudit(
    db,
    {
      actor: input.staffId,
      action: 'return.publish',
      entityType: 'lease_request',
      entityId: input.requestId,
      details: { priceCents: input.expectedPriceCents },
    },
    async (tx) => {
      await requireStaff(tx, input.staffId);
      const found = await loadCase(tx, input.requestId);
      const { assessment, asset, inspection, snapshot, request } = found;
      // 'received' only remains on cases saved before receipt made an item ready.
      if (
        !['received', 'ready'].includes(assessment.status) ||
        request.contract.status !== 'returned'
      )
        throw new ApiError(409, 'RETURN_STATE', 'The item must be received first.');
      if (asset.status !== 'returned')
        throw new ApiError(409, 'ASSET_IN_USE', 'This item is no longer waiting to be relisted.');
      const offer = offerFor(found, input.today, data);
      if (offer.priceNetCents !== input.expectedPriceCents)
        throw new ApiError(409, 'PRICE_CHANGED', 'The price has changed. Please review it again.');
      if (!offer.leasable)
        throw new ApiError(409, 'NOT_LEASABLE', 'This price cannot be financed.');
      const maintainsUsage = snapshot.recovery.workItems.some(
        (item) => item.id === 'battery_replacement' || item.id === 'major_service'
      );
      await tx.asset.update({
        where: { id: asset.id },
        data: {
          status: 'available',
          condition: inspection.targetCondition,
          secondLifePriceCents: offer.priceNetCents,
          priceRevision: { increment: 1 },
          ...(maintainsUsage ? { maintenanceUsageValue: inspection.usageValue } : {}),
        },
      });
      await tx.leaseEvent.create({
        data: { contractId: request.contractId, kind: 'refurbished', eventDate: input.today },
      });
      return tx.returnAssessment.update({
        where: { id: assessment.id },
        data: { status: 'published', publishedPriceCents: offer.priceNetCents },
      });
    }
  );
}
