// The demo reset against a real database: whatever happened in the demo, the data pack's
// start state comes back, the audit log restarts with the reset itself, and uploaded photos
// survive.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers, loadSecondLifeDemand } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import { listAuditLog } from './audit';
import { createCustomer, seedCustomers } from './customers';
import { DEMO_START_DATE, resetDemo } from './demo-reset';
import { executeSecondLife } from './second-life';
import { seedWaitlist } from './waitlist';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let test: TestDb;
beforeAll(async () => {
  test = await createTestDb();
  await seedAssets(test.db, await loadAssets());
  await seedCustomers(test.db, await loadCustomers());
  await seedWaitlist(test.db, await loadSecondLifeDemand());
});
afterAll(async () => {
  await test.cleanup();
});

describe('resetDemo', () => {
  it('undoes a demo: desk work, offers, new customers and the audit trail', async () => {
    const { db } = test;
    const executed = await executeSecondLife(db, {
      assetId: 'ebike-007',
      actor: 'staff',
      asOf: '2026-11-05',
    });
    if (!executed.ok) throw new Error(executed.reason);
    await createCustomer(db, { name: 'Demo Person', email: '', type: 'consumer', actor: 'x' });
    await db.asset.update({ where: { id: 'ebike-003' }, data: { image_path: 'ebike-003.jpg' } });
    expect(await db.assetEvent.count()).toBeGreaterThan(0);

    const result = await resetDemo(db, { actor: 'staff' });

    const [assets, customers, demand] = await Promise.all([
      loadAssets(),
      loadCustomers(),
      loadSecondLifeDemand(),
    ]);
    expect(result).toEqual({
      startDate: DEMO_START_DATE,
      assets: assets.length,
      customers: customers.length,
      waitlist: demand.length,
    });
    expect(await db.asset.count()).toBe(assets.length);
    expect(await db.customer.count()).toBe(customers.length);
    expect(await db.waitlistEntry.count({ where: { status: 'waiting' } })).toBe(demand.length);
    expect(await db.assetEvent.count()).toBe(0);
    expect(await db.reservation.count()).toBe(0);

    const ebike = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-007' } });
    expect(ebike).toMatchObject({
      status: 'returned',
      condition: 'fair',
      usage_value: 18_400,
      second_life_price_cents: null,
    });
    // A photo is presentation, not demo state.
    const photo = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });
    expect(photo.image_path).toBe('ebike-003.jpg');

    const audit = await listAuditLog(db, 100);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actor: 'staff',
      action: 'demo.reset',
      details: { startDate: '2026-01-01' },
    });
  });
});
