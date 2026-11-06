import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import type { Asset } from '@/data/schemas';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import type { PrismaClient } from './prisma-client';
import {
  completeReservation,
  expireReservation,
  getActiveReservation,
  releaseReservation,
  reserveAsset,
} from './reservations';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let dataPack: Asset[];

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  dataPack = await loadAssets();
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  await db.auditLog.deleteMany();
  await db.assetReservation.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, dataPack);
});

describe('reserveAsset', () => {
  it('reserves an available asset and writes audit log', async () => {
    const now = new Date('2026-11-06T12:00:00.000Z');
    const result = await reserveAsset(db, {
      assetId: 'ebike-001',
      actor: 'customer-aino',
      timeoutMinutes: 15,
      now,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.renewed).toBe(false);
    expect(result.reservation.assetId).toBe('ebike-001');
    expect(result.reservation.actor).toBe('customer-aino');
    expect(result.reservation.status).toBe('active');
    expect(result.reservation.expiresAt).toBe('2026-11-06T12:15:00.000Z');

    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-001' } });
    expect(asset.status).toBe('reserved');

    const audits = await db.auditLog.findMany({ where: { entity_id: 'ebike-001' } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'asset.reserved',
      actor: 'customer-aino',
      entity_type: 'asset',
      entity_id: 'ebike-001',
    });
  });

  it('prevents concurrent lease applications for the same asset', async () => {
    const now = new Date('2026-11-06T12:00:00.000Z');
    const first = await reserveAsset(db, {
      assetId: 'ebike-001',
      actor: 'customer-1',
      now,
    });
    expect(first.ok).toBe(true);

    const second = await reserveAsset(db, {
      assetId: 'ebike-001',
      actor: 'customer-2',
      now,
    });

    expect(second).toMatchObject({
      ok: false,
      reason: 'already_reserved',
    });
  });

  it('prevents simultaneous concurrent reservations via Promise.all', async () => {
    const now = new Date('2026-11-06T12:00:00.000Z');
    const [first, second] = await Promise.all([
      reserveAsset(db, { assetId: 'ebike-005', actor: 'alice', now }),
      reserveAsset(db, { assetId: 'ebike-005', actor: 'bob', now }),
    ]);

    const successes = [first, second].filter((r) => r.ok);
    const failures = [first, second].filter((r) => !r.ok);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ ok: false, reason: 'already_reserved' });

    const activeReservations = await db.assetReservation.findMany({
      where: { asset_id: 'ebike-005', status: 'active' },
    });
    expect(activeReservations).toHaveLength(1);
  });

  it('renews the reservation when applicant provides matching token', async () => {
    const t0 = new Date('2026-11-06T12:00:00.000Z');
    const first = await reserveAsset(db, {
      assetId: 'ebike-001',
      actor: 'customer-1',
      now: t0,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const t1 = new Date('2026-11-06T12:05:00.000Z');
    const renewed = await reserveAsset(db, {
      assetId: 'ebike-001',
      actor: 'customer-1',
      token: first.reservation.token,
      timeoutMinutes: 15,
      now: t1,
    });

    expect(renewed.ok).toBe(true);
    if (!renewed.ok) return;

    expect(renewed.renewed).toBe(true);
    expect(renewed.reservation.token).toBe(first.reservation.token);
    expect(renewed.reservation.expiresAt).toBe('2026-11-06T12:20:00.000Z');
  });

  it('supersedes an expired reservation and grants asset to new applicant', async () => {
    const t0 = new Date('2026-11-06T12:00:00.000Z');
    const first = await reserveAsset(db, {
      assetId: 'ebike-001',
      actor: 'customer-1',
      timeoutMinutes: 10,
      now: t0,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const t1 = new Date('2026-11-06T12:15:00.000Z');
    const second = await reserveAsset(db, {
      assetId: 'ebike-001',
      actor: 'customer-2',
      timeoutMinutes: 15,
      now: t1,
    });

    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.renewed).toBe(false);
    expect(second.reservation.actor).toBe('customer-2');

    const old = await db.assetReservation.findUniqueOrThrow({
      where: { id: first.reservation.id },
    });
    expect(old.status).toBe('expired');
  });

  it('rejects nonexistent asset with not_found', async () => {
    const result = await reserveAsset(db, {
      assetId: 'nonexistent',
      actor: 'customer',
    });
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('rejects returned asset with asset_not_available', async () => {
    await db.asset.update({ where: { id: 'ebike-001' }, data: { status: 'returned' } });
    const result = await reserveAsset(db, {
      assetId: 'ebike-001',
      actor: 'customer',
    });
    expect(result).toEqual({ ok: false, reason: 'asset_not_available' });
  });
});

describe('releaseReservation', () => {
  it('cancels active reservation, reverts status to available and audits', async () => {
    const res = await reserveAsset(db, { assetId: 'ebike-001', actor: 'customer' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const result = await releaseReservation(db, {
      assetId: 'ebike-001',
      token: res.reservation.token,
      actor: 'customer',
      reason: 'cancelled',
    });

    expect(result).toEqual({ ok: true });

    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-001' } });
    expect(asset.status).toBe('available');

    const reservation = await db.assetReservation.findUniqueOrThrow({
      where: { id: res.reservation.id },
    });
    expect(reservation.status).toBe('released');

    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: 'asset.reservation_cancelled' },
    });
    expect(audit).toMatchObject({
      entity_id: 'ebike-001',
      details_json: expect.stringContaining('"reason":"cancelled"'),
    });
  });

  it('rejects token mismatch', async () => {
    const res = await reserveAsset(db, { assetId: 'ebike-001', actor: 'customer' });
    expect(res.ok).toBe(true);

    const result = await releaseReservation(db, {
      assetId: 'ebike-001',
      token: 'wrong-token',
      actor: 'customer',
      reason: 'abandoned',
    });

    expect(result).toEqual({ ok: false, reason: 'token_mismatch' });
  });

  it('returns not_found if no active reservation exists', async () => {
    const result = await releaseReservation(db, {
      assetId: 'ebike-001',
      token: 'random-token',
      actor: 'customer',
      reason: 'rejected',
    });

    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('expireReservation', () => {
  it('expires a timed-out reservation and frees the asset', async () => {
    const t0 = new Date('2026-11-06T12:00:00.000Z');
    const res = await reserveAsset(db, {
      assetId: 'ebike-001',
      actor: 'customer',
      timeoutMinutes: 10,
      now: t0,
    });
    expect(res.ok).toBe(true);

    const t1 = new Date('2026-11-06T12:11:00.000Z');
    const expired = await expireReservation(db, {
      assetId: 'ebike-001',
      now: t1,
    });
    expect(expired).toEqual({ ok: true });

    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-001' } });
    expect(asset.status).toBe('available');

    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: 'asset.reservation_expired' },
    });
    expect(audit).toMatchObject({
      entity_id: 'ebike-001',
      details_json: expect.stringContaining('"reason":"timeout"'),
    });
  });

  it('refuses to expire an unexpired reservation', async () => {
    const t0 = new Date('2026-11-06T12:00:00.000Z');
    await reserveAsset(db, {
      assetId: 'ebike-001',
      actor: 'customer',
      timeoutMinutes: 15,
      now: t0,
    });

    const early = await expireReservation(db, {
      assetId: 'ebike-001',
      now: new Date('2026-11-06T12:05:00.000Z'),
    });
    expect(early).toEqual({ ok: false, reason: 'not_expired' });
  });
});

describe('completeReservation', () => {
  it('marks active reservation completed when lease contract signs', async () => {
    const res = await reserveAsset(db, { assetId: 'ebike-001', actor: 'customer' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const completed = await completeReservation(db, {
      assetId: 'ebike-001',
      token: res.reservation.token,
      actor: 'customer',
    });
    expect(completed).toEqual({ ok: true });

    const row = await db.assetReservation.findUniqueOrThrow({ where: { id: res.reservation.id } });
    expect(row.status).toBe('completed');
  });
});

describe('getActiveReservation', () => {
  it('returns active reservation details', async () => {
    const res = await reserveAsset(db, { assetId: 'ebike-001', actor: 'customer' });
    expect(res.ok).toBe(true);

    const active = await getActiveReservation(db, 'ebike-001');
    expect(active?.assetId).toBe('ebike-001');
    expect(active?.status).toBe('active');
  });

  it('lazily expires and returns null if timeout was reached', async () => {
    const t0 = new Date('2026-11-06T12:00:00.000Z');
    await reserveAsset(db, {
      assetId: 'ebike-001',
      actor: 'customer',
      timeoutMinutes: 10,
      now: t0,
    });

    const t1 = new Date('2026-11-06T12:15:00.000Z');
    const active = await getActiveReservation(db, 'ebike-001', t1);
    expect(active).toBeNull();

    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-001' } });
    expect(asset.status).toBe('available');
  });
});
