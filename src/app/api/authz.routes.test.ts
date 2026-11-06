// D73, D74: every write route asks `authorize` before the action. Each route is posted as
// anonymous (401 FORBIDDEN), as the wrong customer (403 FORBIDDEN) and as the admin (not
// refused), against a real, migrated SQLite database; a refusal writes nothing, counted on the
// audit rows before and after. Only `db` and `next/headers` cookies are replaced.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedPack } from '../../../tests/helpers/invoice-fixture';
import { quoteAndApply, signedContract } from '../../../tests/helpers/journey';
import { resetDb } from '../../../tests/helpers/reset-db';
import { createTestDb } from '../../../tests/helpers/test-db';
import { loadCustomers } from '@/data/load';
import { answersFromCustomer } from '@/domain/question-flow/answers';
import { ACTOR_COOKIE } from '@/server/actor';
import { DEMO_CLOCK_COOKIE } from '@/server/demo-clock';
import { listInvoices } from '@/server/invoices';
import type { PrismaClient } from '@/server/prisma-client';
import { listSignatories, seedSignatories } from '@/server/signatories';

const holder = vi.hoisted(() => ({
  db: undefined as unknown as PrismaClient,
  cookies: new Map<string, string>(),
}));
vi.mock('@/server/db', () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = holder.cookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

const applications = await import('./applications/route');
const decision = await import('./applications/[id]/decision/route');
const withdraw = await import('./applications/[id]/withdraw/route');
const contracts = await import('./contracts/route');
const exit = await import('./contracts/[id]/exit/route');
const pay = await import('./invoices/[id]/pay/route');
const signatories = await import('./customers/[id]/signatories/route');
const revoke = await import('./customers/[id]/signatories/[signatoryId]/revoke/route');
const assessments = await import('./assets/[id]/assessments/route');
const status = await import('./assets/[id]/status/route');

const TODAY = '2026-11-05';
const AINO_TRIP = { customerId: 'cust-aino', assetId: 'ebike-003', termMonths: 36, quoteOn: TODAY };

let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db: holder.db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});

type Records = {
  quoteId: string;
  applicationId: string;
  contractId: string;
  invoiceId: string;
  signatoryId: string;
};
let records: Records;

beforeEach(async () => {
  const db = holder.db;
  await resetDb(db);
  await seedPack(db);
  await seedSignatories(db, await loadCustomers(), TODAY);
  const signed = await signedContract(db, AINO_TRIP);
  const { quote } = await quoteAndApply(db, { ...AINO_TRIP, assetId: 'ebike-001' });
  const [invoice] = await listInvoices(db, signed.contract.id);
  const [signatory] = await listSignatories(db, 'cust-kettukoodi', TODAY);
  records = {
    quoteId: quote.id,
    applicationId: signed.application.id,
    contractId: signed.contract.id,
    invoiceId: invoice!.id,
    signatoryId: signatory!.id,
  };
  holder.cookies = new Map([[DEMO_CLOCK_COOKIE, TODAY]]);
});

const post = (body?: unknown) =>
  new Request('http://test/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = <P extends Record<string, string>>(params: P) => ({
  params: Promise.resolve(params),
});

type WriteRoute = {
  name: string;
  /** The customer whose record it is; null for an admin-only action. */
  owner: string | null;
  /** The admin's refusal where the admin may not act (signing is the customer's, D88). */
  adminRefusal?: string;
  call: () => Promise<Response>;
};

const ainoAnswers = async () =>
  answersFromCustomer((await loadCustomers()).find((c) => c.id === 'cust-aino')!);

