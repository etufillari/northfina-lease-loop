// Runs the real handler against a real, migrated SQLite database, only swapping which one.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/server/prisma-client';
import { AINO, TEST_SECRET, actAs } from '../../../../../tests/helpers/act-as';
import { resetLeaseData } from '../../../../../tests/helpers/lease-flow';
import { createTestDb } from '../../../../../tests/helpers/test-db';
import { GET } from './route';
import { GET as LIST } from '../route';

const testDb = vi.hoisted(() => ({ current: undefined as PrismaClient | undefined }));
vi.mock('@/server/db', () => ({
  get db() {
    return testDb.current;
  },
}));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  vi.stubEnv('JWT_SECRET', TEST_SECRET);
  ({ db, cleanup } = await createTestDb());
  testDb.current = db;
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await cleanup();
});
beforeEach(async () => {
  await resetLeaseData(db);
  await actAs(null);
});

async function getOne(id: string) {
  const response = await GET(new Request(`http://localhost/api/assets/${id}`), {
    params: Promise.resolve({ id }),
  });
  return { status: response.status, body: await response.json() };
}

const hold = () =>
  db.asset.update({ where: { id: 'ebike-003' }, data: { reserved_for: 'cust-wait-02' } });

describe('GET /api/assets/:id', () => {
  it('gives one item, with no login needed', async () => {
    const { status, body } = await getOne('ebike-003');

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ id: 'ebike-003', category: 'e_bike' });
  });

  it('answers 404 for an item that does not exist', async () => {
    const { status, body } = await getOne('nope');

    expect(status).toBe(404);
    expect(body.error.code).toBe('ASSET_NOT_FOUND');
  });

  it('shows a held item as reserved to everyone else', async () => {
    await hold();

    expect((await getOne('ebike-003')).body.data.status).toBe('reserved');
    await actAs(AINO);
    expect((await getOne('ebike-003')).body.data.status).toBe('reserved');
  });

  it('marks it as theirs for the person it is held for', async () => {
    await hold();
    await actAs({ sub: 'cust-wait-02', role: 'client' });

    expect((await getOne('ebike-003')).body.data).toMatchObject({
      status: 'available',
      held_for_you: true,
    });
  });

  it('never reveals who it is held for', async () => {
    await hold();
    expect((await getOne('ebike-003')).body.data).not.toHaveProperty('reserved_for');
  });

  it('gives the same item as the list', async () => {
    await hold();
    await actAs(AINO);

    const list = await (await LIST(new Request('http://localhost/api/assets'), undefined)).json();
    const listed = list.data.find((asset: { id: string }) => asset.id === 'ebike-003');

    expect((await getOne('ebike-003')).body.data).toEqual(listed);
  });
});
