import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../../tests/helpers/test-db';
import { createLease, demoContext, resetSpine } from '../../tests/helpers/spine';
import { answersFromCustomer } from '@/domain/question-flow';
import { refurbishmentPlan } from '@/domain/lifecycle';
import { dealerWorkspaceSchema } from '@/data/spine-response-schemas';
import type { PrismaClient } from './prisma-client';
import { readDealerNextActions } from './dealer-next-actions';
import { getDealerWorkspace } from './spine-dealer';
import { createQuote } from './spine-quotes';
import { submitApplication } from './spine-applications';
import { relistAsset } from './spine-relist';

const state = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock('@/server/db', () => ({
  get db() {
    return state.db;
  },
}));
import { GET } from '@/app/api/spine/dealer/route';
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db: state.db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetSpine(state.db);
});

function request(role = 'operator', date = '2026-11-06') {
  return new Request('http://localhost/api/spine/dealer?assetId=ebike-007', {
    headers: { 'x-demo-role': role, 'x-demo-date': date },
  });
}

async function handoff(onDate = '2026-11-06') {
  const customer = await demoContext('cust-norvi', onDate);
  const quote = await createQuote(state.db, customer, {
    requestId: randomUUID(),
    assetId: 'ebike-004',
    termMonths: 36,
    downPaymentCents: 50000,
    startDate: onDate,
  });
  const application = await submitApplication(state.db, customer, {
    requestId: randomUUID(),
    quoteId: quote.id,
    answers: {
      ...answersFromCustomer(customer.customer),
      q_usage_purpose: 'delivery',
      q_signatory_email: 'director@example.com',
    },
  });
  expect(application.reasons).toContain('signatory_required');
  return { quote, application };
}

async function publish(date = '2026-11-06') {
  const operator = await demoContext('cust-aino', date, true);
  const workspace = await getDealerWorkspace(state.db, operator, 'ebike-007');
  const plan = refurbishmentPlan({
    asset: workspace.asset,
    costs: workspace.refurbishmentCosts,
    targetCondition: 'good',
    maintenance: workspace.maintenance,
  });
  if (!plan.ok) throw new Error('Expected a preparation plan');
  return relistAsset(state.db, operator, 'ebike-007', {
    requestId: randomUUID(),
    releaseRevision: workspace.releaseRevision,
    netPriceCents: 130000,
    condition: 'good',
    valuationReason: 'Verified synthetic workshop work and new offer valuation.',
    completedTaskIds: plan.tasks.map((task) => task.id),
  });
}

