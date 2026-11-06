// Reading and changing assets in the database. Rows are converted to the same `Asset`
// shape as data/assets.json, so the UI and domain code see one type everywhere.
import type { Asset as AssetRow, PrismaClient } from '@/generated/prisma/client';
import { assetSchema, type Asset, type AssetCategory, type AssetStatus } from '@/data/schemas';
import {
  calculateBuyoutSettlement,
  deriveAssetSecondLifeValuation,
  type SecondLifeValuation,
} from '@/domain/end-of-term';
import { addMonthsClamped } from '@/domain/invoice-schedule';
import { withAudit } from './audit';
import {
  readCo2Factors,
  readCoefficientTable,
  readPriceLists,
  readResidualCurves,
  readSecondLifeDemand,
  readVatRates,
} from './reference-read';
import { percentToBp } from './reference-rows';
import { todayIso } from './today';

/** Database row → data-pack shape. Validates, so a bad value edited in by hand is caught. */
export function toAsset(row: AssetRow): Asset {
  return assetSchema.parse({
    id: row.id,
    category: row.category,
    make: row.make,
    model: row.model,
    model_year: row.model_year,
    serial_number: row.serial_number,
    condition: row.condition,
    usage: { unit: row.usage_unit, value: row.usage_value },
    previous_lives: row.previous_lives,
    status: row.status,
    ...(row.relist_price_cents != null ? { relist_price_cents: row.relist_price_cents } : {}),
    ...(row.first_lease_date != null ? { first_lease_date: row.first_lease_date } : {}),
    ...(row.first_list_price_cents != null
      ? { first_list_price_cents: row.first_list_price_cents }
      : {}),
  });
}

/** Data-pack shape → columns for a new database row. */
export function toAssetRowData(asset: Asset) {
  return {
    id: asset.id,
    category: asset.category,
    make: asset.make,
    model: asset.model,
    model_year: asset.model_year,
    serial_number: asset.serial_number,
    condition: asset.condition,
    usage_unit: asset.usage.unit,
    usage_value: asset.usage.value,
    previous_lives: asset.previous_lives,
    status: asset.status,
    ...(asset.relist_price_cents !== undefined
      ? { relist_price_cents: asset.relist_price_cents }
      : {}),
    ...(asset.first_lease_date !== undefined ? { first_lease_date: asset.first_lease_date } : {}),
    ...(asset.first_list_price_cents !== undefined
      ? { first_list_price_cents: asset.first_list_price_cents }
      : {}),
  };
}

export type AssetEventSummary = {
  id: number;
  assetId: string;
  onDate: string;
  fromStatus: string;
  toStatus: string;
  condition: string | null;
  usageValue: number | null;
  amountCents: number | null;
  noteKey: string | null;
};

export async function listAllAssetEvents(
  db: PrismaClient
): Promise<Record<string, AssetEventSummary[]>> {
  const rows = await db.assetEvent.findMany({
    orderBy: [{ on_date: 'asc' }, { id: 'asc' }],
  });
  const byAsset: Record<string, AssetEventSummary[]> = {};
  for (const row of rows) {
    const list = byAsset[row.asset_id] ?? (byAsset[row.asset_id] = []);
    list.push({
      id: row.id,
      assetId: row.asset_id,
      onDate: row.on_date,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      condition: row.condition,
      usageValue: row.usage_value,
      amountCents: row.amount_cents,
      noteKey: row.note_key,
    });
  }
  return byAsset;
}

export async function listAssets(
  db: PrismaClient,
  filter: { category?: AssetCategory } = {}
): Promise<Asset[]> {
  const rows = await db.asset.findMany({
    where: filter.category ? { category: filter.category } : {},
    orderBy: { id: 'asc' },
  });
  return rows.map(toAsset);
}

export type ChangeAssetStatusResult =
  { ok: true; asset: Asset } | { ok: false; reason: 'not_found' };

export type EndOfTermResolution = 'buyout' | 'return' | 'pass_on';

