// VAT changes made on the admin page, stored in the database on top of data/vat-rates.json
// (which is never edited, so a reset brings the original rates back). Every part of the app
// that charges VAT reads effectiveVatRates(), so a change shows up everywhere at once.
//
// A change must start after the app's date: tax that has already been charged is not
// rewritten. Time-travel back first to add one "in the past".
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import type { PrismaClient } from '@/generated/prisma/client';
import { mergeVatRates } from '@/domain/vat';
import { withAudit } from './audit';

export type VatChange = { id: number; validFrom: string; ratePercent: number };

export async function listVatChanges(db: PrismaClient): Promise<VatChange[]> {
  const rows = await db.vatChange.findMany({ orderBy: { valid_from: 'asc' } });
  return rows.map((row) => ({
    id: row.id,
    validFrom: row.valid_from,
    ratePercent: row.rate_basis_points / 100,
  }));
}

/** The data pack's VAT rates with the admin's changes on top. */
export async function effectiveVatRates(db: PrismaClient): Promise<VatRates> {
  const [base, changes] = await Promise.all([loadVatRates(), listVatChanges(db)]);
  return mergeVatRates(base, changes);
}

export type AddVatChangeResult =
  { ok: true; change: VatChange } | { ok: false; reason: 'not_in_future' | 'invalid_rate' };

/**
 * Adds (or, on the same start date, replaces) a VAT rate from `validFrom`, with a
 * `vat.change_added` audit row. Rates are 0–100 % with at most two decimals.
 */
export async function addVatChange(
  db: PrismaClient,
  input: { validFrom: string; ratePercent: number; actor: string },
  todayIso: string
): Promise<AddVatChangeResult> {
  if (input.validFrom <= todayIso) return { ok: false, reason: 'not_in_future' };
  const basisPoints = Math.round(input.ratePercent * 100);
  if (
    !Number.isFinite(input.ratePercent) ||
    basisPoints < 0 ||
    basisPoints > 10_000 ||
    Math.abs(basisPoints - input.ratePercent * 100) > 1e-6
  ) {
    return { ok: false, reason: 'invalid_rate' };
  }

  const row = await withAudit(
    db,
    {
      actor: input.actor,
      action: 'vat.change_added',
      entityType: 'vat_rate',
      entityId: input.validFrom,
      details: { ratePercent: basisPoints / 100, validFrom: input.validFrom },
    },
    (tx) =>
      tx.vatChange.upsert({
        where: { valid_from: input.validFrom },
        update: { rate_basis_points: basisPoints },
        create: { valid_from: input.validFrom, rate_basis_points: basisPoints },
      })
  );
  return {
    ok: true,
    change: { id: row.id, validFrom: row.valid_from, ratePercent: row.rate_basis_points / 100 },
  };
}

export type RemoveVatChangeResult =
  { ok: true } | { ok: false; reason: 'not_found' | 'already_in_force' };

/** Removes an admin VAT change that hasn't started yet, with a `vat.change_removed` audit row. */
export async function removeVatChange(
  db: PrismaClient,
  input: { id: number; actor: string },
  todayIso: string
): Promise<RemoveVatChangeResult> {
  const row = await db.vatChange.findUnique({ where: { id: input.id } });
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.valid_from <= todayIso) return { ok: false, reason: 'already_in_force' };
  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'vat.change_removed',
      entityType: 'vat_rate',
      entityId: row.valid_from,
      details: { ratePercent: row.rate_basis_points / 100 },
    },
    (tx) => tx.vatChange.delete({ where: { id: row.id } })
  );
  return { ok: true };
}
