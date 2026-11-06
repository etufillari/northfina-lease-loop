// Server persistence and operations for asset reservations.
// Every mutation runs inside withAudit() ensuring transactional integrity.

import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@/generated/prisma/client';
import { calculateContractQuote, type ContractQuote } from '@/domain/contract-pricing';
import { calculateOfferExpiryDate } from '@/domain/offer';
import { effectiveAssetPriceOn } from '@/domain/price-list';
import {
  calculateReservationExpiry,
  canReserveAsset,
  DEFAULT_RESERVATION_TIMEOUT_MINUTES,
  isReservationExpired,
  type ReservationReleaseReason,
  type ReservationStatus,
} from '@/domain/reservation';
import { withAudit } from './audit';
import { readCoefficientTable, readPriceLists, readVatRates } from './reference-read';

export type ReserveAssetInput = {
  assetId: string;
  actor: string;
  token?: string | null;
  timeoutMinutes?: number;
  reservationType?: 'standard' | 'offer';
  validityDays?: number;
  termMonths?: number;
  downPaymentCents?: number;
  now?: Date;
};

export type ReservationSummary = {
  id: string;
  assetId: string;
  token: string;
  actor: string;
  status: ReservationStatus;
  expiresAt: string;
  createdAt: string;
  reservationType: 'standard' | 'offer';
  offeredOn?: string;
  listPriceCents?: number;
  priceListVersion?: number;
  termMonths?: number;
  downPaymentCents?: number;
  monthlyNetRentCents?: number;
  monthlyGrossRentCents?: number;
  buyoutNetCents?: number;
  quoteJson?: string;
};

function mapReservationRow(row: {
  id: string;
  asset_id: string;
  token: string;
  actor: string;
  status: string;
  expires_at: Date;
  created_at: Date;
  reservation_type?: string | null;
  offered_on?: string | null;
  list_price_cents?: number | null;
  price_list_version?: number | null;
  term_months?: number | null;
  down_payment_cents?: number | null;
  monthly_net_rent_cents?: number | null;
  monthly_gross_rent_cents?: number | null;
  buyout_net_cents?: number | null;
  quote_json?: string | null;
}): ReservationSummary {
  return {
    id: row.id,
    assetId: row.asset_id,
    token: row.token,
    actor: row.actor,
    status: row.status as ReservationStatus,
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    reservationType: (row.reservation_type as 'standard' | 'offer') ?? 'standard',
    offeredOn: row.offered_on ?? undefined,
    listPriceCents: row.list_price_cents ?? undefined,
    priceListVersion: row.price_list_version ?? undefined,
    termMonths: row.term_months ?? undefined,
    downPaymentCents: row.down_payment_cents ?? undefined,
    monthlyNetRentCents: row.monthly_net_rent_cents ?? undefined,
    monthlyGrossRentCents: row.monthly_gross_rent_cents ?? undefined,
    buyoutNetCents: row.buyout_net_cents ?? undefined,
    quoteJson: row.quote_json ?? undefined,
  };
}
export type ReserveAssetResult =
  | {
      ok: true;
      reservation: ReservationSummary;
      renewed: boolean;
    }
  | {
      ok: false;
      reason: 'not_found' | 'no_price' | 'asset_not_available' | 'already_reserved';
      existingReservation?: {
        expiresAt: string;
      };
    };

/**
 * Reserves an asset for a lease application in progress.
 * If the applicant already holds the active reservation, its expiry is extended (renewed).
 * If a previous reservation expired, it is superseded.
 * All mutations commit with an AuditLog record in the same transaction.
 */
class ReservationConflictError extends Error {
  constructor(
    public readonly reason: 'asset_not_available' | 'already_reserved',
    public readonly expiresAt?: string
  ) {
    super(reason);
  }
}

