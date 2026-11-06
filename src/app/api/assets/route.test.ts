import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/server/prisma-client';
import { AINO, TEST_SECRET, actAs } from '../../../../tests/helpers/act-as';
import { resetLeaseData } from '../../../../tests/helpers/lease-flow';
import { createTestDb } from '../../../../tests/helpers/test-db';
import { GET } from './route';

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
  await db.asset.update({
    where: { id: 'ebike-003' },
    data: { reserved_for: 'cust-wait-02' },
  });
});

async function heldAsset() {
  const response = await GET(new Request('http://localhost/api/assets'), undefined);
  const body = await response.json();
  return body.data.find((asset: { id: string }) => asset.id === 'ebike-003');
}

describe('GET /api/assets', () => {
  it('shows a held item as reserved to the logged out and to other customers', async () => {
    await actAs(null);
    expect((await heldAsset()).status).toBe('reserved');
    await actAs(AINO);
    expect((await heldAsset()).status).toBe('reserved');
  });

  it('marks it as theirs for the person it is held for', async () => {
    await actAs({ sub: 'cust-wait-02', role: 'client' });
    expect(await heldAsset()).toMatchObject({ status: 'available', held_for_you: true });
  });

  it('never reveals who it is held for', async () => {
    await actAs(AINO);
    expect(await heldAsset()).not.toHaveProperty('reserved_for');
  });
});
