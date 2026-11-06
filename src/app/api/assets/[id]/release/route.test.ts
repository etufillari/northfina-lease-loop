import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/server/prisma-client';
import { ADMIN, AINO, DEALER, TEST_SECRET, actAs } from '../../../../../../tests/helpers/act-as';
import { resetLeaseData } from '../../../../../../tests/helpers/lease-flow';
import { createTestDb } from '../../../../../../tests/helpers/test-db';
import { POST } from './route';

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

async function release(id: string) {
  const request = new Request(`http://localhost/api/assets/${id}/release`, { method: 'POST' });
  const response = await POST(request, { params: Promise.resolve({ id }) });
  return { status: response.status, body: await response.json() };
}

describe('POST /api/assets/:id/release', () => {
  it.each([
    ['a dealer', DEALER, 'staff-dealer'],
    ['an admin', ADMIN, 'staff-admin'],
  ])('lets %s end a hold, and records it', async (_name, user, actor) => {
    await actAs(user);
    const { status, body } = await release('ebike-003');
    expect(status).toBe(200);
    expect(body.data).not.toHaveProperty('reserved_for');

    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'asset.released' } });
    expect(audit.actor).toBe(actor);
    expect(JSON.parse(audit.details_json ?? '')).toEqual({ held_for: 'cust-wait-02' });
  });

  it('answers 409 for an item with no hold, and leaves no audit row', async () => {
    await actAs(DEALER);
    await db.auditLog.deleteMany();
    const { status, body } = await release('ebike-001');
    expect(status).toBe(409);
    expect(body.error.code).toBe('ASSET_NOT_HELD');
    expect(await db.auditLog.count()).toBe(0);
  });

  it('answers 404 for an unknown item', async () => {
    await actAs(DEALER);
    expect((await release('nope')).status).toBe(404);
  });

  it('is closed to clients and the logged out', async () => {
    await actAs(AINO);
    expect((await release('ebike-003')).status).toBe(403);
    await actAs(null);
    expect((await release('ebike-003')).status).toBe(401);
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });
    expect(asset.reserved_for).toBe('cust-wait-02');
  });
});