export async function reserveAsset(
  db: PrismaClient,
  input: ReserveAssetInput
): Promise<ReserveAssetResult> {
  const currentDate = input.now ?? new Date();
  const isOffer = input.reservationType === 'offer';
  const validityDays = input.validityDays ?? (isOffer ? 14 : undefined);
  const timeoutMinutes = input.timeoutMinutes ?? DEFAULT_RESERVATION_TIMEOUT_MINUTES;

  const asset = await db.asset.findUnique({ where: { id: input.assetId } });
  if (!asset) return { ok: false, reason: 'not_found' };

  // For offers, server deterministically calculates the quote from the catalogue
  let serverQuote: ContractQuote | null = null;
  const offeredOnIso = currentDate.toISOString().slice(0, 10);
  if (isOffer) {
    const [priceLists, coefficientTable, vatRates] = await Promise.all([
      readPriceLists(db),
      readCoefficientTable(db),
      readVatRates(db),
    ]);
    const priceRes = effectiveAssetPriceOn(priceLists, asset, offeredOnIso);
    if (!priceRes.ok) return { ok: false, reason: 'no_price' };
    const quoteRes = calculateContractQuote({
      listPriceCents: priceRes.priceCents,
      priceListVersion: priceRes.priceListVersion,
      downPaymentCents: input.downPaymentCents ?? 0,
      termMonths: input.termMonths ?? 36,
      isoDate: offeredOnIso,
      coefficientTable,
      vatRates,
    });
    if (!quoteRes.ok) return { ok: false, reason: 'asset_not_available' };
    serverQuote = quoteRes.quote;
  }

  const auditEntry = {
    actor: input.actor,
    action: isOffer ? 'asset.offer_created' : 'asset.reserved',
    entityType: 'asset',
    entityId: input.assetId,
    details: {} as Record<string, unknown>,
  };

  try {
    return await withAudit(db, auditEntry, async (tx) => {
      const currentAsset = await tx.asset.findUnique({ where: { id: input.assetId } });
      if (!currentAsset) throw new ReservationConflictError('asset_not_available');

      const existingActive = await tx.assetReservation.findFirst({
        where: { asset_id: input.assetId, status: 'active' },
        orderBy: { created_at: 'desc' },
      });

      const check = canReserveAsset({
        assetStatus: currentAsset.status,
        activeReservation: existingActive
          ? {
              status: existingActive.status as ReservationStatus,
              expiresAt: existingActive.expires_at,
              token: existingActive.token,
            }
          : null,
        candidateToken: input.token,
        now: currentDate,
      });

      if (!check.canReserve) {
        throw new ReservationConflictError(
          check.reason,
          existingActive ? existingActive.expires_at.toISOString() : undefined
        );
      }

      if (check.reason === 'renewed' && existingActive) {
        // Offer reservations do NOT extend expiry. An offer expires on its original date.
        if (existingActive.reservation_type === 'offer') {
          return {
            ok: true as const,
            renewed: false,
            reservation: mapReservationRow(existingActive),
          };
        }

        // Upgrading an approved standard application reservation into a longer-term offer
        if (isOffer && serverQuote && validityDays) {
          // End of day in UTC for deterministic date-based offer expiry
          const offerExpiryIso = `${calculateOfferExpiryDate(offeredOnIso, validityDays)}T23:59:59.999Z`;
          auditEntry.action = 'asset.offer_created';
          auditEntry.details = {
            token: existingActive.token,
            expiresAt: offerExpiryIso,
            reason: 'offer_created_after_approval',
            validityDays,
            listPriceCents: serverQuote.listPriceCents,
            priceListVersion: serverQuote.priceListVersion,
            termMonths: serverQuote.termMonths,
            downPaymentCents: serverQuote.downPaymentCents,
          };

          const upgraded = await tx.assetReservation.update({
            where: { id: existingActive.id },
            data: {
              expires_at: new Date(offerExpiryIso),
              reservation_type: 'offer',
              offered_on: offeredOnIso,
              list_price_cents: serverQuote.listPriceCents,
              price_list_version: serverQuote.priceListVersion,
              term_months: serverQuote.termMonths,
              down_payment_cents: serverQuote.downPaymentCents,
              monthly_net_rent_cents: serverQuote.monthlyNetRentCents,
              monthly_gross_rent_cents: serverQuote.monthlyGrossRentCents,
              buyout_net_cents: serverQuote.buyoutNetCents,
              quote_json: JSON.stringify(serverQuote),
            },
          });

          return {
            ok: true as const,
            renewed: false,
            reservation: mapReservationRow(upgraded),
          };
        }

        const newExpiryIso = calculateReservationExpiry(currentDate, timeoutMinutes);
        auditEntry.action = 'asset.reservation_extended';
        auditEntry.details = {
          token: existingActive.token,
          expiresAt: newExpiryIso,
        };

        const updated = await tx.assetReservation.update({
          where: { id: existingActive.id },
          data: { expires_at: new Date(newExpiryIso) },
        });

        return {
          ok: true as const,
          renewed: true,
          reservation: mapReservationRow(updated),
        };
      }

      if (check.reason === 'expired_takeover' && existingActive) {
        await tx.assetReservation.update({
          where: { id: existingActive.id },
          data: { status: 'expired' },
        });
      }

      // Atomic compare-and-set: ensure asset status matches expected pre-condition
      const expectedStatus = check.reason === 'expired_takeover' ? 'reserved' : 'available';
      const cas = await tx.asset.updateMany({
        where: { id: input.assetId, status: expectedStatus },
        data: { status: 'reserved' },
      });

      if (cas.count !== 1) {
        throw new ReservationConflictError('already_reserved');
      }

      // Always generate a fresh UUID for a new reservation row to avoid unique constraint collisions
      const token = randomUUID();
      // End of day in UTC is used for deterministic date-based offer expiry
      const expiryIso =
        isOffer && validityDays
          ? `${calculateOfferExpiryDate(offeredOnIso, validityDays)}T23:59:59.999Z`
          : calculateReservationExpiry(currentDate, timeoutMinutes);

      auditEntry.action = isOffer ? 'asset.offer_created' : 'asset.reserved';
      auditEntry.details = {
        from: currentAsset.status,
        to: 'reserved',
        token,
        expiresAt: expiryIso,
        reason: isOffer ? 'offer_created' : 'application_started',
        ...(isOffer && serverQuote
          ? {
              validityDays,
              listPriceCents: serverQuote.listPriceCents,
              priceListVersion: serverQuote.priceListVersion,
              termMonths: serverQuote.termMonths,
              downPaymentCents: serverQuote.downPaymentCents,
            }
          : {}),
      };

      const created = await tx.assetReservation.create({
        data: {
          asset_id: input.assetId,
          token,
          actor: input.actor,
          status: 'active',
          expires_at: new Date(expiryIso),
          reservation_type: isOffer ? 'offer' : 'standard',
          offered_on: isOffer ? offeredOnIso : undefined,
          list_price_cents: serverQuote ? serverQuote.listPriceCents : undefined,
          price_list_version: serverQuote ? serverQuote.priceListVersion : undefined,
          term_months: serverQuote ? serverQuote.termMonths : undefined,
          down_payment_cents: serverQuote ? serverQuote.downPaymentCents : undefined,
          monthly_net_rent_cents: serverQuote ? serverQuote.monthlyNetRentCents : undefined,
          monthly_gross_rent_cents: serverQuote ? serverQuote.monthlyGrossRentCents : undefined,
          buyout_net_cents: serverQuote ? serverQuote.buyoutNetCents : undefined,
          quote_json: serverQuote ? JSON.stringify(serverQuote) : undefined,
        },
      });

      return {
        ok: true as const,
        renewed: false,
        reservation: mapReservationRow(created),
      };
    });
  } catch (error) {
    if (error instanceof ReservationConflictError) {
      return {
        ok: false,
        reason: error.reason,
        existingReservation: error.expiresAt ? { expiresAt: error.expiresAt } : undefined,
      };
    }
    throw error;
  }
}