/** Sets an asset's status and writes `asset.status_changed` to the audit log, atomically. */
export async function changeAssetStatus(
  db: PrismaClient,
  input: { id: string; status: AssetStatus; actor: string }
): Promise<ChangeAssetStatusResult> {
  const existing = await db.asset.findUnique({ where: { id: input.id } });
  if (!existing) return { ok: false, reason: 'not_found' };

  const updated = await withAudit(
    db,
    {
      actor: input.actor,
      action: 'asset.status_changed',
      entityType: 'asset',
      entityId: input.id,
      details: { from: existing.status, to: input.status },
    },
    (tx) => tx.asset.update({ where: { id: input.id }, data: { status: input.status } })
  );
  return { ok: true, asset: toAsset(updated) };
}

/**
 * Resolves an asset's end of lease (buyout, return, or pass on to second life),
 * updating its status and creating an audit record with details atomically.
 */
export async function resolveAssetEndOfTerm(
  db: PrismaClient,
  input: {
    id: string;
    action: EndOfTermResolution;
    actor: string;
    details?: Record<string, unknown>;
  }
): Promise<ChangeAssetStatusResult> {
  const existing = await db.asset.findUnique({ where: { id: input.id } });
  if (!existing) return { ok: false, reason: 'not_found' };

  const nextStatus: AssetStatus = input.action === 'buyout' ? 'sold' : 'returned';
  const auditAction =
    input.action === 'buyout'
      ? 'asset.bought_out'
      : input.action === 'return'
        ? 'asset.returned'
        : 'asset.passed_on';

  const vatRates = await readVatRates(db);

  const updated = await withAudit(
    db,
    {
      actor: input.actor,
      action: auditAction,
      entityType: 'asset',
      entityId: input.id,
      // Caller details go first so they can never overwrite the server-owned transition fields.
      details: {
        ...input.details,
        from: existing.status,
        to: nextStatus,
        action: input.action,
      },
    },
    async (tx) => {
      const activeContract = await tx.contract.findFirst({
        where: { asset_id: input.id, status: 'active' },
        orderBy: { created_at: 'desc' },
        include: { invoiceRows: { orderBy: { seq: 'asc' } } },
      });
      const closedOn = activeContract
        ? addMonthsClamped(activeContract.signed_on, activeContract.term_months)
        : todayIso();

      if (activeContract) {
        await tx.contract.update({
          where: { id: activeContract.id },
          data: { status: 'ended', closed_on: closedOn },
        });
        if (input.action === 'buyout') {
          const settlement = calculateBuyoutSettlement({
            buyoutNetCents: activeContract.buyout_net_cents,
            asOf: closedOn,
            vatRates,
          });
          const nextSeq = (activeContract.invoiceRows.at(-1)?.seq ?? -1) + 1;
          await tx.invoiceRow.create({
            data: {
              contract_id: activeContract.id,
              seq: nextSeq,
              kind: 'buyout',
              invoice_date: closedOn,
              period_start: closedOn,
              period_end: closedOn,
              net_cents: settlement.buyoutNetCents,
              vat_rate_bp: percentToBp(settlement.vatRatePercent),
              vat_cents: settlement.vatCents,
              gross_cents: settlement.grossCents,
            },
          });
        }
      }

      const eventAmountCents =
        typeof input.details?.buyoutGrossCents === 'number'
          ? input.details.buyoutGrossCents
          : (activeContract?.buyout_net_cents ?? null);

      await tx.assetEvent.create({
        data: {
          asset_id: input.id,
          on_date: closedOn,
          from_status: existing.status,
          to_status: nextStatus,
          contract_id: activeContract?.id ?? null,
          condition: existing.condition,
          usage_value: existing.usage_value,
          amount_cents: eventAmountCents,
          note_key:
            input.action === 'buyout'
              ? 'passport.event.bought_out'
              : input.action === 'pass_on'
                ? 'passport.event.passed_on'
                : 'passport.event.returned',
        },
      });

      return tx.asset.update({
        where: { id: input.id },
        data:
          nextStatus === 'returned'
            ? { status: nextStatus, previous_lives: { increment: 1 } }
            : { status: nextStatus },
      });
    }
  );
  return { ok: true, asset: toAsset(updated) };
}

