import type { AssetStatus } from '@/data/schemas';
import { isIsoDate } from './calendar';

export type DealerActionAsset = {
  id: string;
  make: string;
  model: string;
  status: AssetStatus;
  hasActiveLease: boolean;
  lastClosedOn: string | null;
  release: {
    revision: number;
    readyOn: string | null;
    netPriceCents: number | null;
    reservedForCustomerId: string | null;
  } | null;
};
export type DealerSignatureFact = {
  quoteId: string;
  assetId: string;
  customerId: string;
  submittedOn: string;
  pricedOn: string;
  validThrough: string;
  startDate: string;
  releaseRevision: number;
  awaitingSigner: boolean;
  hasContract: boolean;
};
export type DealerNextAction = {
  assetId: string;
  make: string;
  model: string;
  kind: 'awaiting_signer' | 'prepare_item' | 'offer_ready';
  pendingSignatures: number;
};

/** Current stored-state projection, not a reconstruction of earlier lifecycle states. */
export function dealerNextActions(input: {
  assets: readonly DealerActionAsset[];
  signatures: readonly DealerSignatureFact[];
  onDate: string;
}): DealerNextAction[] {
  if (!isIsoDate(input.onDate)) throw new RangeError('business date must be a real ISO date');
  const actions: DealerNextAction[] = [];
  for (const asset of input.assets) {
    if (asset.hasActiveLease || (asset.lastClosedOn && asset.lastClosedOn > input.onDate)) continue;
    const pendingQuotes = new Set(
      input.signatures
        .filter(
          (fact) =>
            fact.assetId === asset.id &&
            fact.awaitingSigner &&
            !fact.hasContract &&
            asset.status === 'available' &&
            fact.submittedOn <= input.onDate &&
            fact.pricedOn <= input.onDate &&
            fact.validThrough >= input.onDate &&
            fact.startDate >= input.onDate &&
            fact.releaseRevision === (asset.release?.revision ?? 0) &&
            (!asset.release?.reservedForCustomerId ||
              asset.release.reservedForCustomerId === fact.customerId)
        )
        .map((fact) => fact.quoteId)
    );
    const base = {
      assetId: asset.id,
      make: asset.make,
      model: asset.model,
      pendingSignatures: pendingQuotes.size,
    };
    if (pendingQuotes.size > 0) actions.push({ ...base, kind: 'awaiting_signer' });
    else if (asset.status === 'returned') actions.push({ ...base, kind: 'prepare_item' });
    else if (
      asset.status === 'available' &&
      asset.release?.readyOn &&
      asset.release.readyOn <= input.onDate &&
      asset.release.netPriceCents !== null &&
      asset.release.netPriceCents > 0
    )
      actions.push({ ...base, kind: 'offer_ready' });
  }
  const priority = { awaiting_signer: 0, prepare_item: 1, offer_ready: 2 };
  return actions.sort(
    (a, b) =>
      priority[a.kind] - priority[b.kind] ||
      (a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0)
  );
}
