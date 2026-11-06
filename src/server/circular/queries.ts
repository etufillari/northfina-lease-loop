import type { PrismaClient } from '@/generated/prisma/client';
import { loadCo2Factors, loadCoefficientTable, loadSecondLifeDemand } from '@/data/load';
import { toAsset } from '@/server/assets';
import { impactGrams, matchSecondLife } from '@/domain/circular/valuation';

export async function circularDashboard(db: PrismaClient) {
  const [assets, returns, offers, leases, factors, demand, table] = await Promise.all([
    db.asset.findMany({ orderBy: { id: 'asc' } }),
    db.assetReturn.findMany({
      orderBy: [{ requestedOn: 'desc' }, { receivedOn: 'desc' }, { id: 'desc' }],
    }),
    db.circularOffer.findMany({ orderBy: [{ publishedOn: 'desc' }, { id: 'desc' }] }),
    db.engineLease.findMany({ orderBy: { startDate: 'asc' } }),
    loadCo2Factors(),
    loadSecondLifeDemand(),
    loadCoefficientTable(),
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
      return {
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
        matches: offer
          ? matchSecondLife(asset, offer.netListCents, demand, table, offer.publishedOn)
          : [],
      };
    })
    .filter(
      (row) =>
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
