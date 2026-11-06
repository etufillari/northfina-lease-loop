// The assets as the pages show them (review finding 3): `previous_lives` is the data pack's
// count and never moves, so after card 1's bike is returned and relisted the catalogue still
// stamped it "Life 1 · New". Here every asset's `previous_lives` is the lives so far
// (`livesSoFar`: the pack's count plus our ended contracts, the same lives the passport folds).
// For display only: D60's "ours from new" reads the pack's count (first-lease.ts).
import type { Asset } from '@/data/schemas';
import { livesSoFar } from '@/domain/second-life/first-lease';
import { listAssets } from './assets';
import { listContracts, type ContractView } from './contracts';
import type { PrismaClient } from './prisma-client';

export async function listAssetsWithLives(db: PrismaClient): Promise<Asset[]> {
  const [assets, contracts] = await Promise.all([listAssets(db), listContracts(db, {})]);
  const byAsset = new Map<string, ContractView[]>();
  for (const contract of contracts) {
    byAsset.set(contract.assetId, [...(byAsset.get(contract.assetId) ?? []), contract]);
  }
  return assets.map((asset) => ({
    ...asset,
    previous_lives: livesSoFar(asset.previous_lives, byAsset.get(asset.id) ?? []).previousLives,
  }));
}
