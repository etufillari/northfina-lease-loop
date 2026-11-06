import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/generated/prisma/client';
import { loadVatRates } from '@/data/load';
import { createTestDb } from '../../../tests/helpers/test-db';
import { ainoSignedTerms } from '../../../tests/fixtures/mock-contract-activation';
import { activateLease } from './leases';
import { createEngineHttpHandlers, type EnginePrincipal } from './http';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let leaseId: string;
let actor: EnginePrincipal | null;
const resolvePrincipal = vi.fn(async () => actor);
const loadTaxRules = vi.fn(async () => (await loadVatRates()).rates);
const handlers = () => createEngineHttpHandlers({ db, resolvePrincipal, loadTaxRules });
const context = () => ({ params: Promise.resolve({ leaseId }) });
const read = () => new Request('https://lease.test/api/leases/' + leaseId);
function post(body: unknown = { periodIndex: 1 }, key: string | null = 'http-invoice-1') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key !== null) headers['Idempotency-Key'] = key;
  return new Request('https://lease.test/api/leases/' + leaseId + '/invoices', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}
async function data(response: Response) {
  return response.json();
}

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
afterEach(() => vi.restoreAllMocks());
beforeEach(async () => {
  vi.clearAllMocks();
  loadTaxRules.mockImplementation(async () => (await loadVatRates()).rates);
  resolvePrincipal.mockImplementation(async () => actor);
  actor = { actorId: 'trusted-operator', role: 'operator' };
  await db.engineInvoice.deleteMany();
  await db.engineLease.deleteMany();
  await db.engineCommandReceipt.deleteMany();
  await db.engineInvoiceCounter.deleteMany();
  await db.auditLog.deleteMany();
  const lease = await activateLease(
    db,
    { actor: 'fixture', idempotencyKey: 'http-activate' },
    ainoSignedTerms,
    ainoSignedTerms.startDate
  );
  leaseId = lease.leaseId;
});

describe('engine HTTP boundary with injected trusted auth', () => {
  it('requires authentication for every handler', async () => {
    actor = null;
    const http = handlers();
    for (const response of await Promise.all([
      http.lease(read(), context()),
      http.schedule(read(), context()),
      http.invoices(read(), context()),
      http.invoice(read(), { params: Promise.resolve({ invoiceId: 'unknown' }) }),
      http.issue(post(), context()),
    ])) {
      expect(response.status).toBe(401);
      expect(await data(response)).toMatchObject({
        success: false,
        error: { code: 'UNAUTHORIZED' },
      });
    }
    expect(await db.engineInvoice.count()).toBe(0);
    expect(loadTaxRules).not.toHaveBeenCalled();
  });

  it('allows customers to read their own lease, schedule and invoices', async () => {
    const http = handlers();
    await http.issue(post(), context());
    const invoice = await db.engineInvoice.findFirstOrThrow();
    actor = { actorId: 'session-aino', role: 'customer', customerId: 'cust-aino' };
    expect(await data(await http.lease(read(), context()))).toMatchObject({
      success: true,
      data: { leaseId, customerId: 'cust-aino' },
    });
    expect(await data(await http.schedule(read(), context()))).toMatchObject({
      success: true,
      data: { totalNetCents: 386280 },
    });
    expect(await data(await http.invoices(read(), context()))).toMatchObject({
      success: true,
      data: [{ grossCents: 13466 }],
    });
    expect(
      await data(await http.invoice(read(), { params: Promise.resolve({ invoiceId: invoice.id }) }))
    ).toMatchObject({ success: true, data: { invoiceId: invoice.id } });
  });

  it('denies another customer and denies customer invoice issuance', async () => {
    const http = handlers();
    await http.issue(post(), context());
    const invoice = await db.engineInvoice.findFirstOrThrow();
    actor = { actorId: 'other-session', role: 'customer', customerId: 'cust-other' };
    for (const response of await Promise.all([
      http.lease(read(), context()),
      http.schedule(read(), context()),
      http.invoices(read(), context()),
      http.invoice(read(), { params: Promise.resolve({ invoiceId: invoice.id }) }),
      http.issue(post({ periodIndex: 2 }), context()),
    ]))
      expect(response.status).toBe(403);
    expect(await db.engineInvoice.count()).toBe(1);
  });

  it('issues once, replays original response and derives audit actor from server principal', async () => {
    const http = handlers();
    const first = await http.issue(post(), context());
    expect(first.status).toBe(200);
    const original = await data(first);
    expect(original).toMatchObject({
      success: true,
      data: { netCents: 10730, vatCents: 2736, grossCents: 13466 },
    });
    expect(await data(await http.issue(post(), context()))).toMatchObject({
      success: true,
      data: original.data,
    });
    expect(await db.engineInvoice.count()).toBe(1);
    expect(
      (await db.auditLog.findFirstOrThrow({ where: { action: 'engine.issue_invoice_command' } }))
        .actor
    ).toBe('trusted-operator');
    expect((await http.issue(post({ periodIndex: 2 }), context())).status).toBe(409);
    expect((await http.issue(post({ periodIndex: 1 }, 'another-key'), context())).status).toBe(409);
  });

  it('rejects missing keys, invalid JSON/periods, and caller-supplied financial or actor fields', async () => {
    const http = handlers();
    for (const request of [
      post({}, null),
      post({ periodIndex: 0 }),
      post({ periodIndex: 49 }),
      post({ periodIndex: 1 }, null),
      post({ periodIndex: 1, actor: 'spoofed' }),
      post({ periodIndex: 1, monthlyNetCents: 1 }),
      post({ periodIndex: 1, taxRules: [] }),
      new Request('https://lease.test', { method: 'POST', body: '{bad' }),
    ])
      expect((await http.issue(request, context())).status).toBe(400);
    expect(await db.engineInvoice.count()).toBe(0);
  });

  it('returns safe not-found and tax configuration errors without mutations', async () => {
    const http = handlers();
    expect(
      (await http.lease(read(), { params: Promise.resolve({ leaseId: 'missing' }) })).status
    ).toBe(404);
    expect(
      (await http.invoice(read(), { params: Promise.resolve({ invoiceId: 'missing' }) })).status
    ).toBe(404);
    loadTaxRules.mockResolvedValue([]);
    const response = await http.issue(post(), context());
    expect(response.status).toBe(503);
    expect(await data(response)).toMatchObject({
      success: false,
      error: { code: 'TAX_CONFIGURATION_ERROR' },
    });
    expect(await db.engineInvoice.count()).toBe(0);
  });

  it('hides unexpected auth/provider errors behind the existing generic error envelope', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    loadTaxRules.mockRejectedValue(new Error('private db connection detail'));
    const response = await handlers().issue(post(), context());
    expect(response.status).toBe(500);
    expect(await data(response)).toMatchObject({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
    });
    expect(await db.engineInvoice.count()).toBe(0);
    resolvePrincipal.mockResolvedValue({ actorId: '', role: 'operator' });
    expect((await handlers().lease(read(), context())).status).toBe(500);
  });
});
