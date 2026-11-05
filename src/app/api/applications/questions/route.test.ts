import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAssets } from '@/data/load';
import { seedAssets } from '@/server/assets';
import type { PrismaClient } from '@/server/prisma-client';
import { ADMIN, AINO, TEST_SECRET, actAs } from '../../../../../tests/helpers/act-as';
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
  await db.appSetting.deleteMany();
  await db.appSetting.create({ data: { key: 'demo_date', value: '2026-11-05' } });
});

async function post(body: unknown) {
  const request = new Request('http://localhost/api/applications/questions', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const response = await POST(request, undefined);
  return { status: response.status, body: await response.json() };
}

const deal = { asset_id: 'ebike-003', term_months: 36 };

describe('POST /api/applications/questions', () => {
  it('returns the questions for the logged-in customer, with texts in every language', async () => {
    await actAs(AINO);
    const { status, body } = await post(deal);
    expect(status).toBe(200);
    expect(body.data.questions.map((q: { id: string }) => q.id)).toEqual([
      'q_full_name',
      'q_birth_date',
      'q_email',
      'q_country',
      'q_employment',
      'q_monthly_income',
      'q_usage_purpose',
    ]);
    expect(Object.keys(body.data.questions[0].text)).toEqual(['en', 'fi', 'sv', 'et']);
    expect(body.data.unanswered).toHaveLength(7);
    expect(body.data.blocked).toBeNull();
  });

  it('gives choice questions their options and leaves other questions without', async () => {
    await actAs(AINO);
    const { body } = await post(deal);
    const byId = Object.fromEntries(body.data.questions.map((q: { id: string }) => [q.id, q]));
    expect(byId.q_country.options).toEqual(['FI', 'SE', 'EE', 'other']);
    expect(byId.q_full_name).not.toHaveProperty('options');
  });

  it('gives the format hint to a question that has one, and only to that', async () => {
    await actAs({ sub: 'cust-norvi', role: 'client' });
    const { body } = await post(deal);
    const byId = Object.fromEntries(body.data.questions.map((q: { id: string }) => [q.id, q]));
    expect(byId.q_business_id.hint).toBe('1234567-8 with a valid check digit');
    expect(byId.q_email).not.toHaveProperty('hint');
    expect(byId.q_business_id).not.toHaveProperty('validation');
  });

  it('does not leak the internal rules of a question', async () => {
    await actAs(AINO);
    const { body } = await post(deal);
    expect(body.data.questions[0]).not.toHaveProperty('ask_when');
    expect(body.data.questions[0]).not.toHaveProperty('blocks_application_when');
  });

  it('removes answers that no longer apply and reports them', async () => {
    await actAs(AINO);
    const { body } = await post({
      ...deal,
      down_payment_cents: 250_000,
      answers: { q_monthly_income: 320_000 },
    });
    expect(body.data.dropped).toEqual(['q_monthly_income']);
  });

  it('says when an answer stops the application', async () => {
    await actAs({ sub: 'cust-mikko', role: 'client' });
    const { body } = await post({
      asset_id: 'laptop-008',
      term_months: 36,
      answers: { q_birth_date: '2009-03-10' },
    });
    expect(body.data.blocked).toEqual({ reason: 'min_age', eligible_from: '2027-03-10' });
  });

  it('works out the customer type itself, ignoring what the request claims', async () => {
    await actAs(AINO);
    const { status, body } = await post({ ...deal, answers: { q_customer_type: 'company' } });
    expect(status).toBe(200);
    expect(body.data.questions.map((q: { id: string }) => q.id)).toContain('q_employment');
  });

  it('needs a logged-in client', async () => {
    await actAs(null);
    expect((await post(deal)).status).toBe(401);
    await actAs(ADMIN);
    expect((await post(deal)).status).toBe(403);
  });

  it.each([
    ['an unknown asset', { asset_id: 'nope' }, 404, 'ASSET_NOT_FOUND'],
    ['a reserved asset', { asset_id: 'ebike-009' }, 409, 'ASSET_NOT_AVAILABLE'],
    ['a term that is not offered', { term_months: 18 }, 422, 'QUOTE_NOT_AVAILABLE'],
    ['an unknown field', { financed_amount_cents: 1 }, 400, 'VALIDATION_ERROR'],
  ])('answers %s with %i %s', async (_name, change, status, code) => {
    await actAs(AINO);
    const result = await post({ ...deal, ...change });
    expect(result.status).toBe(status);
    expect(result.body.error.code).toBe(code);
  });

  it('saves nothing', async () => {
    await actAs(AINO);
    await post(deal);
    expect(await db.application.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
  });
});
