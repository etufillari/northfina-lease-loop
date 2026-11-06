import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { ApiError } from './api-response';
import { seedAssets } from './assets';
import type { PrismaClient } from './prisma-client';
import { activeReservedRequestIds, reserveSecondLife } from './second-life-reservations';

let db: PrismaClient;
let cleanup: () => Promise<void>;

const actor = 'test-dealer';
const availableDate = '2026-11-06';

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  await db.secondLifeReservation.deleteMany();
  await db.wishlistRequest.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
});

function errorCode(promise: Promise<unknown>) {
  return promise.then(
    () => 'NO_ERROR',
    (error: unknown) => (error instanceof ApiError ? error.code : 'UNEXPECTED_ERROR')
  );
}

describe('reserveSecondLife', () => {
  it('can reserve a returned asset for a matching customer wishlist request', async () => {
    await db.wishlistRequest.create({
      data: {
        id: 'wishlist-1',
        asset_id: 'ebike-007',
        customer_id: 'cust-pekka',
        minimum_condition: 'fair',
        max_monthly_net_rent_cents: 100_000,
        preferred_term_months: 24,
        needed_by: '2026-11-07',
        status: 'requested',
      },
    });

    const reservation = await reserveSecondLife(db, { assetId: 'ebike-007', availableDate, actor });

    expect(reservation.waiting_request_id).toBe('wishlist:wishlist-1');
    expect(
      await db.wishlistRequest.findUniqueOrThrow({ where: { id: 'wishlist-1' } })
    ).toMatchObject({
      status: 'matched',
    });
  });

  it('holds ebike-007 for wait-13 with the terms and the reason saved', async () => {
    const reservation = await reserveSecondLife(db, { assetId: 'ebike-007', availableDate, actor });

    expect(reservation).toMatchObject({
      asset_id: 'ebike-007',
      waiting_request_id: 'wait-13',
      status: 'reserved',
      reserved_by: actor,
      target_condition: 'good',
      term_months: 24,
      monthly_net_rent_cents: 5_556,
      refurbishment_cost_cents: 51_500,
      payback_months: 10,
      needed_by: '2026-11-10',
    });

    const snapshot = JSON.parse(reservation.decision_json);
    expect(snapshot.ranked[0]).toMatchObject({ rank: 1, requestId: 'wait-13' });
    expect(snapshot.comparisons).toContainEqual({
      winnerRequestId: 'wait-13',
      otherRequestId: 'wait-02',
      decidedBy: 'condition_requirement',
    });
  });

  it('moves the asset from returned to reserved and writes one audit row', async () => {
    const reservation = await reserveSecondLife(db, { assetId: 'ebike-007', availableDate, actor });

    expect((await db.asset.findUniqueOrThrow({ where: { id: 'ebike-007' } })).status).toBe(
      'reserved'
    );

    const audit = await db.auditLog.findMany({ where: { action: 'second_life.reserved' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor, entity_id: reservation.id });
    expect(JSON.parse(audit[0]?.details_json ?? '{}')).toMatchObject({
      assetId: 'ebike-007',
      waitingRequestId: 'wait-13',
      asset: { status: { from: 'returned', to: 'reserved' } },
    });
  });

  it('cannot reserve the same asset twice', async () => {
    await reserveSecondLife(db, { assetId: 'ebike-007', availableDate, actor });
    expect(
      await errorCode(reserveSecondLife(db, { assetId: 'ebike-007', availableDate, actor }))
    ).toBe('ASSET_NOT_RETURNED');
    expect(await db.secondLifeReservation.count()).toBe(1);
  });

  it('gives a request to only one asset: the next asset skips a request already taken', async () => {
    await reserveSecondLife(db, { assetId: 'ebike-007', availableDate, actor });
    expect(await activeReservedRequestIds(db)).toEqual(new Set(['wait-13']));

    const second = await reserveSecondLife(db, { assetId: 'ebike-008', availableDate, actor });
    const snapshot = JSON.parse(second.decision_json);

    expect(second.waiting_request_id).not.toBe('wait-13');
    expect(snapshot.ranked.map((entry: { requestId: string }) => entry.requestId)).not.toContain(
      'wait-13'
    );
  });

  it('falls to the next request when the better one is already taken', async () => {
    await db.secondLifeReservation.create({
      data: {
        id: 'earlier',
        asset_id: 'ebike-008',
        waiting_request_id: 'wait-13',
        who: 'x',
        status: 'reserved',
        reserved_by: actor,
        available_date: availableDate,
        needed_by: '2026-11-10',
        target_condition: 'good',
        term_months: 24,
        monthly_net_rent_cents: 1,
        refurbishment_cost_cents: 1,
        payback_months: 1,
        decision_json: '{}',
      },
    });

    const reservation = await reserveSecondLife(db, { assetId: 'ebike-007', availableDate, actor });
    expect(reservation.waiting_request_id).toBe('wait-02');
  });

  it('refuses an asset that is not returned', async () => {
    expect(
      await errorCode(reserveSecondLife(db, { assetId: 'ebike-001', availableDate, actor }))
    ).toBe('ASSET_NOT_RETURNED');
  });

  it('refuses an unknown asset', async () => {
    expect(await errorCode(reserveSecondLife(db, { assetId: 'nope', availableDate, actor }))).toBe(
      'ASSET_NOT_FOUND'
    );
  });

  it('refuses when no request can be served and leaves the asset alone', async () => {
    // A farm machine needs its service history to price the work; without it nothing matches.
    expect(
      await errorCode(reserveSecondLife(db, { assetId: 'farm-005', availableDate, actor }))
    ).toBe('NO_VIABLE_MATCH');
    expect((await db.asset.findUniqueOrThrow({ where: { id: 'farm-005' } })).status).toBe(
      'returned'
    );
    expect(await db.secondLifeReservation.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
  });

  it('rejects an invalid date and a missing actor', async () => {
    await expect(
      reserveSecondLife(db, { assetId: 'ebike-007', availableDate: '2026-13-40', actor })
    ).rejects.toThrow();
    await expect(
      reserveSecondLife(db, { assetId: 'ebike-007', availableDate, actor: '  ' })
    ).rejects.toThrow();
  });
});
