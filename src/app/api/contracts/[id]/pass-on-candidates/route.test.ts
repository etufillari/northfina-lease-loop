import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/server/prisma-client';
import { ADMIN, AINO, TEST_SECRET, actAs } from '../../../../../../tests/helpers/act-as';
import { ainoEbikeAnswers } from '../../../../../../tests/helpers/applicants';
import { applyFor, resetLeaseData, signFor } from '../../../../../../tests/helpers/lease-flow';
import { createTestDb } from '../../../../../../tests/helpers/test-db';
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

async function candidates(id = contractId) {
  const request = new Request(`http://localhost/api/contracts/${id}/pass-on-candidates`);
  const response = await GET(request, { params: Promise.resolve({ id }) });
  return { status: response.status, body: await response.json() };
}

describe('GET /api/contracts/:id/pass-on-candidates', () => {
  it('lists people waiting for this kind of item, with only id and name', async () => {
    await actAs(AINO);
    const { status, body } = await candidates();
    expect(status).toBe(200);
    expect(body.data).toEqual([
      { id: 'cust-wait-01', name: 'Ella Salmi' },
      { id: 'cust-wait-02', name: 'Jonas Lind' },
    ]);
  });

  it("answers 404 for someone else's contract, and for an unknown one", async () => {
    await actAs({ sub: 'cust-lena', role: 'client' });
    expect((await candidates()).status).toBe(404);
    await actAs(AINO);
    expect((await candidates('con-nope')).status).toBe(404);
  });

  it('answers 409 once the contract has ended', async () => {
    await db.contract.update({ where: { id: contractId }, data: { status: 'returned' } });
    await actAs(AINO);
    const { status, body } = await candidates();
    expect(status).toBe(409);
    expect(body.error.code).toBe('CONTRACT_ALREADY_ENDED');
  });

  it('is for the customer: staff get 403, and nobody gets 401', async () => {
    await actAs(ADMIN);
    expect((await candidates()).status).toBe(403);
    await actAs(null);
    expect((await candidates()).status).toBe(401);
  });
});
