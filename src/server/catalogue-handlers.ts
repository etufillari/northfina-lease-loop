// The catalogue's part of a signing (D22: CONTRACT_SIGNED sets the asset `leased`). It is a
// conditional write: only a row still `available` changes. That write is the last-unit race:
// when two signings for the same asset meet, the second finds no available row, this throws
// and the second signing rolls back whole (contract, invoices, passport, audit).
//
// The signing calls it on its own `tx` before it emits, instead of registering it on the bus:
// the invoices and passport tests emit CONTRACT_SIGNED for the same asset several times, and
// a lost race should stop before the other handlers write (docs/features/contracts.md).
import { assetConditionSchema, assetStatusSchema } from '@/data/schemas';
import type { EventOf } from '@/domain/events';
import { assetUsageSchema } from '@/domain/rows/asset-usage';
import type { TransactionClient } from './audit';
import { onEvent } from './events';
import { parseRow } from './row-rules';

/** Thrown inside the signing transaction when the asset was taken first. */
export class AssetNotAvailableError extends Error {
  constructor(readonly assetId: string) {
    super(`Asset ${assetId} is no longer available`);
    this.name = 'AssetNotAvailableError';
  }
}

/**
 * Sets the asset `leased` if, and only if, it is still `available`; else throws. D90: a quote held
 * for its named customer (`heldForSigner`) may also lease the item a pass-on `reserved` for them.
 */
export async function leaseAvailableAsset(
  tx: TransactionClient,
  assetId: string,
  heldForSigner = false
): Promise<void> {
  // D23: the values are parsed before the write.
  const from = assetStatusSchema.parse('available');
  const held = assetStatusSchema.parse('reserved');
  const to = assetStatusSchema.parse('leased');
  const { count } = await tx.asset.updateMany({
    where: { id: assetId, status: { in: heldForSigner ? [from, held] : [from] } },
    data: { status: to },
  });
  if (count !== 1) throw new AssetNotAvailableError(assetId);
}

// The catalogue's part of an exit (D22), on the bus: CONTRACT_BOUGHT_OUT sets the asset
// `sold` (it leaves the loop); UNIT_RETURNED and UNIT_PASSED_ON set it `returned` with the
// reported condition and usage, for the assessment (wave 3). Each write is conditional on the
// asset being `leased`, so an exit of an asset that is not out on a lease rolls back whole.
// Registered at import time by src/server/event-handlers.ts.

/** Thrown inside the exit transaction when the asset is not `leased`. */
export class AssetNotLeasedError extends Error {
  constructor(readonly assetId: string) {
    super(`Asset ${assetId} is not leased`);
    this.name = 'AssetNotLeasedError';
  }
}

/** Sets a leased asset `sold`. */
export async function sellLeasedAsset(tx: TransactionClient, assetId: string): Promise<void> {
  const from = assetStatusSchema.parse('leased');
  const to = assetStatusSchema.parse('sold');
  const { count } = await tx.asset.updateMany({
    where: { id: assetId, status: from },
    data: { status: to },
  });
  if (count !== 1) throw new AssetNotLeasedError(assetId);
}

/** Sets a leased asset `returned` with the condition and usage it came back with. */
export async function returnLeasedAsset(
  tx: TransactionClient,
  event: EventOf<'UNIT_RETURNED'> | EventOf<'UNIT_PASSED_ON'>
): Promise<void> {
  const from = assetStatusSchema.parse('leased');
  const to = assetStatusSchema.parse('returned');
  const asset = await tx.asset.findUnique({ where: { id: event.assetId } });
  if (!asset) throw new AssetNotLeasedError(event.assetId);
  // D27: the usage must be in the unit the category counts.
  const usage = parseRow('asset usage', assetUsageSchema, {
    category: asset.category,
    usage_unit: event.usage.unit,
    usage_value: event.usage.value,
  });
  const { count } = await tx.asset.updateMany({
    where: { id: event.assetId, status: from },
    data: {
      status: to,
      condition: assetConditionSchema.parse(event.condition),
      usage_unit: usage.usage_unit,
      usage_value: usage.usage_value,
    },
  });
  if (count !== 1) throw new AssetNotLeasedError(event.assetId);
}

onEvent('CONTRACT_BOUGHT_OUT', (tx, event) => sellLeasedAsset(tx, event.assetId));
onEvent('UNIT_RETURNED', (tx, event) => returnLeasedAsset(tx, event));
onEvent('UNIT_PASSED_ON', (tx, event) => returnLeasedAsset(tx, event));
