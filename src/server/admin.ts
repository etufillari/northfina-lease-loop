// The admin page's overview on the app's date: how many contracts are in each stage, how the
// applications were decided, what has been billed and paid, where the items are, which items
// were sold, the fleet's circular impact, and the latest entries of the audit log.
import type { PrismaClient } from '@/generated/prisma/client';
import type { FleetImpact } from '@/domain/co2';
import { contractStage } from '@/domain/contract';
import { soldTally, type Sale } from '@/domain/sold';
import { listContracts, type Contract } from './contracts';
import { assetsOn } from './asset-state';
import { fleetImpactOn } from './co2';
import { receivedInvoices } from './invoices';

export type AdminOverview = {
  contracts: {
    total: number;
    not_started: number;
    active: number;
    ended: number;
    returned: number;
    bought: number;
    passed_on: number;
  };
  applications: { total: number; approved: number; manual_review: number; rejected: number };
  invoices: { dueCount: number; dueCents: number; paidCount: number; paidCents: number };
  assets: { available: number; leased: number; reserved: number; returned: number; sold: number };
  /** Items bought by their lessee: they have left the loop and the catalogue. */
  sold: { count: number; paidCents: number; sales: (Sale & { assetName: string })[] };
  allContracts: Contract[];
  impact: FleetImpact;
  audit: { id: number; createdAt: string; actor: string; action: string; entity: string }[];
};

export async function adminOverview(db: PrismaClient, todayIso: string): Promise<AdminOverview> {
  // Invoices first: reading them issues any that are due, so the audit log below includes that.
  const received = await receivedInvoices(db, null, todayIso);
  const [contracts, decisions, items, audit, impact] = await Promise.all([
    listContracts(db, null, todayIso),
    db.application.groupBy({ by: ['decision'], _count: { _all: true } }),
    assetsOn(db, todayIso),
    db.auditLog.findMany({ orderBy: { id: 'desc' }, take: 15 }),
    fleetImpactOn(db, todayIso),
  ]);

  const stages = { not_started: 0, active: 0, ended: 0, returned: 0, bought: 0, passed_on: 0 };
  for (const contract of contracts) {
    const closed = contract.status as 'returned' | 'bought' | 'passed_on';
    stages[contract.status === 'active' ? contractStage(contract, todayIso) : closed] += 1;
  }
  const decided = Object.fromEntries(decisions.map((d) => [d.decision, d._count._all]));
  const byStatus: Partial<Record<string, number>> = {};
  for (const item of items) byStatus[item.asset.status] = (byStatus[item.asset.status] ?? 0) + 1;
  const due = received.filter((r) => r.invoice.status === 'due');
  const paid = received.filter((r) => r.invoice.status === 'paid');
  const names = new Map(items.map(({ asset }) => [asset.id, `${asset.make} ${asset.model}`]));
  const sold = soldTally(contracts);
  const sum = (list: typeof received) => list.reduce((cents, r) => cents + r.invoice.totalCents, 0);

  return {
    contracts: { total: contracts.length, ...stages },
    applications: {
      total: decisions.reduce((n, d) => n + d._count._all, 0),
      approved: decided.approved ?? 0,
      manual_review: decided.manual_review ?? 0,
      rejected: decided.rejected ?? 0,
    },
    invoices: {
      dueCount: due.length,
      dueCents: sum(due),
      paidCount: paid.length,
      paidCents: sum(paid),
    },
    assets: {
      available: byStatus.available ?? 0,
      leased: byStatus.leased ?? 0,
      reserved: byStatus.reserved ?? 0,
      returned: byStatus.returned ?? 0,
      sold: byStatus.sold ?? 0,
    },
    sold: {
      ...sold,
      sales: sold.sales.map((sale) => ({
        ...sale,
        assetName: names.get(sale.assetId) ?? sale.assetId,
      })),
    },
    allContracts: contracts,
    impact,
    audit: audit.map((row) => ({
      id: row.id,
      createdAt: row.created_at.toISOString(),
      actor: row.actor,
      action: row.action,
      entity: `${row.entity_type} ${row.entity_id}`,
    })),
  };
}
