// Holds lapse by themselves when the clock moves forward, against a real (test) database:
// an approval nobody signs, a waiting-list offer nobody answers (and the next one after
// it), and a nomination nobody uses.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers, loadSecondLifeDemand } from '@/data/load';
import { ainoScript, applyAndSubmit } from '../../tests/helpers/apply-and-submit';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import { seedCustomers } from './customers';
import { expireLapsedHolds, SYSTEM_ACTOR } from './hold-expiry';
import { executeSecondLife } from './second-life';
import { seedWaitlist } from './waitlist';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
const DAY0 = '2026-11-05';

async function freshDb(): Promise<TestDb> {
  const test = await createTestDb();
  await seedAssets(test.db, await loadAssets());
  await seedCustomers(test.db, await loadCustomers());
  await seedWaitlist(test.db, await loadSecondLifeDemand());
  return test;
}

describe('an approval nobody signs', () => {
  let test: TestDb;
  let applicationId = '';
  beforeAll(async () => {
    test = await freshDb();
    const state = await applyAndSubmit(test.db, {
      customerId: 'cust-aino',
      assetIds: ['ebike-003'],
      downPaymentCents: 0,
      termMonths: 36,
      script: ainoScript,
      asOf: DAY0,
    });
    expect(state.application).toMatchObject({ status: 'approved', holdUntil: '2026-11-12' });
    applicationId = state.application.id;
  });
  afterAll(async () => {
    await test.cleanup();
  });

  it('still holds the item on its last day', async () => {
    const summary = await expireLapsedHolds(test.db, { from: DAY0, to: '2026-11-12' });
    expect(summary.applications).toEqual([]);
    const asset = await test.db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });
    expect(asset.status).toBe('reserved');
  });

  it('ends the day after: application expired, item back, logged as the system', async () => {
    const summary = await expireLapsedHolds(test.db, { from: '2026-11-12', to: '2026-11-20' });
    expect(summary.days).toEqual(['2026-11-13']);
    expect(summary.applications).toEqual([
      { day: '2026-11-13', applicationId, releasedAssetIds: ['ebike-003'] },
    ]);
    const application = await test.db.application.findUniqueOrThrow({
      where: { id: applicationId },
    });
    expect(application.status).toBe('expired');
    const asset = await test.db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });
    expect(asset.status).toBe('available');
    const audit = await test.db.auditLog.findFirstOrThrow({
      where: { action: 'application.hold_expired', entity_id: applicationId },
    });
    expect(audit.actor).toBe(SYSTEM_ACTOR);
  });

  it('does nothing when run again over the same days', async () => {
    const again = await expireLapsedHolds(test.db, { from: '2026-11-12', to: '2026-11-20' });
    expect(again).toEqual({ days: [], applications: [], offers: [], nominations: [] });
  });
});

