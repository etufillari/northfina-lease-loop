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

class ReservationConflictError extends Error {
  constructor(
    public readonly reason: 'asset_not_available' | 'already_reserved',
    public readonly expiresAt?: string
  ) {
    super(reason);
  }
}

/**
 * Reserves an asset for a lease application in progress.
 * If the applicant already holds the active reservation, its expiry is extended (renewed).
 * If a previous reservation expired, it is superseded.
 * Uses atomic compare-and-set within the transaction to prevent concurrent reservation races.
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

  const auditEntry = {
    actor: input.actor,
    action: 'asset.reserved',
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

      const token = input.token?.trim() || randomUUID();
      const expiryIso = calculateReservationExpiry(currentDate, timeoutMinutes);

      auditEntry.action = 'asset.reserved';
      auditEntry.details = {
        from: currentAsset.status,
        to: 'reserved',
        token,
        expiresAt: expiryIso,
        reason: 'application_started',
      };

      const created = await tx.assetReservation.create({
        data: {
          asset_id: input.assetId,
          token,
          actor: input.actor,
          status: 'active',
          expires_at: new Date(expiryIso),
        },
      });

      return {
        ok: true as const,
        renewed: false,
        reservation: {
          id: created.id,
          assetId: created.asset_id,
          token: created.token,
          actor: created.actor,
          status: created.status as ReservationStatus,
          expiresAt: created.expires_at.toISOString(),
          createdAt: created.created_at.toISOString(),
        },
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
