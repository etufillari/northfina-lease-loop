import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/server/prisma-client';
import { ADMIN, AINO, DEALER, TEST_SECRET, actAs } from '../../../../../tests/helpers/act-as';
import { ainoEbikeAnswers } from '../../../../../tests/helpers/applicants';
import { applyFor, resetLeaseData, signFor } from '../../../../../tests/helpers/lease-flow';
import { createTestDb } from '../../../../../tests/helpers/test-db';
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

async function get(id: string) {
  const response = await GET(new Request(`http://localhost/api/contracts/${id}`), {
    params: Promise.resolve({ id }),
  });
  return { status: response.status, body: await response.json() };
}

describe('GET /api/contracts/:id', () => {
  it('shows a customer their own contract', async () => {
    await actAs(AINO);
    const { status, body } = await get(contractId);
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      id: contractId,
      monthly_net_rent_cents: 10_730,
      list_price_on_signing_cents: 389_000,
    });
  });

  it.each([
    ['a dealer', DEALER],
    ['an admin', ADMIN],
  ])('shows %s any contract', async (_name, user) => {
    await actAs(user);
    expect((await get(contractId)).status).toBe(200);
  });

  it("hides someone else's contract as if it did not exist", async () => {
    await actAs({ sub: 'cust-lena', role: 'client' });
    const theirs = await get(contractId);
    expect(theirs.status).toBe(404);
    expect(theirs.body.error.code).toBe('CONTRACT_NOT_FOUND');
  });

  it('answers 404 for an unknown contract, and 401 without a login', async () => {
    await actAs(ADMIN);
    expect((await get('con-nope')).status).toBe(404);
    await actAs(null);
    expect((await get(contractId)).status).toBe(401);
  });
});
