import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAssets, loadQuestions } from '@/data/load';
import { seedAssets } from '@/server/assets/assets';
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

async function post(body: unknown, query = '') {
  const request = new Request(`http://localhost/api/applications/questions${query}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const response = await POST(request, undefined);
  return { status: response.status, body: await response.json() };
}

const deal = { asset_id: 'ebike-003', term_months: 36, answers: { q_customer_type: 'consumer' } };

describe('POST /api/applications/questions', () => {
  it('returns the questions for the logged-in customer', async () => {
    await actAs(AINO);
    const { status, body } = await post(deal);
    expect(status).toBe(200);
    expect(body.data.questions.map((q: { id: string }) => q.id)).toEqual([
      'q_customer_type',
      'q_full_name',
      'q_birth_date',
      'q_email',
      'q_country',
      'q_employment',
      'q_monthly_income',
      'q_usage_purpose',
    ]);
    expect(body.data.unanswered).toHaveLength(7);
    expect(body.data.blocked).toBeNull();
  });

  it('returns the texts in the requested language', async () => {
    const { questions } = await loadQuestions();
    const email = questions.find((q) => q.id === 'q_email');
    await actAs(AINO);

    for (const locale of ['en', 'fi', 'sv', 'et'] as const) {
      const { status, body } = await post(deal, `?locale=${locale}`);
      const question = body.data.questions.find((q: { id: string }) => q.id === 'q_email');
      expect(status).toBe(200);
      expect(question.text).toBe(email?.text[locale]);
    }
  });

  it('defaults to English', async () => {
    const { questions } = await loadQuestions();
    const email = questions.find((q) => q.id === 'q_email');
    await actAs(AINO);

    const { body } = await post(deal);
    const question = body.data.questions.find((q: { id: string }) => q.id === 'q_email');
    expect(question.text).toBe(email?.text.en);
  });

  it('explains why it asks in the language asked for', async () => {
    await actAs(AINO);

    const { body } = await post(deal, '?locale=fi');
    const question = body.data.questions.find((q: { id: string }) => q.id === 'q_email');
    expect(question.why_we_ask).toBe('Laskut ja sopimus lähetetään tähän osoitteeseen.');
  });

  it('answers 400 for a language the app does not speak, or an unknown parameter', async () => {
    await actAs(AINO);
    expect((await post(deal, '?locale=de')).status).toBe(400);
    expect((await post(deal, '?lang=fi')).status).toBe(400);
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
    const { body } = await post({ ...deal, answers: { q_customer_type: 'company' } });
    const byId = Object.fromEntries(body.data.questions.map((q: { id: string }) => [q.id, q]));
    expect(byId.q_business_id.hint).toBe('1234567-8 with a valid check digit');
    expect(byId.q_email).not.toHaveProperty('hint');
    expect(byId.q_business_id).not.toHaveProperty('validation');
  });

  it('gives the format hint in the language asked for', async () => {
    await actAs({ sub: 'cust-norvi', role: 'client' });
    const { body } = await post({ ...deal, answers: { q_customer_type: 'company' } }, '?locale=fi');
    const hinted = body.data.questions.find((q: { id: string }) => q.id === 'q_business_id');
    expect(hinted.hint).toBe('1234567-8 ja kelvollinen tarkistusnumero');
  });

  it('asks for income on a small deal when the record has none', async () => {
    const small = {
      asset_id: 'ebike-006',
      term_months: 36,
      answers: { q_customer_type: 'consumer' },
    };
    const idsFor = async () =>
      (await post(small)).body.data.questions.map((question: { id: string }) => question.id);

    await actAs({ sub: 'cust-pekka', role: 'client' });
    expect(await idsFor()).toContain('q_monthly_income');

    await actAs(AINO);
    expect(await idsFor()).not.toContain('q_monthly_income');
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
      answers: { q_customer_type: 'consumer', q_birth_date: '2009-03-10' },
    });
    expect(body.data.blocked).toEqual({ reason: 'min_age', eligible_from: '2027-03-10' });
  });

  it('follows the answered type, and suggests the one on record', async () => {
    await actAs(AINO);
    const { status, body } = await post({ ...deal, answers: { q_customer_type: 'company' } });
    expect(status).toBe(200);
    expect(body.data.questions.map((q: { id: string }) => q.id)).toContain('q_business_id');
    expect(body.data.suggested_customer_type).toBe('consumer');
  });

  it('asks who is leasing first, before anything that depends on it', async () => {
    await actAs(AINO);
    const { body } = await post({ asset_id: 'ebike-003', term_months: 36 });
    expect(body.data.questions.map((q: { id: string }) => q.id)).toEqual([
      'q_customer_type',
      'q_email',
      'q_usage_purpose',
    ]);
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
