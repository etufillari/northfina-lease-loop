// What a dealer has to act on: items that came back, and items being held for someone on the
// waiting list. Unlike the catalogue, this shows who an item is held for.
import { loadCustomers } from '@/data/load';
import type { Asset } from '@/data/schemas';
import type { PrismaClient } from '@/generated/prisma/client';
import { listAssets } from '../assets/assets';

export type HeldItem = Asset & { held_for_name: string };

export type DealerDashboard = { returned: Asset[]; held: HeldItem[] };

export async function dealerDashboard(db: PrismaClient): Promise<DealerDashboard> {
  const [assets, customers] = await Promise.all([listAssets(db), loadCustomers()]);

  const nameOf = (customerId: string) =>
    customers.find(({ id }) => id === customerId)?.name ?? customerId;

  return {
    returned: assets.filter((asset) => asset.status === 'returned'),
    held: assets.flatMap((asset) =>
      asset.reserved_for === undefined
        ? []
        : [{ ...asset, held_for_name: nameOf(asset.reserved_for) }]
    ),
  };
}
