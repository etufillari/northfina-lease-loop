// The three application routes against a real, migrated SQLite database: the app's `db`
// module is pointed at the test database and `next/headers` cookies at a map, nothing else
// is replaced. Every refusal is a `fail()` envelope with a code; never a 500, never a stack.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDb } from '../../../../tests/helpers/reset-db';
import { createTestDb } from '../../../../tests/helpers/test-db';
import { loadAssets, loadCustomers } from '@/data/load';
import type { Customer } from '@/data/schemas';
import { answersFromCustomer } from '@/domain/question-flow/answers';
import { ACTOR_COOKIE } from '@/server/actor';
import { seedAssets } from '@/server/assets';
import { seedCustomers } from '@/server/customers';
import { DEMO_CLOCK_COOKIE } from '@/server/demo-clock';
import type { PrismaClient } from '@/server/prisma-client';
import { applicationSchema } from '@/server/routes';

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

const { POST: create } = await import('./route');
const { GET: read } = await import('./[id]/route');
const { POST: decide } = await import('./[id]/decision/route');
const signRoute = await import('../sign/[token]/route');

let cleanup: () => Promise<void>;
let customers: Customer[];
const TODAY = '2026-11-05';

beforeAll(async () => {
  ({ db: holder.db, cleanup } = await createTestDb());
  customers = await loadCustomers();
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetDb(holder.db);
  await seedAssets(holder.db, await loadAssets());
  await seedCustomers(holder.db, customers);
  holder.cookies = new Map([[DEMO_CLOCK_COOKIE, TODAY]]);
});

const actAs = (actor: string | undefined) => {
  if (actor === undefined) holder.cookies.delete(ACTOR_COOKIE);
  else holder.cookies.set(ACTOR_COOKIE, actor);
};
const answersOf = (id: string) => answersFromCustomer(customers.find((c) => c.id === id)!);

/** Card 1's frozen quote row (ebike-003, 36 months) as the pricing slice writes it. */
async function insertQuote() {
  const row = await holder.db.quote.create({
    data: {
      asset_id: 'ebike-003',
      quantity: 1,
      quote_date: TODAY,
      valid_until: '2026-11-19',
      price_list_version: 1,
      list_price_cents: 389_000,
      down_payment_cents: 0,
      financed_cents: 389_000,
      band: 'B',
      factor_millionths: 27_584,
      term_months: 36,
      monthly_net_cents: 10_730,
      buyout_cents: 0,
      vat_rate_bp_at_quote: 2_550,
    },
  });
  return row.id;
}

type Envelope = {
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string; details?: unknown };
};

