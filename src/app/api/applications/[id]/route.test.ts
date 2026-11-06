import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import { submitApplication } from '@/server/application/applications';
import { seedAssets } from '@/server/assets/assets';
import type { PrismaClient } from '@/server/prisma-client';
import { ADMIN, AINO, DEALER, TEST_SECRET, actAs } from '../../../../../tests/helpers/act-as';
import { ainoEbikeAnswers } from '../../../../../tests/helpers/applicants';
import { signFor } from '../../../../../tests/helpers/lease-flow';
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
let ainoApplicationId: string;
let mikkoApplicationId: string;

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
  await db.assetLife.deleteMany();
  await db.invoice.deleteMany();
  await db.contract.deleteMany();
  await db.application.deleteMany();
  await db.asset.updateMany({ where: { id: 'ebike-003' }, data: { status: 'available' } });
  await db.appSetting.deleteMany();
  await db.appSetting.create({ data: { key: 'demo_date', value: '2026-11-05' } });

  const customers = await loadCustomers();
  const find = (id: string) => {
    const found = customers.find((c) => c.id === id);
    if (!found) throw new Error(id);
    return found;
  };
  const aino = await submitApplication(db, {
    customer: find('cust-aino'),
    assetId: 'ebike-003',
    quantity: 1,
    termMonths: 36,
    downPaymentCents: 0,
    answers: ainoEbikeAnswers,
  });
  const mikko = await submitApplication(db, {
    customer: find('cust-mikko'),
    assetId: 'laptop-008',
    quantity: 1,
    termMonths: 36,
    downPaymentCents: 0,
    answers: { q_birth_date: '2009-03-10' },
  });
  if (!aino.ok || !mikko.ok) throw new Error('setup failed');
  ainoApplicationId = aino.application.id;
  mikkoApplicationId = mikko.application.id;
});

async function get(id: string) {
  const response = await GET(new Request(`http://localhost/api/applications/${id}`), {
    params: Promise.resolve({ id }),
  });
  return { status: response.status, body: await response.json() };
}

describe('GET /api/applications/:id', () => {
  it('shows an applicant their own application', async () => {
    await actAs(AINO);
    const { status, body } = await get(ainoApplicationId);
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ id: ainoApplicationId, decision: 'approved' });
  });

  it('has no contract until it is signed, then links to it', async () => {
    await actAs(AINO);
    expect((await get(ainoApplicationId)).body.data.contract_id).toBeNull();

    const contract = await signFor(db, 'cust-aino', ainoApplicationId);
    expect((await get(ainoApplicationId)).body.data.contract_id).toBe(contract.id);
  });

  it('still says when to try again after a refresh', async () => {
    await actAs({ sub: 'cust-mikko', role: 'client' });
    const { body } = await get(mikkoApplicationId);
    expect(body.data).toMatchObject({
      decision: 'rejected',
      reasons: ['min_age'],
      eligible_from: '2027-03-10',
    });
  });

  it('shows an admin any application', async () => {
    await actAs(ADMIN);
    expect((await get(ainoApplicationId)).status).toBe(200);
    expect((await get(mikkoApplicationId)).status).toBe(200);
  });

  it("hides someone else's application as if it did not exist", async () => {
    await actAs(AINO);
    const other = await get(mikkoApplicationId);
    const missing = await get('app-nope');
    expect(other.status).toBe(404);
    expect(other.body.error).toEqual({
      code: 'APPLICATION_NOT_FOUND',
      message: `No application with id "${mikkoApplicationId}"`,
    });
    expect(missing.status).toBe(404);
  });

  it('keeps dealers out, and needs a login', async () => {
    await actAs(DEALER);
    expect((await get(ainoApplicationId)).status).toBe(404);
    await actAs(null);
    expect((await get(ainoApplicationId)).status).toBe(401);
  });
});
