// Runs the real handlers against a real, migrated SQLite database, only swapping which one.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/server/prisma-client';
import { ADMIN, AINO, DEALER, TEST_SECRET, actAs } from '../../../../tests/helpers/act-as';
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

async function sign(body: unknown) {
  const request = new Request('http://localhost/api/contracts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const response = await POST(request, undefined);
  return { status: response.status, body: await response.json() };
}

async function list() {
  const response = await GET(new Request('http://localhost/api/contracts'), undefined);
  return { status: response.status, body: await response.json() };
}

const ainoApplication = () => applyFor(db, 'cust-aino', 'ebike-003', ainoEbikeAnswers);

describe('POST /api/contracts', () => {
  it('signs card 1 and answers 201 with the locked contract', async () => {
    const application = await ainoApplication();
    await actAs(AINO);

    const { status, body } = await sign({ application_id: application.id });
    expect(status).toBe(201);
    expect(body.data).toMatchObject({
      application_id: application.id,
      customer_id: 'cust-aino',
      status: 'active',
      signed_on: '2026-11-05',
      planned_end_on: '2029-11-04',
      monthly_net_rent_cents: 10_730,
      buyout_cents: 58_350,
      list_price_on_signing_cents: 389_000,
    });
  });

  it('keeps the quoted price of card 2 when signing a day later', async () => {
    const application = await applyFor(db, 'cust-aino', 'laptop-004', ainoEbikeAnswers);
    await db.appSetting.update({ where: { key: 'demo_date' }, data: { value: '2026-11-06' } });
    await actAs(AINO);

    const { body } = await sign({ application_id: application.id });
    expect(body.data).toMatchObject({
      quote_date: '2026-11-05',
      signed_on: '2026-11-06',
      base_price_cents: 349_000,
      list_price_on_signing_cents: 321_100,
    });
  });

  it('takes no price, date or customer from the request', async () => {
    const application = await ainoApplication();
    await actAs(AINO);
    for (const extra of [
      { signed_on: '2026-01-01' },
      { monthly_net_rent_cents: 1 },
      { customer_id: 'cust-lena' },
    ]) {
      const { status, body } = await sign({ application_id: application.id, ...extra });
      expect(status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await db.contract.count()).toBe(0);
  });

  it("answers 404 for someone else's application, as for one that does not exist", async () => {
    const application = await ainoApplication();
    await actAs({ sub: 'cust-lena', role: 'client' });

    const theirs = await sign({ application_id: application.id });
    expect(theirs.status).toBe(404);
    expect(theirs.body.error.code).toBe('APPLICATION_NOT_FOUND');

    expect((await sign({ application_id: 'app-nope' })).status).toBe(404);
  });

  it('answers 409 for an application that is not approved (card 7)', async () => {
    const application = await applyFor(db, 'cust-haapala', 'farm-002', haapalaFarmAnswers, {
      termMonths: 48,
      downPaymentCents: 2_000_000,
    });
    await actAs({ sub: 'cust-haapala', role: 'client' });

    const { status, body } = await sign({ application_id: application.id });
    expect(status).toBe(409);
    expect(body.error.code).toBe('APPLICATION_NOT_APPROVED');
  });

  it('answers 409 for a second signing', async () => {
    const application = await ainoApplication();
    await actAs(AINO);
    await sign({ application_id: application.id });

    const { status, body } = await sign({ application_id: application.id });
    expect(status).toBe(409);
    expect(body.error.code).toBe('ALREADY_SIGNED');
  });

  it('answers 409 when the asset has gone', async () => {
    const first = await ainoApplication();
    const second = await ainoApplication();
    await actAs(AINO);
    await sign({ application_id: first.id });

    const { status, body } = await sign({ application_id: second.id });
    expect(status).toBe(409);
    expect(body.error.code).toBe('ASSET_NOT_AVAILABLE');
  });

  it('answers 403 and names who must sign for Norvi (card 6)', async () => {
    const application = await applyFor(db, 'cust-norvi', 'ebike-004', norviEbikeAnswers, {
      quantity: 4,
    });
    await actAs({ sub: 'cust-norvi', role: 'client' });

    const { status, body } = await sign({ application_id: application.id });
    expect(status).toBe(403);
    expect(body.error).toMatchObject({
      code: 'SIGNATORY_REQUIRED',
      details: { signatory_email: 'ceo@norvi.example.com' },
    });
  });

  it('needs a logged-in client', async () => {
    const application = await ainoApplication();
    await actAs(null);
    expect((await sign({ application_id: application.id })).status).toBe(401);
    await actAs(DEALER);
    expect((await sign({ application_id: application.id })).status).toBe(403);
    await actAs(ADMIN);
    expect((await sign({ application_id: application.id })).status).toBe(403);
    expect(await db.contract.count()).toBe(0);
  });

  it.each([
    ['a missing application id', {}],
    ['a blank application id', { application_id: '  ' }],
  ])('answers 400 for %s', async (_name, body) => {
    await actAs(AINO);
    expect((await sign(body)).status).toBe(400);
  });
});

describe('GET /api/contracts', () => {
  async function signForAinoAndLena() {
    const aino = await ainoApplication();
    const lena = await applyFor(db, 'cust-lena', 'ebike-001', {
      ...ainoEbikeAnswers,
      q_country: 'EE',
    });
    await signFor(db, 'cust-aino', aino.id);
    await signFor(db, 'cust-lena', lena.id);
  }

  it('shows a client only their own contracts', async () => {
    await signForAinoAndLena();
    await actAs(AINO);
    const { status, body } = await list();
    expect(status).toBe(200);
    expect(body.data.map((c: { customer_id: string }) => c.customer_id)).toEqual(['cust-aino']);
  });

  it.each([
    ['a dealer', DEALER],
    ['an admin', ADMIN],
  ])('shows %s every contract', async (_name, user) => {
    await signForAinoAndLena();
    await actAs(user);
    expect((await list()).body.data).toHaveLength(2);
  });

  it('gives a client with no contracts an empty list', async () => {
    await actAs(AINO);
    expect((await list()).body.data).toEqual([]);
  });

  it('needs a login', async () => {
    await actAs(null);
    expect((await list()).status).toBe(401);
  });
});
