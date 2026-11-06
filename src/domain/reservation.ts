// Pure domain logic for asset reservations.
// Holds rules for timeout calculation, expiration checking, reserve permissions,
// and decision-based release. No I/O, no DB, no Date.now().

export type ReservationStatus = 'active' | 'released' | 'expired' | 'completed';

export type ReservationReleaseReason =
  'rejected' | 'abandoned' | 'cancelled' | 'timeout' | 'completed';

export const DEFAULT_RESERVATION_TIMEOUT_MINUTES = 15;
export const DEFAULT_RESERVATION_TIMEOUT_MS = DEFAULT_RESERVATION_TIMEOUT_MINUTES * 60 * 1000;

function toEpochMs(value: string | Date | number): number {
  if (typeof value === 'number') return value;
  const ms = typeof value === 'string' ? Date.parse(value) : value.getTime();
  if (Number.isNaN(ms)) {
    throw new TypeError(`Invalid date: ${String(value)}`);
  }
  return ms;
}

/** Returns true when `now` has reached or passed `expiresAt`. */
export function isReservationExpired(
  expiresAt: string | Date | number,
  now: string | Date | number
): boolean {
  return toEpochMs(now) >= toEpochMs(expiresAt);
}

/** Computes the future expiry ISO timestamp from a given `now` point and timeout in minutes. */
export function calculateReservationExpiry(
  now: string | Date | number,
  timeoutMinutes = DEFAULT_RESERVATION_TIMEOUT_MINUTES
): string {
  if (timeoutMinutes <= 0) {
    throw new RangeError(`timeoutMinutes must be positive, got ${timeoutMinutes}`);
  }
  const baseMs = toEpochMs(now);
  const expiryMs = baseMs + timeoutMinutes * 60 * 1000;
  return new Date(expiryMs).toISOString();
}

/** Remaining whole seconds until `expiresAt`, floored at 0. */
export function remainingReservationSeconds(
  expiresAt: string | Date | number,
  now: string | Date | number
): number {
  const diffMs = toEpochMs(expiresAt) - toEpochMs(now);
  return Math.max(0, Math.floor(diffMs / 1000));
}

/** Formats a whole number of seconds as mm:ss (e.g. 14:59). */
export function formatRemainingTime(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export type CanReserveAssetParams = {
  assetStatus: string;
  activeReservation: {
    status: ReservationStatus;
    expiresAt: string | Date | number;
    token: string;
  } | null;
  candidateToken?: string | null;
  now: string | Date | number;
};

export type CanReserveResult =
  | { canReserve: true; reason: 'available' | 'renewed' | 'expired_takeover' }
  | { canReserve: false; reason: 'asset_not_available' | 'already_reserved' };

/**
 * Determines whether an asset can be reserved by a candidate.
 * Handles existing reservation tokens for session continuity and allows takeover
 * if a previous reservation has timed out.
 */
export function canReserveAsset({
  assetStatus,
  activeReservation,
  candidateToken,
  now,
}: CanReserveAssetParams): CanReserveResult {
  if (assetStatus === 'returned') {
    return { canReserve: false, reason: 'asset_not_available' };
  }

  if (assetStatus === 'available') {
    return { canReserve: true, reason: 'available' };
  }

  if (assetStatus === 'reserved') {
    if (!activeReservation || activeReservation.status !== 'active') {
      // Reserved permanently (e.g. initial catalogue data) or without active record.
      return { canReserve: false, reason: 'already_reserved' };
    }

    if (isReservationExpired(activeReservation.expiresAt, now)) {
      return { canReserve: true, reason: 'expired_takeover' };
    }

    if (candidateToken && candidateToken === activeReservation.token) {
      return { canReserve: true, reason: 'renewed' };
    }

    return { canReserve: false, reason: 'already_reserved' };
  }

  return { canReserve: false, reason: 'asset_not_available' };
}

/**
 * Pure rule: an application that ends in refusal ('no') must release the asset
 * reservation so other customers can lease it immediately.
 */
export function shouldReleaseReservationOnDecision(decisionKind: string): boolean {
  return decisionKind === 'no';
}
