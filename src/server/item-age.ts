// The age clock for an item (D-042): the condition it arrived in from the data pack and its first
// lease start, which `itemAgeOn` turns into one age for early exit, second life and the passport.
import { loadAssets } from '@/data/load';
import { assetConditionSchema } from '@/data/schemas';
import { firstLeasedNewOn, type AgeClock } from '@/domain/item-age';
import type { PrismaClient } from './prisma-client';
import { parseStoredValue } from './stored-row';

/** Null for an item that isn't in the database. */
export async function ageClockFor(db: PrismaClient, assetId: string): Promise<AgeClock | null> {
  const [row, dataPack, first] = await Promise.all([
    db.asset.findUnique({ where: { id: assetId } }),
    loadAssets(),
    db.contract.findFirst({
      where: { asset_id: assetId },
      orderBy: { id: 'asc' },
      select: { start_date: true },
    }),
  ]);
  if (!row) return null;
  // An item added outside the data pack is taken as received in its current state, as the
  // passport does.
  const received = dataPack.find((a) => a.id === assetId);
  const condition =
    received?.condition ??
    parseStoredValue(assetConditionSchema, row.condition, { table: 'asset', id: assetId });
  const previousLives = received?.previous_lives ?? row.previous_lives;
  return {
    modelYear: row.model_year,
    firstLeasedNewOn: firstLeasedNewOn({ condition, previousLives }, first?.start_date ?? null),
  };
}