describe('a waiting-list offer nobody answers', () => {
  let test: TestDb;
  beforeAll(async () => {
    test = await freshDb();
    // ebike-008 goes to wait-01, held for 3 days: through 8 Nov.
    const executed = await executeSecondLife(test.db, {
      assetId: 'ebike-008',
      actor: 'staff',
      asOf: DAY0,
    });
    if (!executed.ok || executed.applied !== 'offer') throw new Error('expected an offer');
  });
  afterAll(async () => {
    await test.cleanup();
  });

  it('is still open on its last day', async () => {
    await expireLapsedHolds(test.db, { from: DAY0, to: '2026-11-08' });
    const entry = await test.db.waitlistEntry.findUniqueOrThrow({ where: { id: 'wait-01' } });
    expect(entry.status).toBe('offered');
  });

  it('passes on day by day: each next offer gets its own 3 days, then lapses in turn', async () => {
    const summary = await expireLapsedHolds(test.db, { from: '2026-11-08', to: '2026-11-30' });
    // wait-01 lapses on 9 Nov; whoever got it next lapses 3 days after that, and so on.
    expect(summary.offers[0]).toEqual({
      day: '2026-11-09',
      entryId: 'wait-01',
      assetIds: ['ebike-008'],
    });
    for (let i = 1; i < summary.offers.length; i++) {
      expect(summary.offers[i]!.day > summary.offers[i - 1]!.day).toBe(true);
    }
    const first = await test.db.waitlistEntry.findUniqueOrThrow({ where: { id: 'wait-01' } });
    expect(first).toMatchObject({ status: 'removed', left_reason: 'offer_expired' });

    // Every offer was dated the day it was made, and the item ends either listed or held by
    // an offer that is still running on the 30th.
    const offers = await test.db.assetEvent.findMany({
      where: { asset_id: 'ebike-008', type: 'offered_to_waiter' },
      orderBy: { id: 'asc' },
    });
    expect(offers[0]!.on_date).toBe(DAY0);
    expect(offers.slice(1).map((o) => o.on_date)).toEqual(
      summary.offers.slice(0, offers.length - 1).map((o) => o.day)
    );
    const holds = await test.db.reservation.findMany({
      where: { asset_id: 'ebike-008', active: true },
    });
    const asset = await test.db.asset.findUniqueOrThrow({ where: { id: 'ebike-008' } });
    if (holds.length === 0) expect(asset.status).toBe('available');
    else expect(holds.every((h) => h.until >= '2026-11-30')).toBe(true);
  });
});

describe('a nomination nobody uses', () => {
  let test: TestDb;
  beforeAll(async () => {
    test = await freshDb();
    await test.db.reservation.create({
      data: { asset_id: 'ebike-004', kind: 'nomination', until: '2026-11-10' },
    });
  });
  afterAll(async () => {
    await test.cleanup();
  });

  it('ends the day after its last day', async () => {
    const summary = await expireLapsedHolds(test.db, { from: DAY0, to: '2026-11-11' });
    expect(summary.nominations).toEqual([{ day: '2026-11-11', assetId: 'ebike-004' }]);
    expect(
      await test.db.reservation.count({ where: { asset_id: 'ebike-004', active: true } })
    ).toBe(0);
  });
});

describe('catching up', () => {
  let test: TestDb;
  beforeAll(async () => {
    test = await freshDb();
    await test.db.reservation.create({
      data: { asset_id: 'ebike-004', kind: 'nomination', until: '2026-10-01' },
    });
  });
  afterAll(async () => {
    await test.cleanup();
  });

  it('a hold that lapsed before the clock last moved ends on the first day', async () => {
    const summary = await expireLapsedHolds(test.db, { from: DAY0, to: '2026-11-06' });
    expect(summary.nominations).toEqual([{ day: '2026-11-06', assetId: 'ebike-004' }]);
  });
});

describe('an item seeded as reserved with no hold at all', () => {
  it('is freed by the overnight run: offered to the waiting list or back in the catalogue', async () => {
    const test = await freshDb();
    // The data pack ships ebike-009 as `reserved` without any reservation row: nothing
    // could ever lapse on it, so before this rule it stayed reserved forever.
    const before = await test.db.asset.findUniqueOrThrow({ where: { id: 'ebike-009' } });
    expect(before.status).toBe('reserved');
    expect(await test.db.reservation.count({ where: { asset_id: 'ebike-009' } })).toBe(0);

    await expireLapsedHolds(test.db, { from: DAY0, to: '2026-11-06' });

    // Either listed again, or offered onward — but never reserved without a live hold.
    const after = await test.db.asset.findUniqueOrThrow({ where: { id: 'ebike-009' } });
    if (after.status === 'reserved') {
      expect(
        await test.db.reservation.count({ where: { asset_id: 'ebike-009', active: true } })
      ).toBeGreaterThan(0);
    }
    const audit = await test.db.auditLog.findFirst({
      where: { action: 'asset.orphaned_reservation_released' },
    });
    expect(audit?.actor).toBe(SYSTEM_ACTOR);
    await test.cleanup();
  });
});
