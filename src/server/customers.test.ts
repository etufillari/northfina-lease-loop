import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadCustomers } from '@/data/load';
import type { Customer } from '@/data/schemas';
import { createTestDb } from '../../tests/helpers/test-db';
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
  await db.customer.deleteMany();
});

describe('seedCustomers', () => {
  it('inserts every customer from the data pack once', async () => {
    expect(await seedCustomers(db, dataPack)).toEqual({ created: 10, skipped: 0 });
    expect(await seedCustomers(db, dataPack)).toEqual({ created: 0, skipped: 10 });
    expect(await db.customer.count()).toBe(10);
  });

  it('does not overwrite an existing customer', async () => {
    await seedCustomers(db, dataPack);
    await db.customer.update({ where: { id: 'cust-aino' }, data: { name: 'Changed locally' } });
    await seedCustomers(db, dataPack);
    expect((await db.customer.findUniqueOrThrow({ where: { id: 'cust-aino' } })).name).toBe(
      'Changed locally'
    );
  });
});

describe('customer mapping', () => {
  it('round-trips consumer and company profiles', async () => {
    await seedCustomers(db, dataPack);
    const customers = await listCustomers(db);
    expect(customers).toEqual([...dataPack].sort((a, b) => a.id.localeCompare(b.id)));
  });

  it('retrieves a customer by id and answers null for an unknown id', async () => {
    await seedCustomers(db, dataPack);
    expect(await getCustomer(db, 'cust-aino')).toMatchObject({ id: 'cust-aino' });
    expect(await getCustomer(db, 'missing')).toBeNull();
  });

  it('validates rows when converting them to domain data', () => {
    const customer = dataPack[0];
    if (!customer) throw new Error('empty data pack');
    expect(() =>
      toCustomer({
        ...toCustomerRowData(customer),
        story: customer.story,
        created_at: new Date(),
        updated_at: new Date(),
      })
    ).not.toThrow();
  });
});
