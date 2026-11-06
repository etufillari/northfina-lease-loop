import { assetConditionSchema } from '@/data/schemas';
import type { WorkPlan } from '@/domain/circular/refurbishment';
import { projectRefurbishment, assessRefurbishment } from '@/domain/circular/recommendation';
import type { PrismaClient } from '@/generated/prisma/client';
import {
  loadCo2Factors,
  loadCoefficientTable,
  loadSecondLifeDemand,
  loadPriceLists,
  loadResidualCurves,
} from '@/data/load';
import { toAsset } from '@/server/assets';
import { impactGrams, matchSecondLife } from '@/domain/circular/valuation';

export async function circularDashboard(db: PrismaClient) {
  const [assets, returns, offers, leases, factors, demand, table, prices, curves, contracts] =
    await Promise.all([
      db.asset.findMany({ orderBy: { id: 'asc' } }),
      db.assetReturn.findMany({
        orderBy: [{ requestedOn: 'desc' }, { receivedOn: 'desc' }, { id: 'desc' }],
      }),
      db.circularOffer.findMany({ orderBy: [{ publishedOn: 'desc' }, { id: 'desc' }] }),
      db.engineLease.findMany({ orderBy: { startDate: 'asc' } }),
      loadCo2Factors(),
      loadSecondLifeDemand(),
      loadCoefficientTable(),
      loadPriceLists(),
      loadResidualCurves(),
      db.contract.findMany({ orderBy: { start_date: 'asc' } }),
    ]);
  const audit = await db.auditLog.findMany({ orderBy: { id: 'desc' } });
  return assets
    .map((row) => {
      const asset = toAsset(row);
      let receipt = returns.find((r) => r.assetId === asset.id) ?? null;
      const history = leases.filter((l) => l.assetId === asset.id);
      const active = history.find((l) => l.status === 'ACTIVE');
      const completed =
        history.filter((l) => ['COMPLETED', 'TERMINATED'].includes(l.status)).at(-1) ?? null;
      if (completed && receipt?.leaseId !== completed.id) receipt = null;
      const offer = receipt
        ? (offers.find((o) => o.returnId === receipt.id) ?? null)
        : (offers.find((o) => o.assetId === asset.id) ?? null);
      const relatedIds = new Set([
        asset.id,
        ...returns.filter((r) => r.assetId === asset.id).map((r) => r.id),
        ...history.flatMap((l) => [l.id, l.contractId]),
      ]);
      const plan: WorkPlan | null = receipt?.planJson ? JSON.parse(receipt.planJson) : null;
      const firstContract = contracts.find((contract) => contract.asset_id === asset.id);
      const originalPrice =
        firstContract && firstContract.financed_cents > 0
          ? firstContract.financed_cents + firstContract.down_payment_cents
          : (prices.find((list) => list.version === firstContract?.price_list_version) ?? prices[0])
              ?.prices[asset.id];
      const availableOn = offer?.publishedOn ?? receipt?.completedOn ?? receipt?.receivedOn;
      const projection =
        plan && originalPrice !== undefined && availableOn
          ? projectRefurbishment(
              {
                ...asset,
                condition: receipt?.condition
                  ? assetConditionSchema.parse(receipt.condition)
                  : asset.condition,
                usage: { ...asset.usage, value: receipt?.usageValue ?? asset.usage.value },
              },
              originalPrice,
              plan,
              availableOn,
              curves
            )
          : null;
      const proposedPrice = offer?.netListCents ?? receipt?.offerNetCents ?? projection?.priceCents;
      const matches =
        proposedPrice != null && availableOn
          ? matchSecondLife(
              projection?.restoredAsset ?? asset,
              proposedPrice,
              demand,
              table,
              availableOn
            )
          : [];
      const workCost = receipt?.costCents ?? plan?.costCents;
      const assessment =
        proposedPrice != null && workCost != null
          ? assessRefurbishment(
              proposedPrice,
              workCost,
              matches.length,
              projection?.asIsNetCents ?? 0
            )
          : null;
      return {
        assessment,
        proposedPrice,
        workCost,
        audit: audit.filter((event) => relatedIds.has(event.entity_id)),
        asset,
        receipt,
        offer,
        history,
        activeLeaseId: active?.id ?? null,
        completedLeaseId: completed?.id ?? null,
        impactGrams: impactGrams(
          asset,
          Math.max(0, asset.previous_lives + (active ? 1 : 0) - 1),
          factors
        ),
        matches,
      };
    })
    .filter(
      (row) =>
        row.history.length > 0 ||
        row.asset.previous_lives > 0 ||
        row.asset.status === 'returned' ||
        row.receipt ||
        row.completedLeaseId
    );
}

/** Demo timeline stays explicit: a re-lease cannot start before the published readiness date. */
export async function assetBusinessDate(db: PrismaClient, assetId: string, today: string) {
  const offer = await db.circularOffer.findFirst({
    where: { assetId },
    orderBy: { publishedOn: 'desc' },
  });
  return offer && offer.publishedOn > today ? offer.publishedOn : today;
}
