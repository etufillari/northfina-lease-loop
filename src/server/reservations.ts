// Server persistence and operations for asset reservations.
// Every mutation runs inside withAudit() ensuring transactional integrity.

import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@/generated/prisma/client';
import {
  calculateReservationExpiry,
  canReserveAsset,
  DEFAULT_RESERVATION_TIMEOUT_MINUTES,
  isReservationExpired,
  type ReservationReleaseReason,
  type ReservationStatus,
} from '@/domain/reservation';
import { withAudit } from './audit';

export type ReserveAssetInput = {
  assetId: string;
  actor: string;
  token?: string | null;
  timeoutMinutes?: number;
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
};

export type ReserveAssetResult =
  | {
      ok: true;
      reservation: ReservationSummary;
      renewed: boolean;
    }
  | {
      ok: false;
      reason: 'not_found' | 'asset_not_available' | 'already_reserved';
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
export async function reserveAsset(
  db: PrismaClient,
  input: {
    assetId: string;
    actor: string;
    token?: string | null;
    timeoutMinutes?: number;
    now?: Date;
  }
): Promise<ReserveAssetResult> {
  const currentDate = input.now ?? new Date();
  const timeoutMinutes = input.timeoutMinutes ?? DEFAULT_RESERVATION_TIMEOUT_MINUTES;

  const asset = await db.asset.findUnique({ where: { id: input.assetId } });
  if (!asset) return { ok: false, reason: 'not_found' };

  const existingActive = await db.assetReservation.findFirst({
    where: { asset_id: input.assetId, status: 'active' },
    orderBy: { created_at: 'desc' },
  });

  const check = canReserveAsset({
    assetStatus: asset.status,
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
    return {
      ok: false,
      reason: check.reason,
      existingReservation: existingActive
        ? { expiresAt: existingActive.expires_at.toISOString() }
        : undefined,
    };
  }

  if (check.reason === 'renewed' && existingActive) {
    const newExpiryIso = calculateReservationExpiry(currentDate, timeoutMinutes);
    const updated = await withAudit(
      db,
      {
        actor: input.actor,
        action: 'asset.reservation_extended',
        entityType: 'asset',
        entityId: input.assetId,
        details: {
          token: existingActive.token,
          expiresAt: newExpiryIso,
        },
      },
      async (tx) =>
        tx.assetReservation.update({
          where: { id: existingActive.id },
          data: { expires_at: new Date(newExpiryIso) },
        })
    );

    return {
      ok: true,
      renewed: true,
      reservation: {
        id: updated.id,
        assetId: updated.asset_id,
        token: updated.token,
        actor: updated.actor,
        status: updated.status as ReservationStatus,
        expiresAt: updated.expires_at.toISOString(),
        createdAt: updated.created_at.toISOString(),
      },
    };
  }

  const token = input.token?.trim() || randomUUID();
  const expiryIso = calculateReservationExpiry(currentDate, timeoutMinutes);

  const reservation = await withAudit(
    db,
    {
      actor: input.actor,
      action: 'asset.reserved',
      entityType: 'asset',
      entityId: input.assetId,
      details: {
        from: asset.status,
        to: 'reserved',
        token,
        expiresAt: expiryIso,
        reason: 'application_started',
      },
    },
    async (tx) => {
      if (check.reason === 'expired_takeover' && existingActive) {
        await tx.assetReservation.update({
          where: { id: existingActive.id },
          data: { status: 'expired' },
        });
      }

      await tx.asset.update({
        where: { id: input.assetId },
        data: { status: 'reserved' },
      });

      return tx.assetReservation.create({
        data: {
          asset_id: input.assetId,
          token,
          actor: input.actor,
          status: 'active',
          expires_at: new Date(expiryIso),
        },
      });
    }
  );

  return {
    ok: true,
    renewed: false,
    reservation: {
      id: reservation.id,
      assetId: reservation.asset_id,
      token: reservation.token,
      actor: reservation.actor,
      status: reservation.status as ReservationStatus,
      expiresAt: reservation.expires_at.toISOString(),
      createdAt: reservation.created_at.toISOString(),
    },
  };
}

export type ReleaseReservationResult =
  { ok: true } | { ok: false; reason: 'not_found' | 'token_mismatch' };

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
  const active = await db.assetReservation.findFirst({
    where: { asset_id: input.assetId, status: 'active' },
    orderBy: { created_at: 'desc' },
  });

  if (!active) return { ok: false, reason: 'not_found' };
  if (active.token !== input.token) return { ok: false, reason: 'token_mismatch' };

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
}

export type ExpireReservationResult =
  { ok: true } | { ok: false; reason: 'not_found' | 'not_expired' };

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
  const active = await db.assetReservation.findFirst({
    where: { asset_id: input.assetId, status: 'active' },
    orderBy: { created_at: 'desc' },
  });

  if (!active) return { ok: false, reason: 'not_found' };
  if (!isReservationExpired(active.expires_at, currentDate)) {
    return { ok: false, reason: 'not_expired' };
  }

  await withAudit(
    db,
    {
      actor: input.actor ?? 'system',
      action: 'asset.reservation_expired',
      entityType: 'asset',
      entityId: input.assetId,
      details: {
        from: 'reserved',
        to: 'available',
        token: active.token,
        reason: 'timeout',
      },
    },
    async (tx) => {
      await tx.assetReservation.update({
        where: { id: active.id },
        data: { status: 'expired' },
      });
      await tx.asset.update({
        where: { id: input.assetId },
        data: { status: 'available' },
      });
    }
  );

  return { ok: true };
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
  const active = await db.assetReservation.findFirst({
    where: {
      asset_id: input.assetId,
      status: 'active',
      ...(input.token ? { token: input.token } : {}),
    },
    orderBy: { created_at: 'desc' },
  });

  if (!active) return { ok: false };

  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'asset.reservation_completed',
      entityType: 'asset',
      entityId: input.assetId,
      details: {
        token: active.token,
        reason: 'contract_signed',
      },
    },
    async (tx) => {
      await tx.assetReservation.update({
        where: { id: active.id },
        data: { status: 'completed' },
      });
    }
  );

  return { ok: true };
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

  return {
    id: active.id,
    assetId: active.asset_id,
    token: active.token,
    actor: active.actor,
    status: active.status as ReservationStatus,
    expiresAt: active.expires_at.toISOString(),
    createdAt: active.created_at.toISOString(),
  };
}