const json = (body: unknown) =>
  new Request('http://localhost/api/applications', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

async function post(body: unknown) {
  const response = await create(json(body), { params: Promise.resolve({}) });
  return { status: response.status, body: (await response.json()) as Envelope };
}

async function get(id: string) {
  const response = await read(new Request(`http://localhost/api/applications/${id}`), {
    params: Promise.resolve({ id }),
  });
  return { status: response.status, body: (await response.json()) as Envelope };
}

async function postDecision(id: string, body: unknown) {
  const response = await decide(json(body), { params: Promise.resolve({ id }) });
  return { status: response.status, body: (await response.json()) as Envelope };
}

/** A refusal is a `fail()` envelope: a stable code, a message, no stack, never a 500. */
function expectRefusal(result: { status: number; body: Envelope }, status: number, code: string) {
  expect(result.status).toBe(status);
  expect(result.body.success).toBe(false);
  expect(result.body.error?.code).toBe(code);
  expect(result.body.error?.code).toMatch(/^[A-Z][A-Z_]*$/);
  expect(JSON.stringify(result.body)).not.toMatch(/stack|node_modules|\.ts:\d+/);
}

async function applyAs(customerId: string, answers = answersOf(customerId)) {
  actAs(customerId);
  return post({ quoteId: await insertQuote(), customerId, answers });
}

describe('POST /api/applications', () => {
  it('card 1: Aino is approved with 201 and the response matches the contract', async () => {
    const { status, body } = await applyAs('cust-aino');
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    expect(applicationSchema.parse(body.data)).toMatchObject({ decision: 'approved' });
  });

  it.each([
    ['an unknown key', { extra: 1 }],
    ['a numeric quote id', { quoteId: 4 }],
    ['an array for the answers', { answers: [] }],
    ['a number as an answer', { answers: { q_full_name: 4 } }],
    ['a null answer', { answers: { q_full_name: null } }],
    ['an answer key without the q_ prefix', { answers: { birth_date: '1997-04-12' } }],
    ['an answer key with capitals', { answers: { q_Full_Name: 'x' } }],
    ['an answer of 100 000 characters', { answers: { q_full_name: 'x'.repeat(100_000) } }],
    ['a list of 21 owners', { answers: { q_beneficial_owners: Array(21).fill('owner') } }],
    ['an owner of 201 characters', { answers: { q_beneficial_owners: ['x'.repeat(201)] } }],
    ['an empty quote id', { quoteId: '' }],
    ['a quote id of 101 characters', { quoteId: 'q'.repeat(101) }],
    ['a customer id with spaces only', { customerId: '   ' }],
    ['an answer key of 65 characters', { answers: { [`q_${'a'.repeat(63)}`]: 'x' } }],
    [
      '65 answers',
      { answers: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`q_x${i}`, 'x'])) },
    ],
  ])('%s is refused with 400 VALIDATION_ERROR before anything is read', async (_name, patch) => {
    actAs('cust-aino');
    const body = {
      quoteId: 'any',
      customerId: 'cust-aino',
      answers: answersOf('cust-aino'),
      ...patch,
    };
    const result = await post(body);
    expectRefusal(result, 400, 'VALIDATION_ERROR');
    expect(Array.isArray(result.body.error?.details)).toBe(true);
    expect(await holder.db.application.count()).toBe(0);
  });

  it('a body that is not JSON, or not an object, is 400', async () => {
    actAs('cust-aino');
    expectRefusal(await post('{not json'), 400, 'INVALID_JSON');
    expectRefusal(await post('"a string"'), 400, 'VALIDATION_ERROR');
    expectRefusal(await post(null), 400, 'VALIDATION_ERROR');
  });

  it('spaces around the ids are not part of them: the trimmed customer id is the actor', async () => {
    actAs('cust-aino');
    const quoteId = await insertQuote();
    const { status } = await post({
      quoteId: ` ${quoteId} `,
      customerId: ' cust-aino ',
      answers: answersOf('cust-aino'),
    });
    expect(status).toBe(201);
  });

  it.each([
    ['another customer', 'cust-mikko', 403, 'FORBIDDEN'],
    ['the admin without onBehalfOf', 'admin', 403, 'NOT_APPLICANT'],
    ['anonymous (no cookie)', undefined, 401, 'FORBIDDEN'],
    ['a cookie naming nobody we know', 'cust-nobody', 401, 'FORBIDDEN'],
  ])(
    'applying in Aino’s name as %s is %i %s and writes nothing (D73, D74)',
    async (_who, actor, status, code) => {
      actAs(actor);
      const result = await post({
        quoteId: await insertQuote(),
        customerId: 'cust-aino',
        answers: answersOf('cust-aino'),
      });
      expectRefusal(result, status, code);
      expect(await holder.db.application.count()).toBe(0);
      expect(await holder.db.auditLog.count()).toBe(0);
    }
  );

  it('an answer of the wrong shape is 400 INVALID_ANSWER with the question and the problem', async () => {
    const result = await applyAs('cust-aino', { ...answersOf('cust-aino'), q_country: 'Finland' });
    expectRefusal(result, 400, 'INVALID_ANSWER');
    expect(result.body.error?.details).toEqual({
      questionId: 'q_country',
      problem: { code: 'invalid', params: {} },
    });
  });

  it('a birth date out of range names the range the page shows', async () => {
    const result = await applyAs('cust-mikko', {
      ...answersOf('cust-mikko'),
      q_birth_date: '2026-11-06',
    });
    expectRefusal(result, 400, 'INVALID_ANSWER');
    expect(result.body.error?.details).toEqual({
      questionId: 'q_birth_date',
      problem: {
        code: 'birth_date_out_of_range',
        params: { earliest: '1906-11-05', latest: TODAY },
      },
    });
  });

  it('a missing answer is 400 INCOMPLETE_ANSWERS naming the first open question', async () => {
    const { q_email: _dropped, ...answers } = answersOf('cust-aino');
    const result = await applyAs('cust-aino', answers);
    expectRefusal(result, 400, 'INCOMPLETE_ANSWERS');
    expect(result.body.error?.details).toEqual({ questionId: 'q_email' });
  });

  it('unknown quote 404, unknown customer 404, and the demo clock past the validity 409', async () => {
    actAs('cust-aino');
    expectRefusal(
      await post({ quoteId: 'nope', customerId: 'cust-aino', answers: {} }),
      404,
      'QUOTE_NOT_FOUND'
    );
    actAs('admin');
    expectRefusal(
      await post({
        quoteId: await insertQuote(),
        customerId: 'admin',
        onBehalfOf: 'admin',
        answers: {},
      }),
      404,
      'CUSTOMER_NOT_FOUND'
    );
    actAs('cust-aino');
    holder.cookies.set(DEMO_CLOCK_COOKIE, '2026-11-20');
    expectRefusal(
      await post({
        quoteId: await insertQuote(),
        customerId: 'cust-aino',
        answers: answersOf('cust-aino'),
      }),
      409,
      'QUOTE_EXPIRED'
    );
  });
});

