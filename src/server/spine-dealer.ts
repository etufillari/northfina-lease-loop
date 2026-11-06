import { loadCustomers, loadRefurbishmentCosts } from '@/data/load';
import { requireOperator, type DemoContext } from './demo-context';
import type { PrismaClient } from './prisma-client';
import { readMaintenance } from './spine-maintenance';
import { readAssetOffer } from './spine-offers';
import { readValuationBaseline } from './valuation-baseline';
import { readDealerNextActions } from './dealer-next-actions';

/** The dealer works with physical items, not a customer's application or agreement. */
export async function getDealerWorkspace(db: PrismaClient, context: DemoContext, assetId: string) {
  requireOperator(context);
  const [item, refurbishmentCosts, returnedItems, customers] = await Promise.all([
    readAssetOffer(db, assetId, context.businessDate),
    loadRefurbishmentCosts(),
    db.asset.findMany({
      where: { status: 'returned' },
      orderBy: { id: 'asc' },
      select: { id: true, make: true, model: true },
    }),
    loadCustomers(),
  ]);
  return {
    businessDate: context.businessDate,
    asset: item.asset,
    offer: item.offer,
    releaseRevision: item.release?.revision ?? 0,
    refurbishmentCosts,
    maintenance: readMaintenance(item.release),
    returnedItems,
    valuationReason: item.release?.valuation_reason ?? null,
    valuationBaseline: await readValuationBaseline(db, assetId),
    nextActions: await readDealerNextActions(db, context),
    reservation: {
      reserved: Boolean(item.release?.reserved_for_customer_id),
      customerName:
        customers.find((customer) => customer.id === item.release?.reserved_for_customer_id)
          ?.name ?? null,
    },
  };
}
export type DealerWorkspace = Awaited<ReturnType<typeof getDealerWorkspace>>;
