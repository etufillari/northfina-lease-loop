// Runs the real handler against a real, migrated SQLite database, only swapping which one.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/server/prisma-client';
import { ADMIN, AINO, DEALER, TEST_SECRET, actAs } from '../../../../tests/helpers/act-as';
import { ainoEbikeAnswers } from '../../../../tests/helpers/applicants';
import { applyFor, resetLeaseData, signFor } from '../../../../tests/helpers/lease-flow';
import { createTestDb } from '../../../../tests/helpers/test-db';
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
let ainoContractId: string;

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
  ainoContractId = (await signFor(db, 'cust-aino', application.id)).id;
});

async function list(query = '') {
  const response = await GET(new Request(`http://localhost/api/invoices${query}`), undefined);
  return { status: response.status, body: await response.json() };
}

describe('GET /api/invoices', () => {
  it('tells the client why the January total changed (card 1)', async () => {
    await actAs(AINO);
    const { body } = await list(`?contract_id=${ainoContractId}`);

    expect(body.data[1].vat_change).toBeNull();
    expect(body.data[2].vat_change).toEqual({
      from_percent: 25.5,
      to_percent: 26,
      net_change_cents: 0,
      total_change_cents: 54,
    });
  });

  it('shows a customer the invoices on their own contract (card 1)', async () => {
    await actAs(AINO);
    const { status, body } = await list(`?contract_id=${ainoContractId}`);
    expect(status).toBe(200);
    expect(body.data).toHaveLength(36);
    expect(body.data.slice(0, 3)).toMatchObject([
      { sequence: 1, invoice_date: '2026-11-05', total_cents: 13_466, vat_rate_percent: 25.5 },
      { sequence: 2, invoice_date: '2026-12-05', total_cents: 13_466 },
      { sequence: 3, invoice_date: '2027-01-05', total_cents: 13_520, vat_rate_percent: 26 },
    ]);
  });

  it("gives a customer nothing for another customer's contract", async () => {
    await actAs({ sub: 'cust-lena', role: 'client' });
    const { status, body } = await list(`?contract_id=${ainoContractId}`);
    expect(status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it('lets a customer see only their own invoices when no contract is named', async () => {
    await actAs({ sub: 'cust-lena', role: 'client' });
    expect((await list()).body.data).toEqual([]);
    await actAs(AINO);
    expect((await list()).body.data).toHaveLength(36);
  });

  it.each([
    ['a dealer', DEALER],
    ['an admin', ADMIN],
  ])('shows %s every invoice', async (_name, user) => {
    await actAs(user);
    expect((await list()).body.data).toHaveLength(36);
  });

  it('filters by status', async () => {
    await actAs(AINO);
    expect((await list('?status=paid')).body.data).toEqual([]);
    expect((await list('?status=issued')).body.data).toHaveLength(36);
  });

  it('needs a login', async () => {
    await actAs(null);
    expect((await list()).status).toBe(401);
  });

  it.each([
    ['an unknown status', '?status=overdue'],
    ['an unknown parameter', '?customer_id=cust-aino'],
    ['an empty contract id', '?contract_id='],
  ])('answers 400 for %s', async (_name, query) => {
    await actAs(AINO);
    const { status, body } = await list(query);
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