describe('dealer needs-attention read model', () => {
  it('returns the common envelope and validated action list without changing records', async () => {
    const before = await state.db.auditLog.count();
    const response = await GET(request(), undefined);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.meta.timestamp).toEqual(expect.any(String));
    const workspace = dealerWorkspaceSchema.parse(body.data);
    expect(workspace.nextActions).toContainEqual({
      assetId: 'ebike-007',
      make: 'Nordvolt',
      model: 'Cargo Duo',
      kind: 'prepare_item',
      pendingSignatures: 0,
    });
    expect(workspace.nextActions.some((action) => action.assetId === 'ebike-009')).toBe(false);
    expect(await state.db.auditLog.count()).toBe(before);
    expect(await state.db.assetRelease.count()).toBe(0);
  });

  it('rejects Customer mode through the real handler and the server function', async () => {
    const response = await GET(request('customer'), undefined);
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('OPERATOR_MODE_REQUIRED');
    await expect(readDealerNextActions(state.db, await demoContext())).rejects.toMatchObject({
      code: 'OPERATOR_MODE_REQUIRED',
    });
  });

  it('shows a genuine company handoff while omitting all private application data', async () => {
    const { quote, application } = await handoff();
    const response = await GET(request(), undefined);
    const body = await response.json();
    expect(body.data.nextActions[0]).toMatchObject({
      assetId: 'ebike-004',
      kind: 'awaiting_signer',
      pendingSignatures: 1,
    });
    const serialized = JSON.stringify(body.data);
    for (const privateValue of [
      'director@example.com',
      'cust-norvi',
      quote.id,
      application.id,
      'answers',
      'reasons_json',
      'answers_json',
      'q_signatory_email',
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
    expect(await state.db.contract.count()).toBe(0);
    expect(await state.db.assetLease.count()).toBe(0);
  });

  it('removes an expired handoff and does not expose a future application in a past demo date', async () => {
    await handoff();
    expect(
      (
        await readDealerNextActions(state.db, await demoContext('cust-aino', '2026-11-07', true))
      ).some((action) => action.kind === 'awaiting_signer')
    ).toBe(false);
    await resetSpine(state.db);
    await handoff('2027-01-01');
    expect(
      (
        await readDealerNextActions(state.db, await demoContext('cust-aino', '2026-11-06', true))
      ).some((action) => action.kind === 'awaiting_signer')
    ).toBe(false);
  });

  it('ignores unrelated manual review and outdated release revisions', async () => {
    const { application } = await handoff();
    await state.db.application.update({
      where: { id: application.id },
      data: {
        reasons_json: JSON.stringify({
          reasons: ['pep'],
          missingQuestionIds: [],
          invalidQuestionIds: [],
        }),
      },
    });
    const operator = await demoContext('cust-aino', '2026-11-06', true);
    expect(
      (await readDealerNextActions(state.db, operator)).some(
        (action) => action.kind === 'awaiting_signer'
      )
    ).toBe(false);
    await state.db.application.update({
      where: { id: application.id },
      data: {
        reasons_json: JSON.stringify({
          reasons: ['signatory_required'],
          missingQuestionIds: [],
          invalidQuestionIds: [],
        }),
      },
    });
    await state.db.assetRelease.create({ data: { asset_id: 'ebike-004', revision: 1 } });
    expect(
      (await readDealerNextActions(state.db, operator)).some(
        (action) => action.kind === 'awaiting_signer'
      )
    ).toBe(false);
  });

  it('changes preparation to offer ready after publishing, then removes it after signature', async () => {
    const operator = await demoContext('cust-aino', '2026-11-06', true);
    await publish();
    expect(
      (await readDealerNextActions(state.db, operator)).find(
        (action) => action.assetId === 'ebike-007'
      )
    ).toMatchObject({ kind: 'offer_ready' });
    await createLease(state.db, await demoContext('cust-aino', '2026-11-06'), {
      assetId: 'ebike-007',
      termMonths: 12,
    });
    expect(
      (await readDealerNextActions(state.db, operator)).some(
        (action) => action.assetId === 'ebike-007'
      )
    ).toBe(false);
  });

  it('only includes a published offer once its ready date arrives', async () => {
    await publish('2027-01-01');
    expect(
      (
        await readDealerNextActions(state.db, await demoContext('cust-aino', '2026-11-06', true))
      ).some((action) => action.assetId === 'ebike-007')
    ).toBe(false);
    expect(
      (
        await readDealerNextActions(state.db, await demoContext('cust-aino', '2027-01-01', true))
      ).find((action) => action.assetId === 'ebike-007')?.kind
    ).toBe('offer_ready');
  });

  it('shows a reservation name on offer details without exposing contact data', async () => {
    await publish();
    await state.db.assetRelease.update({
      where: { asset_id: 'ebike-007' },
      data: { reserved_for_customer_id: 'cust-aino' },
    });
    const operator = await demoContext('cust-aino', '2026-11-06', true);
    const data = await getDealerWorkspace(state.db, operator, 'ebike-007');
    expect(data.reservation).toEqual({ reserved: true, customerName: 'Aino Virtanen' });
    expect(JSON.stringify(data)).not.toContain('aino.virtanen@example.com');
    await state.db.assetRelease.update({
      where: { asset_id: 'ebike-007' },
      data: { reserved_for_customer_id: 'missing-profile' },
    });
    expect((await getDealerWorkspace(state.db, operator, 'ebike-007')).reservation).toEqual({
      reserved: true,
      customerName: null,
    });
  });
});