export type ReleaseReservationResult =
  { ok: true } | { ok: false; reason: 'not_found' | 'token_mismatch' };

class ReleaseError extends Error {
  constructor(public readonly reason: 'not_found' | 'token_mismatch') {
    super(reason);
  }
}

/**
 * Releases an active reservation when an application is abandoned, cancelled, or rejected.
 * Reverts the asset status to 'available' and writes an audit row atomically.
 */
export async function releaseReservation(
  db: PrismaClient,
  input: {
    assetId: string;
    token: string;
    actor: string;
    reason: ReservationReleaseReason;
  }
): Promise<ReleaseReservationResult> {
  try {
    await withAudit(
      db,
      {
        actor: input.actor,
        action: 'asset.reservation_cancelled',
        entityType: 'asset',
        entityId: input.assetId,
        details: {
          from: 'reserved',
          to: 'available',
          token: input.token,
          reason: input.reason,
        },
      },
      async (tx) => {
        const active = await tx.assetReservation.findFirst({
          where: { asset_id: input.assetId, status: 'active' },
          orderBy: { created_at: 'desc' },
        });
        if (!active) throw new ReleaseError('not_found');
        if (active.token !== input.token) throw new ReleaseError('token_mismatch');

        await tx.assetReservation.update({
          where: { id: active.id },
          data: { status: 'released' },
        });
        await tx.asset.update({
          where: { id: input.assetId },
          data: { status: 'available' },
        });
      }
    );
    return { ok: true };
  } catch (error) {
    if (error instanceof ReleaseError) {
      return { ok: false, reason: error.reason };
    }
    throw error;
  }
}

