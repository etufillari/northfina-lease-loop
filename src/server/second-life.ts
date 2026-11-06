// Second life (Spine step 7), on the server: the refurbishments that bring a returned item back
// for its next lease. Each one is part of the item's passport.
import type { PrismaClient } from '@/generated/prisma/client';

export type Refurbishment = {
  id: number;
  assetId: string;
  date: string;
  conditionBefore: string;
  conditionAfter: string;
  usageBefore: number;
  usageAfter: number;
  steps: string[];
  costCents: number;
  priceCents: number;
  notes: string | null;
  actor: string;
};

/** The refurbishments of one item, oldest first. */
export async function listRefurbishments(
  db: PrismaClient,
  assetId: string
): Promise<Refurbishment[]> {
  const rows = await db.refurbishment.findMany({
    where: { asset_id: assetId },
    orderBy: { id: 'asc' },
  });
  return rows.map((row) => ({
    id: row.id,
    assetId: row.asset_id,
    date: row.refurbished_date,
    conditionBefore: row.condition_before,
    conditionAfter: row.condition_after,
    usageBefore: row.usage_before,
    usageAfter: row.usage_after,
    steps: JSON.parse(row.steps_json) as string[],
    costCents: row.cost_cents,
    priceCents: row.price_cents,
    notes: row.notes,
    actor: row.actor,
  }));
}
