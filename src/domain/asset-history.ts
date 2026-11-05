// An item's history so far, from what the data pack records: how many leases it has been
// through, how old it is, and where it is in the loop now. The data has no lease dates yet;
// those will come from contracts signed in the app.
import type { Asset } from '@/data/schemas';

/** Where the item is now: ready to lease, held for someone, or back and waiting for a check. */
export type LoopStage = 'available' | 'reserved' | 'awaiting_refurbishment';

export type AssetHistory = {
  /** Leases already completed. */
  previousLives: number;
  /** The number of the next lease: 1 for a new item, 3 for an item that has had 2 lives. */
  nextLife: number;
  /** Whole years since the model year, from the calendar year of `isoDate`. Never negative. */
  ageYears: number;
  stage: LoopStage;
};

const stageByStatus: Record<Asset['status'], LoopStage> = {
  available: 'available',
  reserved: 'reserved',
  returned: 'awaiting_refurbishment',
};

export function assetHistory(asset: Asset, isoDate: string): AssetHistory {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    throw new RangeError(`isoDate must look like YYYY-MM-DD, got "${isoDate}"`);
  }
  const year = Number(isoDate.slice(0, 4));
  return {
    previousLives: asset.previous_lives,
    nextLife: asset.previous_lives + 1,
    ageYears: Math.max(0, year - asset.model_year),
    stage: stageByStatus[asset.status],
  };
}