describe('one pending or approved application per quote', () => {
  it('a second application on a quote held by an approved one is 409 QUOTE_IN_USE with its id', async () => {
    actAs('cust-aino');
    const quoteId = await insertQuote();
    const first = await post({ quoteId, customerId: 'cust-aino', answers: answersOf('cust-aino') });
    expect(first.status).toBe(201);
    actAs('cust-olavi');
    const second = await post({
      quoteId,
      customerId: 'cust-olavi',
      answers: answersOf('cust-olavi'),
    });
    expectRefusal(second, 409, 'QUOTE_IN_USE');
    expect(second.body.error?.details).toEqual({ applicationId: first.body.data?.id });
  });
});

describe('GET /api/applications/[id]', () => {
  it('returns the stored application; an unknown id is 404', async () => {
    const created = await applyAs('cust-aino');
    const id = created.body.data?.id as string;
    const { status, body } = await get(id);
    expect(status).toBe(200);
    expect(body.data).toEqual(created.body.data);
    expectRefusal(await get('nope'), 404, 'APPLICATION_NOT_FOUND');
  });

  it('the admin reads it; another customer gets the same 404 as an unknown id (D57)', async () => {
    const created = await applyAs('cust-aino');
    const id = created.body.data?.id as string;
    actAs('admin');
    expect((await get(id)).status).toBe(200);
    for (const actor of ['anonymous', 'someone-unknown', undefined]) {
      actAs(actor);
      expectRefusal(await get(id), 401, 'FORBIDDEN');
    }
    for (const actor of ['cust-mikko']) {
      actAs(actor);
      const refused = await get(id);
      expectRefusal(refused, 404, 'APPLICATION_NOT_FOUND');
      actAs(actor);
      const missing = await get('nope');
      expect(refused.body.error).toEqual(missing.body.error);
    }
  });
});