/** Inserts assets that are not in the database yet. Never overwrites changes you made. */
export async function seedAssets(
  db: PrismaClient,
  assets: readonly Asset[]
): Promise<{ created: number; skipped: number }> {
  const existing = await db.asset.findMany({ select: { id: true } });
  const existingIds = new Set(existing.map((row) => row.id));
  const missing = assets.filter((asset) => !existingIds.has(asset.id));
  if (missing.length > 0) {
    await db.asset.createMany({ data: missing.map(toAssetRowData) });
  }
  return { created: missing.length, skipped: assets.length - missing.length };
}

export type RelistAssetResult =
  | { ok: true; asset: Asset; valuation: SecondLifeValuation }
  | {
      ok: false;
      reason: 'not_found' | 'not_returned' | 'condition_too_low' | 'below_minimum';
      relistPriceCents?: number;
    };

class AssetNotReturnedError extends Error {}

/**
 * Relists a returned asset for its next lease life:
 * - Computes its residual market value (`relist_price_cents`) as of `asOf`.
 * - Verifies condition and minimum financing band eligibility.
 * - Atomically updates `Asset` (`status: 'available'`, `relist_price_cents`, `first_lease_date`,
 *   `first_list_price_cents`), inserts an `AssetEvent` row, and logs `asset.relisted` via `withAudit`.
 */
export async function relistAsset(
  db: PrismaClient,
  input: { id: string; actor: string; asOf?: string }
): Promise<RelistAssetResult> {
  const existing = await db.asset.findUnique({ where: { id: input.id } });
  if (!existing) return { ok: false, reason: 'not_found' };
  const asset = toAsset(existing);
  if (asset.status !== 'returned') return { ok: false, reason: 'not_returned' };

  const asOf = input.asOf ?? todayIso();
  const [priceLists, residualCurves, coefficientTable, secondLifeDemand, co2Factors] =
    await Promise.all([
      readPriceLists(db),
      readResidualCurves(db),
      readCoefficientTable(db),
      readSecondLifeDemand(db),
      readCo2Factors(db),
    ]);

  const valuation = deriveAssetSecondLifeValuation({
    asset,
    priceLists,
    residualCurves,
    coefficientTable,
    secondLifeDemand,
    co2Factors,
    asOf,
  });

  if (!valuation.canRelist) {
    return {
      ok: false,
      reason: valuation.cannotRelistReason ?? 'condition_too_low',
      relistPriceCents: valuation.relistPriceCents,
    };
  }

  try {
    const updated = await withAudit(
      db,
      {
        actor: input.actor,
        action: 'asset.relisted',
        entityType: 'asset',
        entityId: asset.id,
        details: {
          from: 'returned',
          to: 'available',
          relistPriceCents: valuation.relistPriceCents,
          firstListPriceCents: valuation.firstListPriceCents,
          ageMonths: valuation.ageMonths,
          topMatchId: valuation.matches[0]?.request.id ?? null,
        },
      },
      async (tx) => {
        const { count } = await tx.asset.updateMany({
          where: { id: asset.id, status: 'returned' },
          data: {
            status: 'available',
            relist_price_cents: valuation.relistPriceCents,
            first_lease_date: valuation.firstLeaseDate,
            first_list_price_cents: valuation.firstListPriceCents,
          },
        });
        if (count === 0) throw new AssetNotReturnedError();

        await tx.assetEvent.create({
          data: {
            asset_id: asset.id,
            on_date: asOf,
            from_status: 'returned',
            to_status: 'available',
            condition: asset.condition,
            usage_value: asset.usage.value,
            amount_cents: valuation.relistPriceCents,
            note_key: 'passport.event.relisted',
          },
        });

        return tx.asset.findUniqueOrThrow({ where: { id: asset.id } });
      }
    );
    return { ok: true, asset: toAsset(updated), valuation };
  } catch (error) {
    if (error instanceof AssetNotReturnedError) {
      return { ok: false, reason: 'not_returned' };
    }
    throw error;
  }
}
