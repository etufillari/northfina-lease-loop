// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadCustomers } from '@/data/load';
import type { Customer } from '@/data/schemas';
import { createTestDb } from '../../tests/helpers/test-db';
import { resetDb } from '../../tests/helpers/reset-db';
import {
  getCustomer,
  listCustomers,
  seedCustomers,
  toCustomer,
  toCustomerRowData,
} from './customers';
import type { PrismaClient } from './prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let dataPack: Customer[];

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  dataPack = await loadCustomers();
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetDb(db);
});

describe('seedCustomers', () => {
  it('inserts every customer from the data pack once', async () => {
    expect(await seedCustomers(db, dataPack)).toEqual({ created: 10, skipped: 0 });
    expect(await seedCustomers(db, dataPack)).toEqual({ created: 0, skipped: 10 });
    expect(await db.customer.count()).toBe(10);
  });

  it('does not overwrite a change you made', async () => {
    await seedCustomers(db, dataPack);
    await db.customer.update({ where: { id: 'cust-aino' }, data: { city: 'Turku' } });
    await seedCustomers(db, dataPack);
    expect((await db.customer.findUniqueOrThrow({ where: { id: 'cust-aino' } })).city).toBe(
      'Turku'
    );
  });

  it('adds only the missing ones when some are there', async () => {
    await seedCustomers(db, dataPack.slice(0, 3));
    expect(await seedCustomers(db, dataPack)).toEqual({ created: 7, skipped: 3 });
  });

  it('writes no audit rows (seeding is the one exception to withAudit)', async () => {
    const before = await db.auditLog.count();
    await seedCustomers(db, dataPack);
    expect(await db.auditLog.count()).toBe(before);
  });
});

describe('listCustomers', () => {
  it('returns every type in the data-pack shape, round-tripping exactly', async () => {
    await seedCustomers(db, dataPack);
    expect(await listCustomers(db)).toEqual(
      [...dataPack].sort((a, b) => a.name.localeCompare(b.name))
    );
  });

  it('returns an empty list from an empty table', async () => {
    expect(await listCustomers(db)).toEqual([]);
  });
});

describe('getCustomer', () => {
  it('returns one customer, keeping the beneficial owners', async () => {
    await seedCustomers(db, dataPack);
    const haapala = dataPack.find((customer) => customer.id === 'cust-haapala');
    expect(haapala).toBeDefined();
    expect(await getCustomer(db, 'cust-haapala')).toEqual(haapala);
  });

  it('returns null for an unknown id', async () => {
    expect(await getCustomer(db, 'cust-nobody')).toBeNull();
  });
});

describe('toCustomer', () => {
  it('throws on a row that breaks the schema, so a bad hand edit is caught', async () => {
    const aino = dataPack.find((customer) => customer.id === 'cust-aino');
    if (!aino) throw new Error('cust-aino missing from the data pack');
    const row = await db.customer.create({ data: toCustomerRowData(aino) });
    expect(() => toCustomer({ ...row, employment: null })).toThrow();
    expect(() => toCustomer({ ...row, type: 'robot' })).toThrow();
  });
});
