// The 30 % rule at submission, against a real (test) database: every month of the lease is
// checked (VAT at each due date), together with the leases the customer already pays for.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import { ainoScript, applyAndSubmit } from '../../tests/helpers/apply-and-submit';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import { signApplication } from './contracts';
import { seedCustomers } from './customers';

type Db = Awaited<ReturnType<typeof createTestDb>>['db'];
let db: Db;
let cleanup: () => Promise<void>;
beforeEach(async () => {
  ({ db, cleanup } = await createTestDb());
  await seedAssets(db, await loadAssets());
  await seedCustomers(db, await loadCustomers());
});
afterEach(async () => {
  await cleanup();
});

const ON = '2026-11-05';
type Reason = { rule: string; outcome: string; params?: Record<string, unknown> };
const affordability = (state: { application: { decisionReasons: unknown } }) =>
  (state.application.decisionReasons as Reason[]).find((r) => r.rule === 'affordability');
const apply = (assetId: string, income: number, termMonths = 36) =>
  applyAndSubmit(db, {
    customerId: 'cust-aino',
    assetIds: [assetId],
    downPaymentCents: 0,
    termMonths,
    script: { ...ainoScript, q_monthly_income: income },
    asOf: ON,
  });

describe('every month of the lease counts', () => {
  it('card 1 at €450 income: November fits (€134.66), January 2027 does not (€135.20)', async () => {
    const state = await apply('ebike-003', 45_000);
    expect(state.application.status).toBe('declined');
    expect(affordability(state)).toMatchObject({
      outcome: 'failed',
      params: { limitCents: 13_500, month: '2027-01', totalCents: 13_520, existingCents: 0 },
    });
  });

  it('with enough income it passes, naming the heaviest month', async () => {
    const state = await apply('ebike-003', 320_000);
    expect(state.application.status).toBe('approved');
    expect(affordability(state)).toMatchObject({
      outcome: 'passed',
      // The last invoice carries the leftover cents: €107.36 net, €135.27 with 26 % VAT.
      params: { limitCents: 96_000, month: '2029-10', totalCents: 13_527 },
    });
  });
});

describe('a lease they already have counts too', () => {
  it('a second lease that fits alone is declined when both together do not', async () => {
    // Lease 1: ebike-003, €134.66 a month (approved at a €3,200 income, then signed).
    const first = await apply('ebike-003', 320_000);
    const signed = await signApplication(db, {
      applicationId: first.application.id,
      startDate: ON,
      actor: 'cust-aino',
      asOf: ON,
    });
    if (!signed.ok) throw new Error(signed.reason);

    // Now she says she earns €900: the limit is €270. ebike-004 alone is about €190 a month…
    const second = await apply('ebike-004', 90_000);
    expect(second.application.status).toBe('declined');
    const reason = affordability(second)!;
    expect(reason.outcome).toBe('failed');
    expect(reason.params).toMatchObject({
      limitCents: 27_000,
      month: '2026-11',
      existingCents: 13_466, // …but lease 1's November invoice is due the same month.
    });
    expect(Number(reason.params!.newCents)).toBeLessThanOrEqual(27_000);
    expect(Number(reason.params!.totalCents)).toBe(
      Number(reason.params!.newCents) + Number(reason.params!.existingCents)
    );
  });
});
