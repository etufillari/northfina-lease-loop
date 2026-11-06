import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/server/prisma-client';
import { listInvoices } from '@/server/invoicing/invoices';
import { ADMIN, AINO, DEALER, TEST_SECRET, actAs } from '../../../../../tests/helpers/act-as';
import { ainoEbikeAnswers } from '../../../../../tests/helpers/applicants';
import { applyFor, resetLeaseData, signFor } from '../../../../../tests/helpers/lease-flow';
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
let firstInvoiceId: string;

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
  const contract = await signFor(db, 'cust-aino', application.id);
  const [first] = await listInvoices(db, { contractId: contract.id });
  if (!first) throw new Error('expected an invoice');
  firstInvoiceId = first.id;
});

async function get(id: string) {
  const response = await GET(new Request(`http://localhost/api/invoices/${id}`), {
    params: Promise.resolve({ id }),
  });
  return { status: response.status, body: await response.json() };
}

describe('GET /api/invoices/:id', () => {
  it('shows a customer an invoice on their own contract', async () => {
    await actAs(AINO);
    const { status, body } = await get(firstInvoiceId);
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      id: firstInvoiceId,
      sequence: 1,
      net_cents: 10_730,
      vat_cents: 2_736,
      total_cents: 13_466,
      vat_rate_percent: 25.5,
    });
  });

  it.each([
    ['a dealer', DEALER],
    ['an admin', ADMIN],
  ])('shows %s any invoice', async (_name, user) => {
    await actAs(user);
    expect((await get(firstInvoiceId)).status).toBe(200);
  });

  it("hides another customer's invoice as if it did not exist", async () => {
    await actAs({ sub: 'cust-lena', role: 'client' });
    const theirs = await get(firstInvoiceId);
    expect(theirs.status).toBe(404);
    expect(theirs.body.error.code).toBe('INVOICE_NOT_FOUND');
  });

  it('answers 404 for an unknown invoice, and 401 without a login', async () => {
    await actAs(ADMIN);
    expect((await get('inv-nope')).status).toBe(404);
    await actAs(null);
    expect((await get(firstInvoiceId)).status).toBe(401);
  });
});
