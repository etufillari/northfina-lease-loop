import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createTestDb } from '../../tests/helpers/test-db';
import {
  createLease,
  demoContext,
  prepareApplication,
  resetSpine,
} from '../../tests/helpers/spine';
import type { PrismaClient } from './prisma-client';
import { getBootstrap } from './spine-offers';
import { getPassport } from './spine-history';
import { dealerWorkspaceSchema } from '@/data/spine-response-schemas';

const state = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock('@/server/db', () => ({
  get db() {
    return state.db;
  },
}));

import { GET as getDealer } from '@/app/api/spine/dealer/route';
import { GET as getCustomerBootstrap } from '@/app/api/spine/bootstrap/route';
import { GET as getQuotes } from '@/app/api/spine/quotes/[id]/route';
import { GET as getApplications } from '@/app/api/spine/applications/[id]/route';
import { GET as getContracts } from '@/app/api/spine/contracts/route';
import { GET as getAgreement } from '@/app/api/spine/contracts/[id]/route';
import { POST as postRelist } from '@/app/api/spine/assets/[id]/relist/route';
import { POST as postQuote } from '@/app/api/spine/quotes/route';
import { POST as postApplication } from '@/app/api/spine/applications/route';
import { POST as postSignature } from '@/app/api/spine/contracts/sign/route';
import { POST as postInvoices } from '@/app/api/spine/contracts/[id]/invoices/route';
import { POST as postEnd } from '@/app/api/spine/contracts/[id]/end/route';

let cleanup: () => Promise<void>;
beforeAll(async () => {
  const fixture = await createTestDb();
  state.db = fixture.db;
  cleanup = fixture.cleanup;
});
afterAll(async () => cleanup());
beforeEach(async () => resetSpine(state.db));

function request(path: string, body: unknown, role: 'customer' | 'operator') {
  return new Request('http://localhost/api/spine/' + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
      'x-demo-date': '2026-11-06',
      'x-demo-role': role,
      'x-demo-customer': 'cust-aino',
    },
    body: JSON.stringify(body),
  });
}

it('requires the dealer, audits the actual valuation, and feeds the next normal lease', async () => {
  const customer = await demoContext('cust-aino', '2026-11-06');
  const boot = await getBootstrap(state.db, customer, 'ebike-007');
  if (!boot.readiness?.ok) throw new Error('Expected a returned-bike work plan');
  const input = {
    requestId: randomUUID(),
    releaseRevision: boot.releaseRevision,
    netPriceCents: 130000,
    valuationReason: 'Inspected demo item; price set after the required work.',
    condition: 'good',
    completedTaskIds: boot.readiness.tasks.map((task) => task.id),
  };
  const route = { params: Promise.resolve({ id: 'ebike-007' }) };
  const rejected = await postRelist(request('assets/ebike-007/relist', input, 'customer'), route);
  expect(rejected.status).toBe(403);
  expect((await rejected.json()).error.code).toBe('OPERATOR_MODE_REQUIRED');
  expect(await state.db.assetRelease.count()).toBe(0);
  expect(await state.db.auditLog.count()).toBe(0);

  const response = await postRelist(request('assets/ebike-007/relist', input, 'operator'), route);
  expect(response.status).toBe(200);
  const saved = (await response.json()).data;
  expect(saved.offer.priceCents).toBe(130000);
  const repeated = await postRelist(request('assets/ebike-007/relist', input, 'operator'), route);
  expect((await repeated.json()).data).toEqual(saved);
  const item = await state.db.asset.findUniqueOrThrow({ where: { id: 'ebike-007' } });
  expect(item).toMatchObject({ status: 'available', usage_value: 18400, condition: 'good' });
  const release = await state.db.assetRelease.findUniqueOrThrow({ where: { asset_id: item.id } });
  expect(release).toMatchObject({
    net_price_cents: 130000,
    valuation_reason: input.valuationReason,
  });
  const trail = await state.db.auditLog.findMany({ where: { action: 'asset.relisted' } });
  expect(trail).toHaveLength(1);
  expect(trail[0]).toMatchObject({ actor: 'demo:operator:dealer', entity_id: item.id });
  expect(JSON.parse(trail[0]!.details_json ?? '{}')).toMatchObject({
    businessDate: '2026-11-06',
    netPriceCents: 130000,
    valuationReason: input.valuationReason,
    condition: 'good',
  });
  expect(trail[0]!.created_at).toBeInstanceOf(Date);
  const prepared = await getBootstrap(state.db, customer, item.id);
  expect(prepared.maintenance).toEqual({ batteryReplacementAtUsage: 18400 });
  const next = await createLease(state.db, customer, { assetId: item.id, termMonths: 36 });
  expect(next).toMatchObject({
    status: 'active',
    lifeNumber: item.previous_lives + 1,
    terms: { listPriceCents: 130000, monthlyNetCents: 3721 },
  });
  expect((await getPassport(state.db, item.id)).lives).toHaveLength(1);
});

