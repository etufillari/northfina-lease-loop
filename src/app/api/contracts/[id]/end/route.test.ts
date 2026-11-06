import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/server/prisma-client';
import { ADMIN, AINO, DEALER, TEST_SECRET, actAs } from '../../../../../../tests/helpers/act-as';
import { ainoEbikeAnswers } from '../../../../../../tests/helpers/applicants';
import { applyFor, resetLeaseData, signFor } from '../../../../../../tests/helpers/lease-flow';
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
  await db.appSetting.update({ where: { key: 'demo_date' }, data: { value: '2029-11-05' } });
});

async function end(body: unknown, id = contractId) {
  const request = new Request(`http://localhost/api/contracts/${id}/end`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const response = await POST(request, { params: Promise.resolve({ id }) });
  return { status: response.status, body: await response.json() };
}

describe('POST /api/contracts/:id/end', () => {
  it.each([
    ['bought_out', 'sold'],
    ['returned', 'returned'],
    ['passed_on', 'returned'],
  ])('lets the customer choose %s', async (outcome, assetStatus) => {
    await actAs(AINO);
    const passedTo = outcome === 'passed_on' ? { passed_to: 'cust-wait-01' } : {};
    const { status, body } = await end({ outcome, ...passedTo });
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ status: outcome, actual_end_on: '2029-11-05' });
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });
    expect(asset.status).toBe(assetStatus);
  });

  it.each([
    ['too early', '2029-11-03', 'CONTRACT_NOT_DUE'],
    ['too late', '2029-11-12', 'CHOICE_WINDOW_CLOSED'],
  ])('answers 409 when it is %s', async (_name, value, code) => {
    await db.appSetting.update({ where: { key: 'demo_date' }, data: { value } });
    await actAs(AINO);
    const { status, body } = await end({ outcome: 'returned' });
    expect(status).toBe(409);
    expect(body.error.code).toBe(code);
  });

  it('records who an item is passed on to, and holds it for them', async () => {
    await actAs(AINO);
    const { body } = await end({ outcome: 'passed_on', passed_to: 'cust-wait-02' });
    expect(body.data.passed_to).toBe('cust-wait-02');
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });
    expect(asset.reserved_for).toBe('cust-wait-02');
  });

  it.each([
    ['nobody', { outcome: 'passed_on' }],
    ['someone not on the waiting list', { outcome: 'passed_on', passed_to: 'cust-lena' }],
    ['someone waiting for another category', { outcome: 'passed_on', passed_to: 'cust-wait-06' }],
    ['themselves', { outcome: 'passed_on', passed_to: 'cust-aino' }],
    ['someone, while returning it', { outcome: 'returned', passed_to: 'cust-wait-01' }],
  ])('answers 422 for naming %s', async (_name, body) => {
    await actAs(AINO);
    const result = await end(body);
    expect(result.status).toBe(422);
    expect(result.body.error.code).toBe('INVALID_PASS_ON_TARGET');
    const contract = await db.contract.findUniqueOrThrow({ where: { id: contractId } });
    expect(contract.status).toBe('active');
  });

  it('answers 409 for a second choice', async () => {
    await actAs(AINO);
    await end({ outcome: 'returned' });
    const { status, body } = await end({ outcome: 'bought_out' });
    expect(status).toBe(409);
    expect(body.error.code).toBe('CONTRACT_ALREADY_ENDED');
  });

  it("answers 404 for someone else's contract, and for an unknown one", async () => {
    await actAs({ sub: 'cust-lena', role: 'client' });
    const theirs = await end({ outcome: 'returned' });
    expect(theirs.status).toBe(404);
    expect(theirs.body.error.code).toBe('CONTRACT_NOT_FOUND');

    await actAs(AINO);
    expect((await end({ outcome: 'returned' }, 'con-nope')).status).toBe(404);
  });

  it('is for the customer only: staff get 403, and nobody gets 401', async () => {
    await actAs(DEALER);
    expect((await end({ outcome: 'returned' })).status).toBe(403);
    await actAs(ADMIN);
    expect((await end({ outcome: 'returned' })).status).toBe(403);
    await actAs(null);
    expect((await end({ outcome: 'returned' })).status).toBe(401);
  });

  it.each([
    ['an unknown outcome', { outcome: 'kept' }],
    ['exited_early, which is not an end-of-term choice', { outcome: 'exited_early' }],
    ['a missing outcome', {}],
    ['an extra field', { outcome: 'returned', end_condition: 'good' }],
  ])('answers 400 for %s', async (_name, body) => {
    await actAs(AINO);
    const result = await end(body);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('VALIDATION_ERROR');
  });
});