export type ExpireReservationResult =
  { ok: true } | { ok: false; reason: 'not_found' | 'not_expired' };

class ExpireError extends Error {
  constructor(public readonly reason: 'not_found' | 'not_expired') {
    super(reason);
  }
}

/**
 * Expires an active reservation that reached its timeout.
 * Reverts the asset to 'available' and writes an audit row atomically.
 */
export async function expireReservation(
  db: PrismaClient,
  input: {
    assetId: string;
    actor?: string;
    now?: Date;
  }
): Promise<ExpireReservationResult> {
  const currentDate = input.now ?? new Date();
  const auditEntry = {
    actor: input.actor ?? 'system',
    action: 'asset.reservation_expired',
    entityType: 'asset',
    entityId: input.assetId,
    details: {} as Record<string, unknown>,
  };

  try {
    await withAudit(db, auditEntry, async (tx) => {
      const active = await tx.assetReservation.findFirst({
        where: { asset_id: input.assetId, status: 'active' },
        orderBy: { created_at: 'desc' },
      });
      if (!active) throw new ExpireError('not_found');
      if (!isReservationExpired(active.expires_at, currentDate)) {
        throw new ExpireError('not_expired');
      }

      auditEntry.details = {
        from: 'reserved',
        to: 'available',
        token: active.token,
        reason: 'timeout',
      };

      await tx.assetReservation.update({
        where: { id: active.id },
        data: { status: 'expired' },
      });
      await tx.asset.update({
        where: { id: input.assetId },
        data: { status: 'available' },
      });
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof ExpireError) {
      return { ok: false, reason: error.reason };
    }
    throw error;
  }
}

/**
 * Marks an active reservation as completed upon contract signing.
 */
export async function completeReservation(
  db: PrismaClient,
  input: {
    assetId: string;
    token?: string | null;
    actor: string;
  }
): Promise<{ ok: boolean }> {
  const auditEntry = {
    actor: input.actor,
    action: 'asset.reservation_completed',
    entityType: 'asset',
    entityId: input.assetId,
    details: {} as Record<string, unknown>,
  };

  try {
    await withAudit(db, auditEntry, async (tx) => {
      const active = await tx.assetReservation.findFirst({
        where: {
          asset_id: input.assetId,
          status: 'active',
          ...(input.token ? { token: input.token } : {}),
        },
        orderBy: { created_at: 'desc' },
      });
      if (!active) throw new ReleaseError('not_found');

      auditEntry.details = {
        token: active.token,
        reason: 'contract_signed',
      };

      await tx.assetReservation.update({
        where: { id: active.id },
        data: { status: 'completed' },
      });
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof ReleaseError) {
      return { ok: false };
    }
    throw error;
  }
}

/**
 * Returns the currently active reservation for an asset, or null if none or expired.
 * If expired at `now`, triggers automatic expiration via withAudit.
 */
export async function getActiveReservation(
  db: PrismaClient,
  assetId: string,
  now?: Date
): Promise<ReservationSummary | null> {
  const currentDate = now ?? new Date();
  const active = await db.assetReservation.findFirst({
    where: { asset_id: assetId, status: 'active' },
    orderBy: { created_at: 'desc' },
  });

  if (!active) return null;

  if (isReservationExpired(active.expires_at, currentDate)) {
    await expireReservation(db, { assetId, now: currentDate });
    return null;
  }

  return mapReservationRow(active);
}
