import { describe, expect, it } from 'vitest';
import {
  calculateReservationExpiry,
  canReserveAsset,
  DEFAULT_RESERVATION_TIMEOUT_MINUTES,
  formatRemainingTime,
  isReservationExpired,
  remainingReservationSeconds,
  shouldReleaseReservationOnDecision,
} from './reservation';

describe('isReservationExpired', () => {
  it('returns false when now is before expiresAt', () => {
    expect(isReservationExpired('2026-11-06T12:15:00.000Z', '2026-11-06T12:00:00.000Z')).toBe(
      false
    );
  });

  it('returns true when now is exactly at expiresAt', () => {
    expect(isReservationExpired('2026-11-06T12:15:00.000Z', '2026-11-06T12:15:00.000Z')).toBe(true);
  });

  it('returns true when now is after expiresAt', () => {
    expect(isReservationExpired('2026-11-06T12:15:00.000Z', '2026-11-06T12:15:01.000Z')).toBe(true);
  });

  it('handles Date instances and epoch timestamps', () => {
    const expires = new Date('2026-11-06T12:15:00.000Z');
    const now = expires.getTime() + 1000;
    expect(isReservationExpired(expires, now)).toBe(true);
  });

  it('throws on invalid date inputs', () => {
    expect(() => isReservationExpired('invalid-date', '2026-11-06')).toThrow(TypeError);
  });
});

describe('calculateReservationExpiry', () => {
  it('adds default 15 minutes', () => {
    const now = '2026-11-06T12:00:00.000Z';
    expect(calculateReservationExpiry(now)).toBe('2026-11-06T12:15:00.000Z');
  });

  it('supports custom timeout minutes', () => {
    const now = '2026-11-06T12:00:00.000Z';
    expect(calculateReservationExpiry(now, 30)).toBe('2026-11-06T12:30:00.000Z');
    expect(calculateReservationExpiry(now, 1)).toBe('2026-11-06T12:01:00.000Z');
  });

  it('throws when timeout minutes is not positive', () => {
    expect(() => calculateReservationExpiry('2026-11-06T12:00:00.000Z', 0)).toThrow(RangeError);
    expect(() => calculateReservationExpiry('2026-11-06T12:00:00.000Z', -5)).toThrow(RangeError);
  });
});

describe('remainingReservationSeconds', () => {
  it('calculates remaining seconds correctly', () => {
    const now = '2026-11-06T12:00:00.000Z';
    const expires = '2026-11-06T12:01:30.500Z';
    expect(remainingReservationSeconds(expires, now)).toBe(90);
  });

  it('floors at 0 when expired', () => {
    const now = '2026-11-06T12:05:00.000Z';
    const expires = '2026-11-06T12:00:00.000Z';
    expect(remainingReservationSeconds(expires, now)).toBe(0);
  });
});

describe('formatRemainingTime', () => {
  it('formats various seconds as mm:ss', () => {
    expect(formatRemainingTime(0)).toBe('00:00');
    expect(formatRemainingTime(5)).toBe('00:05');
    expect(formatRemainingTime(59)).toBe('00:59');
    expect(formatRemainingTime(60)).toBe('01:00');
    expect(formatRemainingTime(65)).toBe('01:05');
    expect(formatRemainingTime(DEFAULT_RESERVATION_TIMEOUT_MINUTES * 60)).toBe('15:00');
    expect(formatRemainingTime(899)).toBe('14:59');
    expect(formatRemainingTime(-10)).toBe('00:00');
  });
});

describe('canReserveAsset', () => {
  const now = '2026-11-06T12:00:00.000Z';
  const futureExpiry = '2026-11-06T12:15:00.000Z';
  const pastExpiry = '2026-11-06T11:59:00.000Z';

  it('allows reserving an available asset', () => {
    expect(
      canReserveAsset({
        assetStatus: 'available',
        activeReservation: null,
        now,
      })
    ).toEqual({ canReserve: true, reason: 'available' });
  });

  it('rejects returned asset', () => {
    expect(
      canReserveAsset({
        assetStatus: 'returned',
        activeReservation: null,
        now,
      })
    ).toEqual({ canReserve: false, reason: 'asset_not_available' });
  });

  it('rejects asset reserved in data pack with no reservation record', () => {
    expect(
      canReserveAsset({
        assetStatus: 'reserved',
        activeReservation: null,
        now,
      })
    ).toEqual({ canReserve: false, reason: 'already_reserved' });
  });

  it('rejects when asset is reserved and existing record is not active', () => {
    expect(
      canReserveAsset({
        assetStatus: 'reserved',
        activeReservation: {
          status: 'released',
          expiresAt: futureExpiry,
          token: 'token-1',
        },
        now,
      })
    ).toEqual({ canReserve: false, reason: 'already_reserved' });
  });
  it('allows takeover when active reservation has expired', () => {
    expect(
      canReserveAsset({
        assetStatus: 'reserved',
        activeReservation: {
          status: 'active',
          expiresAt: pastExpiry,
          token: 'token-old',
        },
        candidateToken: 'token-new',
        now,
      })
    ).toEqual({ canReserve: true, reason: 'expired_takeover' });
  });

  it('allows renewal when candidate token matches active reservation', () => {
    expect(
      canReserveAsset({
        assetStatus: 'reserved',
        activeReservation: {
          status: 'active',
          expiresAt: futureExpiry,
          token: 'token-session',
        },
        candidateToken: 'token-session',
        now,
      })
    ).toEqual({ canReserve: true, reason: 'renewed' });
  });

  it('rejects when active reservation belongs to another holder', () => {
    expect(
      canReserveAsset({
        assetStatus: 'reserved',
        activeReservation: {
          status: 'active',
          expiresAt: futureExpiry,
          token: 'token-other',
        },
        candidateToken: 'token-me',
        now,
      })
    ).toEqual({ canReserve: false, reason: 'already_reserved' });

    expect(
      canReserveAsset({
        assetStatus: 'reserved',
        activeReservation: {
          status: 'active',
          expiresAt: futureExpiry,
          token: 'token-other',
        },
        candidateToken: null,
        now,
      })
    ).toEqual({ canReserve: false, reason: 'already_reserved' });
  });

  it('rejects unrecognised status', () => {
    expect(
      canReserveAsset({
        assetStatus: 'unknown',
        activeReservation: null,
        now,
      })
    ).toEqual({ canReserve: false, reason: 'asset_not_available' });
  });
});

describe('shouldReleaseReservationOnDecision', () => {
  it('returns true only for no', () => {
    expect(shouldReleaseReservationOnDecision('no')).toBe(true);
    expect(shouldReleaseReservationOnDecision('yes')).toBe(false);
    expect(shouldReleaseReservationOnDecision('manual_review')).toBe(false);
    expect(shouldReleaseReservationOnDecision('incomplete')).toBe(false);
  });
});
