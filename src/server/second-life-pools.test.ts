// Pooling for a multi-item waiter, against a real database. wait-08 (a non-profit) needs three
// office laptops and is first in the laptop queue, so the two returned laptops are held for
// them rather than offered to anyone else; a full pool is offered as one set, and a pool that
// misses the deadline is released to the catalogue.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadSecondLifeDemand } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import { executeSecondLife, listReturnedDecisions, previewSecondLife } from './second-life';
import { listPools, releasePool } from './second-life-pools';
import { seedWaitlist } from './waitlist';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
const AS_OF = '2026-11-05';

async function freshDb(): Promise<TestDb> {
  const test = await createTestDb();
  await seedAssets(test.db, await loadAssets());
  await seedWaitlist(test.db, await loadSecondLifeDemand());
  return test;
}

describe('pooling laptops for wait-08', () => {
  let test: TestDb;
  beforeAll(async () => {
    test = await freshDb();
  });
  afterAll(async () => {
    await test.cleanup();
  });

  it('the desk holds both returned laptops for wait-08 instead of offering them', async () => {
    const desk = await listReturnedDecisions(test.db, AS_OF);
    const outcome = (id: string) => {
      const entry = desk.find((d) => d.assetId === id)!;
      return entry.result.ok ? entry.result.preview.outcome : null;
    };
    expect(outcome('laptop-006')).toEqual({
      kind: 'pool',
      waiterId: 'wait-08',
      filled: 1,
      quantity: 3,
    });
    expect(outcome('laptop-007')).toEqual({
      kind: 'pool',
      waiterId: 'wait-08',
      filled: 2,
      quantity: 3,
    });
  });

  it('executing laptop-007 first refurbishes it and holds it until wait-08’s deadline', async () => {
    const result = await executeSecondLife(test.db, {
      assetId: 'laptop-007',
      actor: 'staff-desk',
      asOf: AS_OF,
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.applied).toBe('pool');

    const asset = await test.db.asset.findUniqueOrThrow({ where: { id: 'laptop-007' } });
    expect(asset.status).toBe('reserved');
    const hold = await test.db.reservation.findFirstOrThrow({
      where: { asset_id: 'laptop-007', active: true },
    });
    expect(hold).toMatchObject({ kind: 'waitlist_pool', until: '2026-11-12' });
    const events = await test.db.assetEvent.findMany({
      where: { asset_id: 'laptop-007' },
      orderBy: { id: 'asc' },
    });
    expect(events.map((e) => e.type)).toEqual(['refurbished', 'pooled_for_waiter']);
    expect(JSON.parse(events[1]!.details_json!)).toMatchObject({
      waiterId: 'wait-08',
      filled: 1,
      quantity: 3,
    });

    const waiter = await test.db.waitlistEntry.findUniqueOrThrow({ where: { id: 'wait-08' } });
    expect(waiter.status).toBe('waiting');
    const audit = await test.db.auditLog.findFirstOrThrow({
      where: { action: 'asset.second_life_executed', entity_id: 'laptop-007' },
    });
    expect(JSON.parse(audit.details_json!).outcome).toBe('pool');
  });

  it('lists the open pool, and will not release it before the deadline', async () => {
    const pools = await listPools(test.db, AS_OF);
    expect(pools).toHaveLength(1);
    expect(pools[0]).toMatchObject({ assetIds: ['laptop-007'], expired: false });
    expect(pools[0]!.waiter.id).toBe('wait-08');

    const early = { waiterId: 'wait-08', actor: 'staff-desk', asOf: AS_OF };
    expect(await releasePool(test.db, early)).toEqual({ ok: false, reason: 'not_expired' });
    expect(await releasePool(test.db, { ...early, waiterId: 'wait-06' })).toEqual({
      ok: false,
      reason: 'no_pool',
    });
    expect(await releasePool(test.db, { ...early, waiterId: 'nobody' })).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('counts the held laptop on the next card', async () => {
    const result = await previewSecondLife(test.db, 'laptop-006', AS_OF);
    if (!result.ok) throw new Error(result.reason);
    expect(result.preview.outcome).toEqual({
      kind: 'pool',
      waiterId: 'wait-08',
      filled: 2,
      quantity: 3,
    });
    expect(result.preview.pooledAssetIds).toEqual(['laptop-007']);
  });

  it('offers the whole set together once the pool is full', async () => {
    // Two are enough for this test: the rule is the same for any quantity.
    await test.db.waitlistEntry.update({ where: { id: 'wait-08' }, data: { quantity: 2 } });
    const result = await executeSecondLife(test.db, {
      assetId: 'laptop-006',
      actor: 'staff-desk',
      asOf: AS_OF,
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.applied).toBe('complete_pool');

    for (const id of ['laptop-006', 'laptop-007']) {
      const holds = await test.db.reservation.findMany({ where: { asset_id: id, active: true } });
      expect(holds).toEqual([
        expect.objectContaining({ kind: 'waitlist_offer', until: '2026-11-08' }),
      ]);
      const offer = await test.db.assetEvent.findFirstOrThrow({
        where: { asset_id: id, type: 'offered_to_waiter' },
      });
      const details = JSON.parse(offer.details_json!);
      expect(details).toMatchObject({ waiterId: 'wait-08', setSize: 2, termMonths: 36 });
      expect(details.monthlyNetRentCents).toBeGreaterThan(0);
    }
    const waiter = await test.db.waitlistEntry.findUniqueOrThrow({ where: { id: 'wait-08' } });
    expect(waiter).toMatchObject({ status: 'offered', offered_asset_id: 'laptop-006' });
    expect(await listPools(test.db, AS_OF)).toEqual([]);
  });
});

describe('releasing a pool that missed its deadline', () => {
  let test: TestDb;
  beforeAll(async () => {
    test = await freshDb();
    const pooled = await executeSecondLife(test.db, {
      assetId: 'laptop-007',
      actor: 'staff-desk',
      asOf: AS_OF,
    });
    if (!pooled.ok || pooled.applied !== 'pool') throw new Error('expected a pool');
  });
  afterAll(async () => {
    await test.cleanup();
  });

  it('marks the pool expired after wait-08’s deadline and releases it to the catalogue', async () => {
    const after = '2026-11-13';
    expect((await listPools(test.db, after))[0]?.expired).toBe(true);

    const result = await releasePool(test.db, {
      waiterId: 'wait-08',
      actor: 'staff-desk',
      asOf: after,
    });
    expect(result).toEqual({ ok: true, releasedAssetIds: ['laptop-007'] });

    const asset = await test.db.asset.findUniqueOrThrow({ where: { id: 'laptop-007' } });
    expect(asset.status).toBe('available');
    expect(
      await test.db.reservation.count({ where: { asset_id: 'laptop-007', active: true } })
    ).toBe(0);
    const released = await test.db.assetEvent.findFirstOrThrow({
      where: { asset_id: 'laptop-007', type: 'pool_released' },
    });
    expect(JSON.parse(released.details_json!)).toMatchObject({
      waiterId: 'wait-08',
      reason: 'deadline_passed',
    });
    expect(
      await test.db.auditLog.count({
        where: { action: 'waitlist.pool_released', entity_id: 'wait-08' },
      })
    ).toBe(1);
    expect(await listPools(test.db, after)).toEqual([]);
  });
});
