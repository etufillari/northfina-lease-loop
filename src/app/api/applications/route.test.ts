// Runs the real handlers against a real, migrated SQLite database, only swapping which one.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/server/prisma-client';
import {
  ADMIN,
  AINO,
  DEALER,
  NORVI_CEO,
  TEST_SECRET,
  actAs,
} from '../../../../tests/helpers/act-as';
import {
  ainoEbikeAnswers,
  haapalaFarmAnswers,
  norviEbikeAnswers,
} from '../../../../tests/helpers/applicants';
import { applyFor, resetLeaseData, signFor } from '../../../../tests/helpers/lease-flow';
import { createTestDb } from '../../../../tests/helpers/test-db';
import { GET, POST } from './route';

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

const card1 = {
  asset_id: 'ebike-003',
  term_months: 36,
  down_payment_cents: 0,
  answers: ainoEbikeAnswers,
};

async function post(body: unknown) {
  const request = new Request('http://localhost/api/applications', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const response = await POST(request, undefined);
  return { status: response.status, body: await response.json() };
}

async function list(query = '') {
  const response = await GET(new Request(`http://localhost/api/applications${query}`), undefined);
  return { status: response.status, body: await response.json() };
}

describe('POST /api/applications', () => {
  it('approves card 1 and answers 201 with the decision', async () => {
    await actAs(AINO);
    const { status, body } = await post(card1);
    expect(status).toBe(201);
    expect(body.data).toMatchObject({
      customer_id: 'cust-aino',
      quote_date: '2026-11-05',
      base_price_cents: 389_000,
      decision: 'approved',
      reasons: [],
    });
    expect(await db.application.count()).toBe(1);
  });

  it('sends the PEP company to manual review (card 7)', async () => {
    await actAs({ sub: 'cust-haapala', role: 'client' });
    const { status, body } = await post({
      asset_id: 'farm-002',
      term_months: 48,
      down_payment_cents: 2_000_000,
      answers: haapalaFarmAnswers,
    });
    expect(status).toBe(201);
    expect(body.data).toMatchObject({ decision: 'manual_review', reasons: ['pep_manual_review'] });
  });

  it('says when a rejected applicant can try again (card 5)', async () => {
    await actAs({ sub: 'cust-mikko', role: 'client' });
    const { status, body } = await post({
      asset_id: 'laptop-008',
      term_months: 36,
      answers: { q_customer_type: 'consumer', q_birth_date: '2009-03-10' },
    });
    expect(status).toBe(201);
    expect(body.data).toMatchObject({
      decision: 'rejected',
      reasons: ['min_age'],
      eligible_from: '2027-03-10',
    });
  });

  it('takes no date, price or customer from the request', async () => {
    await actAs(AINO);
    for (const extra of [
      { quote_date: '2026-01-01' },
      { base_price_cents: 1 },
      { customer_id: 'cust-mikko' },
    ]) {
      const { status, body } = await post({ ...card1, ...extra });
      expect(status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await db.application.count()).toBe(0);
  });

  it('answers 401 without a login, and 403 for staff', async () => {
    await actAs(null);
    expect((await post(card1)).status).toBe(401);
    await actAs(DEALER);
    expect((await post(card1)).status).toBe(403);
    await actAs(ADMIN);
    expect((await post(card1)).status).toBe(403);
    await actAs(NORVI_CEO);
    expect((await post(card1)).status).toBe(403);
    expect(await db.application.count()).toBe(0);
  });

  it.each([
    ['an unknown asset', { asset_id: 'nope' }, 404, 'ASSET_NOT_FOUND'],
    ['a reserved asset', { asset_id: 'ebike-009' }, 409, 'ASSET_NOT_AVAILABLE'],
    ['a term that is not offered', { term_months: 18 }, 422, 'QUOTE_NOT_AVAILABLE'],
    ['incomplete answers', { answers: { q_full_name: 'Aino' } }, 422, 'ANSWERS_MISSING'],
    [
      'an invalid answer',
      { answers: { ...ainoEbikeAnswers, q_email: 'x' } },
      422,
      'ANSWERS_INVALID',
    ],
    ['a fractional down payment', { down_payment_cents: 0.5 }, 400, 'VALIDATION_ERROR'],
    ['a missing term', { term_months: undefined }, 400, 'VALIDATION_ERROR'],
    ['quantity, which is no longer accepted', { quantity: 2 }, 400, 'VALIDATION_ERROR'],
    [
      'an answer that is too long',
      { answers: { ...ainoEbikeAnswers, q_full_name: 'a'.repeat(1001) } },
      400,
      'VALIDATION_ERROR',
    ],
  ])('answers %s with %i %s', async (_name, change, status, code) => {
    await actAs(AINO);
    const result = await post({ ...card1, ...change });
    expect(result.status).toBe(status);
    expect(result.body.error.code).toBe(code);
    expect(await db.application.count()).toBe(0);
  });

  it('lists the missing questions and the invalid answers in the error details', async () => {
    await actAs(AINO);
    const missing = await post({
      ...card1,
      answers: { q_customer_type: 'consumer', q_full_name: 'Aino' },
    });
    expect(missing.body.error.details.question_ids).toContain('q_monthly_income');

    const invalid = await post({ ...card1, answers: { ...ainoEbikeAnswers, q_email: 'x' } });
    expect(invalid.body.error.details.errors).toEqual([
      { question_id: 'q_email', reason: 'not_an_email' },
    ]);
  });

  it('answers 400 for a body that is not JSON', async () => {
    await actAs(AINO);
    const response = await POST(
      new Request('http://localhost/api/applications', { method: 'POST', body: 'nope' }),
      undefined
    );
    expect(response.status).toBe(400);
  });
});

describe('GET /api/applications', () => {
  async function applyAsAinoAndHaapala() {
    await actAs(AINO);
    await post(card1);
    await actAs({ sub: 'cust-haapala', role: 'client' });
    await post({
      asset_id: 'farm-002',
      term_months: 48,
      down_payment_cents: 2_000_000,
      answers: haapalaFarmAnswers,
    });
  }

  it('shows an admin the queue of applications waiting for a person', async () => {
    await applyAsAinoAndHaapala();
    await actAs(ADMIN);

    const all = await list();
    expect(all.status).toBe(200);
    expect(all.body.data).toHaveLength(2);

    const waiting = await list('?decision=manual_review');
    expect(waiting.body.data.map((a: { customer_id: string }) => a.customer_id)).toEqual([
      'cust-haapala',
    ]);
  });

  it('shows a client only their own applications', async () => {
    await applyAsAinoAndHaapala();
    await actAs(AINO);

    const { status, body } = await list();
    expect(status).toBe(200);
    expect(body.data.map((a: { customer_id: string }) => a.customer_id)).toEqual(['cust-aino']);
  });

  it('keeps a client to their own even when filtering by decision', async () => {
    await applyAsAinoAndHaapala();
    await actAs(AINO);
    expect((await list('?decision=manual_review')).body.data).toEqual([]);
    expect((await list('?decision=approved')).body.data).toHaveLength(1);
  });

  it('lets a customer find their application after an admin has decided it', async () => {
    await applyAsAinoAndHaapala();
    await db.application.updateMany({
      where: { customer_id: 'cust-haapala' },
      data: { decision: 'approved', reviewed_by: 'staff-admin', reviewed_on: '2026-11-05' },
    });
    await actAs({ sub: 'cust-haapala', role: 'client' });

    const { body } = await list('?decision=approved');
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      customer_id: 'cust-haapala',
      reviewed_by: 'staff-admin',
    });
  });

  it('shows a signatory only what is waiting for their signature', async () => {
    await applyAsAinoAndHaapala();
    const waiting = await applyFor(db, 'cust-norvi', 'ebike-004', norviEbikeAnswers);
    const signedOne = await applyFor(db, 'cust-norvi', 'ebike-012', norviEbikeAnswers);
    await actAs(NORVI_CEO);
    await signFor(db, 'cust-norvi', signedOne.id, 'sign-norvi-ceo');

    const { status, body } = await list();
    expect(status).toBe(200);
    expect(body.data.map((a: { id: string }) => a.id)).toEqual([waiting.id]);
  });

  it('gives a client with no applications an empty list', async () => {
    await actAs(AINO);
    expect((await list()).body.data).toEqual([]);
  });

  it('is closed to dealers and the logged out', async () => {
    await actAs(null);
    expect((await list()).status).toBe(401);
    await actAs(DEALER);
    expect((await list()).status).toBe(403);
  });

  it('rejects an unknown decision filter', async () => {
    await actAs(ADMIN);
    expect((await list('?decision=maybe')).status).toBe(400);
  });
});