describe('POST /api/applications/[id]/decision', () => {
  // A case a person must decide: an e-mail other than the record's (D38). Haapala's small lease
  // is no PEP case any more, since the PEP question is hidden below 10 000 € (D82).
  async function pending(
    customerId: string,
    answers: ReturnType<typeof answersOf> = {
      ...answersOf(customerId),
      q_email: 'someone-else@example.com',
    }
  ) {
    const created = await applyAs(customerId, answers);
    return created.body.data?.id as string;
  }

  it.each([
    ['a decision that is not approved or rejected', { decision: 'manual_review' }],
    ['a blank reviewer', { reviewedBy: '  ' }],
    ['a reviewer of 201 characters', { reviewedBy: 'x'.repeat(201) }],
    ['an unknown key', { signed: true }],
    ['a reviewer that is not a string', { reviewedBy: 7 }],
  ])('%s is 400 VALIDATION_ERROR', async (_name, patch) => {
    const id = await pending('cust-haapala');
    actAs('admin');
    expectRefusal(
      await postDecision(id, { decision: 'approved', reviewedBy: 'admin', ...patch }),
      400,
      'VALIDATION_ERROR'
    );
  });

  it.each([
    ['the applicant', 'cust-haapala', 403],
    ['anonymous', undefined, 401],
    ['another customer', 'cust-aino', 403],
  ])('a manual review is FORBIDDEN for %s (D73)', async (_who, actor, status) => {
    const id = await pending('cust-haapala');
    actAs(actor);
    expectRefusal(
      await postDecision(id, { decision: 'approved', reviewedBy: 'me' }),
      status,
      'FORBIDDEN'
    );
    expect(await holder.db.auditLog.count({ where: { action: 'application.decided' } })).toBe(0);
  });

  it('the reviewer is the cookie actor, never the body (review finding 13)', async () => {
    const id = await pending('cust-haapala');
    actAs('admin');
    const response = await postDecision(id, { decision: 'approved', reviewedBy: 'somebody else' });
    expect(response.status).toBe(200);
    const row = await holder.db.application.findUniqueOrThrow({ where: { id } });
    expect(row.reviewed_by).toBe('admin');
  });

  it('an approved application is 409 APPLICATION_NOT_PENDING; an unknown id is 404', async () => {
    const id = await pending('cust-aino', answersOf('cust-aino'));
    actAs('admin');
    expectRefusal(
      await postDecision(id, { decision: 'rejected', reviewedBy: 'admin' }),
      409,
      'APPLICATION_NOT_PENDING'
    );
    expectRefusal(
      await postDecision('nope', { decision: 'rejected', reviewedBy: 'admin' }),
      404,
      'APPLICATION_NOT_FOUND'
    );
  });

  it('awaiting the signatory: nobody signs on the decision page, FORBIDDEN; the link signs (D46, D73)', async () => {
    const id = await pending('cust-norvi', {
      ...answersOf('cust-norvi'),
      q_customer_type: 'company',
    });
    const attempts: [string | undefined, string][] = [
      ['admin', 'signatory@norvi.example.com'],
      ['cust-aino', 'signatory@norvi.example.com'],
      ['cust-norvi', 'fleet@norvi.example.com'],
      ['cust-norvi', 'Signatory@norvi.example.com'],
      [undefined, 'signatory@norvi.example.com'],
    ];
    for (const [actor, reviewedBy] of attempts) {
      actAs(actor);
      const refused = await postDecision(id, { decision: 'approved', reviewedBy });
      expectRefusal(refused, actor === undefined ? 401 : 403, 'FORBIDDEN');
      if (actor !== undefined) {
        expect(refused.body.error?.details).toMatchObject({ code: 'signatory_required' });
      }
    }
    const { token } = await holder.db.signatureRequest.findFirstOrThrow({
      where: { application_id: id },
    });
    const context = { params: Promise.resolve({ token }) };
    const state = await signRoute.GET(new Request('http://test/api/sign'), context);
    expect(state.status).toBe(200);
    const signed = await signRoute.POST(json({ action: 'sign' }), context);
    expect(signed.status).toBe(200);
    expect(((await signed.json()) as Envelope).data?.decision).toBe('approved');
    const again = await signRoute.POST(json({ action: 'decline' }), context);
    expectRefusal(
      { status: again.status, body: (await again.json()) as Envelope },
      409,
      'SIGNING_LINK_USED'
    );
    const unknown = await signRoute.POST(json({ action: 'sign' }), {
      params: Promise.resolve({ token: 'x'.repeat(32) }),
    });
    expectRefusal(
      { status: unknown.status, body: (await unknown.json()) as Envelope },
      404,
      'SIGNING_LINK_NOT_FOUND'
    );
  });
});