const ROUTES: WriteRoute[] = [
  {
    name: 'POST /api/applications',
    owner: 'cust-aino',
    call: async () =>
      applications.POST(
        post({
          quoteId: records.quoteId,
          customerId: 'cust-aino',
          answers: await ainoAnswers(),
          ...(holder.cookies.get(ACTOR_COOKIE) === 'admin' ? { onBehalfOf: 'cust-aino' } : {}),
        }),
        undefined
      ),
  },
  {
    name: 'POST /api/applications/[id]/decision',
    owner: null,
    call: () =>
      decision.POST(
        post({ decision: 'approved', reviewedBy: 'admin' }),
        ctx({ id: records.applicationId })
      ),
  },
  {
    // D87: a signed application answers 409 to its owner and the admin, never 401/403.
    name: 'POST /api/applications/[id]/withdraw',
    owner: 'cust-aino',
    call: () => withdraw.POST(post(), ctx({ id: records.applicationId })),
  },
  {
    name: 'POST /api/contracts',
    owner: 'cust-aino',
    adminRefusal: 'customer_signs',
    call: () => contracts.POST(post({ applicationId: records.applicationId }), undefined),
  },
  {
    name: 'POST /api/contracts/[id]/exit',
    owner: 'cust-aino',
    call: () =>
      exit.POST(
        post({ mode: 'buy', condition: 'good', usage: { unit: 'km', value: 100 } }),
        ctx({ id: records.contractId })
      ),
  },
  {
    name: 'POST /api/invoices/[id]/pay',
    owner: 'cust-aino',
    call: () => pay.POST(post(), ctx({ id: records.invoiceId })),
  },
  {
    name: 'POST /api/customers/[id]/signatories',
    owner: 'cust-kettukoodi',
    call: () =>
      signatories.POST(
        post({ name: 'CFO', email: 'cfo@kettukoodi.example.com', validFrom: TODAY }),
        ctx({ id: 'cust-kettukoodi' })
      ),
  },
  {
    name: 'POST /api/customers/[id]/signatories/[signatoryId]/revoke',
    owner: 'cust-kettukoodi',
    call: () =>
      revoke.POST(post(), ctx({ id: 'cust-kettukoodi', signatoryId: records.signatoryId })),
  },
  {
    name: 'POST /api/assets/[id]/assessments',
    owner: null,
    call: () => assessments.POST(post(), ctx({ id: 'ebike-003' })),
  },
  {
    name: 'PATCH /api/assets/[id]/status',
    owner: null,
    call: () =>
      status.PATCH(
        new Request('http://test/api', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'reserved' }),
        }),
        ctx({ id: 'ebike-002' })
      ),
  },
];

const actAs = (actor: string | undefined) => {
  if (actor === undefined) holder.cookies.delete(ACTOR_COOKIE);
  else holder.cookies.set(ACTOR_COOKIE, actor);
};

async function refusedWithoutWrites(route: WriteRoute, actor: string | undefined) {
  const before = await holder.db.auditLog.count();
  actAs(actor);
  const response = await route.call();
  const body = await response.json();
  expect(await holder.db.auditLog.count(), 'a refusal writes nothing').toBe(before);
  return { status: response.status, body };
}

describe.each(ROUTES)('$name (D73, D74)', (route) => {
  it('anonymous is 401 FORBIDDEN not_signed_in and writes nothing', async () => {
    const { status: code, body } = await refusedWithoutWrites(route, undefined);
    expect(code).toBe(401);
    expect(body.error).toMatchObject({ code: 'FORBIDDEN', details: { code: 'not_signed_in' } });
  });

  it('the wrong customer is 403 FORBIDDEN and writes nothing', async () => {
    const { status: code, body } = await refusedWithoutWrites(route, 'cust-mikko');
    expect(code).toBe(403);
    expect(body.error).toMatchObject({
      code: 'FORBIDDEN',
      details: { code: route.owner === null ? 'admin_only' : 'not_owner' },
    });
  });

  if (route.adminRefusal) {
    it(`the admin is 403 FORBIDDEN ${route.adminRefusal} and writes nothing`, async () => {
      const { status: code, body } = await refusedWithoutWrites(route, 'admin');
      expect(code).toBe(403);
      expect(body.error).toMatchObject({
        code: 'FORBIDDEN',
        details: { code: route.adminRefusal },
      });
    });
  } else {
    it('the admin is not refused', async () => {
      actAs('admin');
      const response = await route.call();
      expect([401, 403]).not.toContain(response.status);
    });
  }

  if (route.owner !== null) {
    it('the owner is not refused', async () => {
      actAs(route.owner!);
      const response = await route.call();
      expect([401, 403]).not.toContain(response.status);
    });
  }
});
