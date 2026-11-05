import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import { submitApplication } from '@/server/applications';
import { seedAssets } from '@/server/assets';
import type { PrismaClient } from '@/server/prisma-client';
import { ADMIN, AINO, DEALER, TEST_SECRET, actAs } from '../../../../../../tests/helpers/act-as';
import { ainoEbikeAnswers, haapalaFarmAnswers } from '../../../../../../tests/helpers/applicants';
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
let waitingId: string;
let approvedId: string;

beforeAll(async () => {
  vi.stubEnv('JWT_SECRET', TEST_SECRET);
  ({ db, cleanup } = await createTestDb());
  testDb.current = db;
  await seedAssets(db, await loadAssets());
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await cleanup();
});
beforeEach(async () => {
  await db.auditLog.deleteMany();
  await db.application.deleteMany();
  await db.appSetting.deleteMany();
  await db.appSetting.create({ data: { key: 'demo_date', value: '2026-11-05' } });

  const customers = await loadCustomers();
  const find = (id: string) => {
    const found = customers.find((c) => c.id === id);
    if (!found) throw new Error(id);
    return found;
  };
  const waiting = await submitApplication(db, {
    customer: find('cust-haapala'),
    assetId: 'farm-002',
    quantity: 1,
    termMonths: 48,
    downPaymentCents: 2_000_000,
    answers: haapalaFarmAnswers,
  });
  const approved = await submitApplication(db, {
    customer: find('cust-aino'),
    assetId: 'ebike-003',
    quantity: 1,
    termMonths: 36,
    downPaymentCents: 0,
    answers: ainoEbikeAnswers,
  });
  if (!waiting.ok || !approved.ok) throw new Error('setup failed');
  waitingId = waiting.application.id;
  approvedId = approved.application.id;
});

async function decide(id: string, body: unknown) {
  const request = new Request(`http://localhost/api/applications/${id}/decision`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const response = await POST(request, { params: Promise.resolve({ id }) });
  return { status: response.status, body: await response.json() };
}

describe('POST /api/applications/:id/decision', () => {
  it('lets an admin approve an application waiting for a person', async () => {
    await actAs(ADMIN);
    const { status, body } = await decide(waitingId, { decision: 'approved' });
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      decision: 'approved',
      reviewed_by: 'staff-admin',
      reviewed_on: '2026-11-05',
    });
  });

  it('lets an admin reject it, and keeps the reason it was reviewed', async () => {
    await actAs(ADMIN);
    const { body } = await decide(waitingId, { decision: 'rejected' });
    expect(body.data).toMatchObject({ decision: 'rejected', reasons: ['pep_manual_review'] });
  });

  it('records who decided in the audit log', async () => {
    await actAs(ADMIN);
    await db.auditLog.deleteMany();
    await decide(waitingId, { decision: 'approved' });
    expect(await db.auditLog.findFirstOrThrow()).toMatchObject({
      actor: 'staff-admin',
      action: 'application.reviewed',
      entity_id: waitingId,
    });
  });

  it('answers 409 for an application that is not waiting, and for a second decision', async () => {
    await actAs(ADMIN);
    const notWaiting = await decide(approvedId, { decision: 'rejected' });
    expect(notWaiting.status).toBe(409);
    expect(notWaiting.body.error.code).toBe('APPLICATION_NOT_IN_REVIEW');

    await decide(waitingId, { decision: 'approved' });
    expect((await decide(waitingId, { decision: 'rejected' })).status).toBe(409);
  });

  it('answers 404 for an unknown application', async () => {
    await actAs(ADMIN);
    const { status, body } = await decide('app-nope', { decision: 'approved' });
    expect(status).toBe(404);
    expect(body.error.code).toBe('APPLICATION_NOT_FOUND');
  });

  it('is closed to clients, dealers and the logged out, and changes nothing', async () => {
    await actAs(null);
    expect((await decide(waitingId, { decision: 'approved' })).status).toBe(401);
    await actAs(AINO);
    expect((await decide(waitingId, { decision: 'approved' })).status).toBe(403);
    await actAs(DEALER);
    expect((await decide(waitingId, { decision: 'approved' })).status).toBe(403);
    const row = await db.application.findUniqueOrThrow({ where: { id: waitingId } });
    expect(row.decision).toBe('manual_review');
  });

  it.each([
    ['an unknown decision', { decision: 'maybe' }],
    ['manual_review as a decision', { decision: 'manual_review' }],
    ['a missing decision', {}],
    ['an extra field', { decision: 'approved', reviewed_by: 'me' }],
  ])('answers 400 for %s', async (_name, body) => {
    await actAs(ADMIN);
    const result = await decide(waitingId, body);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('VALIDATION_ERROR');
  });
});