it('refuses dealer attempts to create or manage a customer agreement without side effects', async () => {
  const customer = await demoContext('cust-aino', '2026-11-06');
  const { quote, application } = await prepareApplication(state.db, customer);
  const auditCount = await state.db.auditLog.count();
  const params = { params: Promise.resolve({ id: quote.id }) };
  const responses = [
    await postQuote(
      request(
        'quotes',
        {
          requestId: randomUUID(),
          assetId: 'ebike-003',
          termMonths: 36,
          downPaymentCents: 0,
          startDate: '2026-11-06',
        },
        'operator'
      ),
      undefined
    ),
    await postApplication(
      request(
        'applications',
        {
          requestId: randomUUID(),
          quoteId: quote.id,
          answers: application.answers,
        },
        'operator'
      ),
      undefined
    ),
    await postSignature(
      request('contracts/sign', { applicationId: application.id }, 'operator'),
      undefined
    ),
    await postInvoices(request('contracts/' + quote.id + '/invoices', {}, 'operator'), params),
    await postEnd(
      request(
        'contracts/' + quote.id + '/end',
        {
          requestId: randomUUID(),
          choice: 'return',
          condition: 'fair',
          usageValue: 18400,
        },
        'operator'
      ),
      params
    ),
  ];
  for (const response of responses) {
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('CUSTOMER_MODE_REQUIRED');
  }
  expect(await state.db.quote.count()).toBe(1);
  expect(await state.db.application.count()).toBe(1);
  expect(await state.db.contract.count()).toBe(0);
  expect(await state.db.invoice.count()).toBe(0);
  expect(await state.db.assetLease.count()).toBe(0);
  expect(await state.db.auditLog.count()).toBe(auditCount);
});

function readRequest(path: string, role: 'customer' | 'operator') {
  return new Request('http://localhost/api/spine/' + path, {
    headers: { 'x-demo-role': role, 'x-demo-date': '2026-11-06' },
  });
}

it('gives the dealer preparation data without exposing a default customer session', async () => {
  const customer = await demoContext('cust-aino', '2026-11-06');
  const { quote, application } = await prepareApplication(state.db, customer);
  const denied = await getDealer(readRequest('dealer?assetId=ebike-007', 'customer'), undefined);
  expect(denied.status).toBe(403);
  const allowed = await getDealer(readRequest('dealer?assetId=ebike-007', 'operator'), undefined);
  expect(allowed.status).toBe(200);
  const data = (await allowed.json()).data;
  expect(dealerWorkspaceSchema.safeParse(data).success).toBe(true);
  expect(data.asset.id).toBe('ebike-007');
  expect(data.returnedItems).toContainEqual({
    id: 'ebike-007',
    make: 'Nordvolt',
    model: 'Cargo Duo',
  });
  for (const key of ['customer', 'customers', 'questions', 'answers', 'contracts']) {
    expect(data).not.toHaveProperty(key);
  }
  const responses = [
    await getCustomerBootstrap(readRequest('bootstrap?assetId=ebike-003', 'operator'), undefined),
    await getQuotes(readRequest('quotes/' + quote.id, 'operator'), {
      params: Promise.resolve({ id: quote.id }),
    }),
    await getApplications(readRequest('applications/' + application.id, 'operator'), {
      params: Promise.resolve({ id: application.id }),
    }),
    await getContracts(readRequest('contracts', 'operator'), undefined),
    await getAgreement(readRequest('contracts/' + quote.id, 'operator'), {
      params: Promise.resolve({ id: quote.id }),
    }),
  ];
  for (const response of responses) {
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('CUSTOMER_MODE_REQUIRED');
  }
});
