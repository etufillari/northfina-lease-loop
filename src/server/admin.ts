// The admin page's overview on the app's date: how many contracts are in each stage, how the
// applications were decided, what has been billed and paid, where the items are, and the
// latest entries of the audit log.
import type { PrismaClient } from '@/generated/prisma/client';
import { contractStage } from '@/domain/contract';
import { listContracts, type Contract } from './contracts';
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
  assets: { available: number; reserved: number; returned: number; sold: number };
  allContracts: Contract[];
  audit: { id: number; createdAt: string; actor: string; action: string; entity: string }[];
};

export async function adminOverview(db: PrismaClient, todayIso: string): Promise<AdminOverview> {
  const [contracts, decisions, statuses, received, audit] = await Promise.all([
    listContracts(db),
    db.application.groupBy({ by: ['decision'], _count: { _all: true } }),
    db.asset.groupBy({ by: ['status'], _count: { _all: true } }),
    receivedInvoices(db, null, todayIso),
    db.auditLog.findMany({ orderBy: { id: 'desc' }, take: 15 }),
  ]);

  const stages = { not_started: 0, active: 0, ended: 0, returned: 0, bought: 0, passed_on: 0 };
  for (const contract of contracts) {
    const closed = contract.status as 'returned' | 'bought' | 'passed_on';
    stages[contract.status === 'active' ? contractStage(contract, todayIso) : closed] += 1;
  }
  const decided = Object.fromEntries(decisions.map((d) => [d.decision, d._count._all]));
  const byStatus = Object.fromEntries(statuses.map((s) => [s.status, s._count._all]));
  const due = received.filter((r) => r.invoice.status === 'due');
  const paid = received.filter((r) => r.invoice.status === 'paid');
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
      reserved: byStatus.reserved ?? 0,
      returned: byStatus.returned ?? 0,
      sold: byStatus.sold ?? 0,
    },
    allContracts: contracts,
    audit: audit.map((row) => ({
      id: row.id,
      createdAt: row.created_at.toISOString(),
      actor: row.actor,
      action: row.action,
      entity: `${row.entity_type} ${row.entity_id}`,
    })),
  };
}
