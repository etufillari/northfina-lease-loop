// The meter reading taken when an item comes back (end of term or early exit): one lifetime
// figure per item — km on the odometer, cycles in the battery report, hours on the hour
// meter. It is checked before anything is written and applied inside the return's audited
// transaction, so an item's usage grows by exactly what the lease used (src/domain/usage.ts).
import { recordReading } from '@/domain/usage';
import type { PrismaClient } from '@/generated/prisma/client';
import type { TransactionClient } from './audit';

export type UsageUpdate = {
  assetId: string;
  reading: number;
  /** What this lease used: the reading minus the lifetime total before it. */
  added: number;
  total: number;
  sinceReset: number;
};

export type ReadingFailure = 'usage_reading_missing' | 'usage_reading_below_total';

/** Every returning item needs a reading, and none may be below its lifetime total. */
export async function checkReadings(
  db: PrismaClient,
  assetIds: string[],
  readings: Record<string, number> | undefined
): Promise<{ ok: true; updates: UsageUpdate[] } | { ok: false; reason: ReadingFailure }> {
  const rows = await db.asset.findMany({ where: { id: { in: assetIds } } });
  const updates: UsageUpdate[] = [];
  for (const assetId of assetIds) {
    const row = rows.find((r) => r.id === assetId);
    const reading = readings?.[assetId];
    if (!row || reading === undefined) return { ok: false, reason: 'usage_reading_missing' };
    const result = recordReading({ total: row.usage_total, sinceReset: row.usage_value }, reading);
    if (!result.ok) return { ok: false, reason: 'usage_reading_below_total' };
    updates.push({
      assetId,
      reading,
      added: result.added,
      total: result.total,
      sinceReset: result.sinceReset,
    });
  }
  return { ok: true, updates };
}

/** Writes the new counters; the caller puts the reading on the `returned` passport event. */
export async function applyReadings(tx: TransactionClient, updates: readonly UsageUpdate[]) {
  for (const update of updates) {
    await tx.asset.update({
      where: { id: update.assetId },
      data: { usage_total: update.total, usage_value: update.sinceReset },
    });
  }
}

/** The passport detail for one item's reading. */
export function readingDetails(updates: readonly UsageUpdate[], assetId: string) {
  const update = updates.find((u) => u.assetId === assetId);
  return update ? { usageReading: update.reading, usageAdded: update.added } : {};
}
