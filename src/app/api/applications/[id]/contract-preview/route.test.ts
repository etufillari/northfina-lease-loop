import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/server/prisma-client';
import { ADMIN, AINO, DEALER, TEST_SECRET, actAs } from '../../../../../../tests/helpers/act-as';
import { ainoEbikeAnswers, haapalaFarmAnswers } from '../../../../../../tests/helpers/applicants';
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
});

async function preview(id: string) {
  const request = new Request(`http://localhost/api/applications/${id}/contract-preview`);
  const response = await GET(request, { params: Promise.resolve({ id }) });
  return { status: response.status, body: await response.json() };
}

const ainoApplication = () => applyFor(db, 'cust-aino', 'ebike-003', ainoEbikeAnswers);

describe('GET /api/applications/:id/contract-preview', () => {
  it('shows the customer the terms before signing', async () => {
    const application = await ainoApplication();
    await actAs(AINO);

    const { status, body } = await preview(application.id);
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      calculated_on: '2026-11-05',
      start_on: '2026-11-05',
      planned_end_on: '2029-11-04',
      monthly_net_rent_cents: 10_730,
      buyout_cents: 58_350,
      can_sign: true,
    });
    expect(body.data.invoices).toHaveLength(36);
    expect(body.data).not.toHaveProperty('id');
    expect(body.data.invoices[0]).not.toHaveProperty('contract_id');
  });

  it('answers 404 for an application that is not theirs, and for an unknown one', async () => {
    const application = await ainoApplication();
    await actAs({ sub: 'cust-lena', role: 'client' });

    const theirs = await preview(application.id);
    expect(theirs.status).toBe(404);
    expect(theirs.body.error.code).toBe('APPLICATION_NOT_FOUND');
    expect((await preview('app-nope')).status).toBe(404);
  });

  it('answers 409 while an application waits for a person (card 7)', async () => {
    const application = await applyFor(db, 'cust-haapala', 'farm-002', haapalaFarmAnswers, {
      termMonths: 48,
      downPaymentCents: 2_000_000,
    });
    await actAs({ sub: 'cust-haapala', role: 'client' });

    const { status, body } = await preview(application.id);
    expect(status).toBe(409);
    expect(body.error.code).toBe('APPLICATION_NOT_APPROVED');
  });

  it('answers 409 after signing, and when the item has gone', async () => {
    const first = await ainoApplication();
    const second = await ainoApplication();
    await signFor(db, 'cust-aino', first.id);
    await actAs(AINO);

    const signed = await preview(first.id);
    expect(signed.status).toBe(409);
    expect(signed.body.error.code).toBe('ALREADY_SIGNED');

    const gone = await preview(second.id);
    expect(gone.status).toBe(409);
    expect(gone.body.error.code).toBe('ASSET_NOT_AVAILABLE');
  });

  it('is for the customer: staff get 403, and nobody gets 401', async () => {
    const application = await ainoApplication();
    await actAs(DEALER);
    expect((await preview(application.id)).status).toBe(403);
    await actAs(ADMIN);
    expect((await preview(application.id)).status).toBe(403);
    await actAs(null);
    expect((await preview(application.id)).status).toBe(401);
  });
});
