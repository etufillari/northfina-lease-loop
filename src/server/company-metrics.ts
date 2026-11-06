import { z } from 'zod';
import type { PrismaClient } from '@/generated/prisma/client';
import { assetCategorySchema } from '@/data/schemas';
import { companyMetrics, type MetricsContract } from '@/domain/company-metrics';

const buyoutQuote = z.looseObject({ buyoutNetCents: z.number().int().nonnegative() });

/** The buyout's net value. A receipt also settles arrears, which their invoices already count. */
function buyoutNetCents(quoteJson: string): number {
  try {
    return buyoutQuote.parse(JSON.parse(quoteJson)).buyoutNetCents;
  } catch {
    return 0;
  }
}

/** Reads company figures straight from recorded contracts, invoices and settlement receipts. */
export async function loadCompanyMetrics(db: PrismaClient, today: string) {
  const rows = await db.contract.findMany({
    select: {
      startDate: true,
      termMonths: true,
      status: true,
      endedOn: true,
      downPaymentCents: true,
      asset: { select: { category: true } },
      invoices: { where: { status: 'issued' }, select: { dueDate: true, netCents: true } },
      actionPayments: {
        where: { kind: 'buyout' },
        select: { createdAt: true, quoteJson: true },
      },
    },
  });
  const contracts: MetricsContract[] = rows.flatMap((row) => {
    const category = assetCategorySchema.safeParse(row.asset.category);
    if (!category.success) return [];
    return [
      {
        category: category.data,
        startDate: row.startDate,
        termMonths: row.termMonths,
        status: row.status,
        endedOn: row.endedOn,
        downPaymentCents: row.downPaymentCents,
        invoices: row.invoices,
        buyouts: row.actionPayments.map((payment) => ({
          date: payment.createdAt.toISOString().slice(0, 10),
          netCents: buyoutNetCents(payment.quoteJson),
        })),
      },
    ];
  });
  return companyMetrics(contracts, today);
}

/** How many cases are waiting for staff, for the top of the dashboard. */
export async function staffAttentionCounts(db: PrismaClient) {
  const kinds = { kind: { in: ['return', 'buyout', 'exchange'] } };
  const [toAssess, toReceive, toRelist] = await Promise.all([
    db.leaseRequest.count({ where: { ...kinds, status: 'pending', assessment: null } }),
    db.returnAssessment.count({ where: { status: 'accepted' } }),
    db.returnAssessment.count({ where: { status: { in: ['received', 'ready'] } } }),
  ]);
  return { toAssess, toReceive, toRelist };
}
