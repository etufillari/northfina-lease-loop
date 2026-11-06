import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/server/prisma-client';
import { ADMIN, AINO, DEALER, TEST_SECRET, actAs } from '../../../../../tests/helpers/act-as';
import { ainoEbikeAnswers } from '../../../../../tests/helpers/applicants';
import { applyFor, resetLeaseData, signFor } from '../../../../../tests/helpers/lease-flow';
import { createTestDb } from '../../../../../tests/helpers/test-db';
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
let contractId: string;

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
  const application = await applyFor(db, 'cust-aino', 'ebike-003', ainoEbikeAnswers);
  contractId = (await signFor(db, 'cust-aino', application.id)).id;
});

async function trigger() {
  const request = new Request('http://localhost/api/contracts/close-expired', { method: 'POST' });
  const response = await POST(request, undefined);
  return { status: response.status, body: await response.json() };
}

describe('POST /api/contracts/close-expired', () => {
  it('closes expired contracts on the app date and lists them', async () => {
    await db.appSetting.update({ where: { key: 'demo_date' }, data: { value: '2029-11-12' } });
    await actAs(ADMIN);

    const { status, body } = await trigger();
    expect(status).toBe(200);
    expect(body.data).toEqual({ closed: [contractId] });
    const contract = await db.contract.findUniqueOrThrow({ where: { id: contractId } });
    expect(contract.status).toBe('returned');
  });

  it('closes nothing when nothing has expired', async () => {
    await actAs(ADMIN);
    expect((await trigger()).body.data).toEqual({ closed: [] });
  });

  it('is for an admin only', async () => {
    await actAs(null);
    expect((await trigger()).status).toBe(401);
    await actAs(AINO);
    expect((await trigger()).status).toBe(403);
    await actAs(DEALER);
    expect((await trigger()).status).toBe(403);
  });
});
