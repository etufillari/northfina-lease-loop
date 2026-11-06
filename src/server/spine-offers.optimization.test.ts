import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import type { PrismaClient } from './prisma-client';
import { cataloguePrices } from './spine-offers';
import { getBootstrap } from './spine-offers';
import { demoContext } from '../../tests/helpers/spine';

let db: PrismaClient;
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await db.assetRelease.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
});

it('keeps readiness and source precedence when joining release records by asset ID', async () => {
  await db.assetRelease.create({
    data: {
      asset_id: 'ebike-003',
      revision: 1,
      net_price_cents: 130000,
      ready_on: '2026-11-05',
    },
  });
  await db.assetRelease.create({
    data: {
      asset_id: 'ebike-004',
      revision: 2,
      net_price_cents: null,
      ready_on: null,
    },
  });
  await db.assetRelease.create({
    data: {
      asset_id: 'laptop-004',
      revision: 3,
      net_price_cents: 100000,
      ready_on: '2027-01-01',
    },
  });
  const prices = await cataloguePrices(db, '2026-11-05');
  expect(prices['ebike-003']).toEqual({
    priceCents: 130000,
    source: 'release:1',
    releaseRevision: 1,
  });
  expect(prices['ebike-004']).toBeNull();
  expect(prices['laptop-004']).toBeNull();
  expect(prices['ebike-001']).toEqual({ priceCents: 189900, source: 'list:1', releaseRevision: 0 });
});

it('reports availability for the reservation owner only after the offer is ready', async () => {
  const aino = await demoContext('cust-aino', '2026-11-05');
  const lena = await demoContext('cust-lena', '2026-11-05');
  expect((await getBootstrap(db, aino, 'ebike-003')).availableForSelectedCustomer).toBe(true);
  expect((await getBootstrap(db, aino, 'ebike-007')).availableForSelectedCustomer).toBe(false);
  await db.assetRelease.create({
    data: {
      asset_id: 'ebike-003',
      revision: 1,
      net_price_cents: 130000,
      ready_on: '2026-11-05',
      reserved_for_customer_id: 'cust-lena',
    },
  });
  expect((await getBootstrap(db, aino, 'ebike-003')).availableForSelectedCustomer).toBe(false);
  expect((await getBootstrap(db, lena, 'ebike-003')).availableForSelectedCustomer).toBe(true);
  await db.assetRelease.update({
    where: { asset_id: 'ebike-003' },
    data: { ready_on: '2026-11-06' },
  });
  expect((await getBootstrap(db, lena, 'ebike-003')).availableForSelectedCustomer).toBe(false);
});
