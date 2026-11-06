// Runs the whole scenario on a real, migrated SQLite database, then plays the scenario cards
// on top of it: the demo must leave them free to work.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import {
  ainoEbikeAnswers,
  haapalaFarmAnswers,
  norviEbikeAnswers,
} from '../../../tests/helpers/applicants';
import { applyFor, signFor } from '../../../tests/helpers/lease-flow';
import { createTestDb } from '../../../tests/helpers/test-db';
import { listApplications } from '../application/applications';
import { manualReviewCases } from '../application/manual-review';
import { seedAssets } from '../assets/assets';
import { contractViews, listContracts } from '../contract/contracts';
import { getAppDate, setDemoDate } from '../date/app-date';
import { listInvoices } from '../invoicing/invoices';
import type { PrismaClient } from '../prisma-client';
import { dealerDashboard } from '../second-life/dealer-dashboard';
import { CARD_ITEMS, DEMO_DATE, seedDemoScenario } from './demo-scenario';

let db: PrismaClient;
let cleanup: () => Promise<void>;

async function emptyDatabase() {
  await db.auditLog.deleteMany();
  await db.assetLife.deleteMany();
  await db.invoice.deleteMany();
  await db.contract.deleteMany();
  await db.application.deleteMany();
  await db.asset.deleteMany();
  await db.appSetting.deleteMany();
  await seedAssets(db, await loadAssets());
}

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await emptyDatabase();
  await seedDemoScenario(db);
});

async function application(customerId: string) {
  const [found] = await listApplications(db, { customerId });
  if (!found) throw new Error(`no application from ${customerId}`);
  return found;
}

const contractOf = async (customerId: string) => {
  const [found] = await contractViews(db, await listContracts(db, { customerId }));
  if (!found) throw new Error(`no contract for ${customerId}`);
  return found;
};

const statusOf = async (assetId: string) =>
  (await db.asset.findUniqueOrThrow({ where: { id: assetId } })).status;

describe('seedDemoScenario', () => {
  it('leaves the app running on the demo date', async () => {
    expect(await getAppDate(db)).toEqual({ date: DEMO_DATE, is_demo: true });
  });

  it.each([
    ['cust-mikko', 'min_age'],
    ['cust-sanna', 'affordability'],
    ['cust-broken-id', 'business_id'],
  ])('has %s rejected for %s', async (customerId, reason) => {
    expect(await application(customerId)).toMatchObject({
      decision: 'rejected',
      reasons: [reason],
    });
  });

  it('has one case waiting for an admin', async () => {
    const cases = await manualReviewCases(db, 'en');

    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ customer_id: 'cust-haapala', asset_id: 'farm-003' });
  });

  it('has an approved application ready to sign', async () => {
    const lena = await application('cust-lena');

    expect(lena).toMatchObject({ decision: 'approved', asset_id: 'ebike-006' });
    expect(await listContracts(db, { customerId: 'cust-lena' })).toEqual([]);
  });

  it('has an application waiting for a company signature', async () => {
    const norvi = await application('cust-norvi');

    expect(norvi).toMatchObject({ decision: 'approved', asset_id: 'laptop-010' });
    expect(norvi.answers.q_can_sign).toBe('no');
    expect(await listContracts(db, { customerId: 'cust-norvi' })).toEqual([]);
  });

  it('has a signed contract with invoices on both sides of the VAT change', async () => {
    const contract = await contractOf('cust-pekka');
    const invoices = await listInvoices(db, { contractId: contract.id });

    expect(contract).toMatchObject({ asset_id: 'ebike-005', status: 'active' });
    expect(invoices.filter((invoice) => invoice.vat_change !== null)).toHaveLength(1);
    expect(await statusOf('ebike-005')).toBe('leased');
  });

  it('has an item held for someone', async () => {
    const { held } = await dealerDashboard(db);

    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ id: 'ebike-002', held_for_name: 'Jonas Lind' });
  });

  it('has a re-listed used item, and leaves the others to the dealer', async () => {
    const relisted = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-011' } });
    const { returned } = await dealerDashboard(db);

    expect(relisted.status).toBe('available');
    expect(relisted.relist_price_cents).toBeGreaterThan(0);
    expect(returned.map((asset) => asset.id)).not.toContain('ebike-011');
    expect(returned).toHaveLength(5);
  });

  it.each(['cust-olavi', 'cust-wait-01', 'cust-kettukoodi'])(
    'opens the end-of-term choice for %s on 1 Jan 2027',
    async (customerId) => {
      expect((await contractOf(customerId)).end_choice).toBe('not_due');

      await setDemoDate(db, { date: '2027-01-01', actor: 'test' });

      expect((await contractOf(customerId)).end_choice).toBe('open');
    }
  );

  it('refuses to run twice', async () => {
    await expect(seedDemoScenario(db)).rejects.toThrow('empty database');
  });

  it('writes an audit row for everything it did', async () => {
    const actions = (await db.auditLog.findMany()).map((row) => row.action);

    expect(actions).toEqual(
      expect.arrayContaining([
        'application.submitted',
        'contract.signed',
        'asset.relisted',
        'asset.held',
      ])
    );
  });
});

describe('the scenario cards, after the demo', () => {
  it('leaves every item the cards need untouched', async () => {
    const seeded = await loadAssets();

    for (const id of CARD_ITEMS) {
      expect(await statusOf(id), id).toBe(seeded.find((asset) => asset.id === id)?.status);
    }
    const touched = await db.application.count({ where: { asset_id: { in: [...CARD_ITEMS] } } });
    expect(touched).toBe(0);
  });

  it('leaves Aino with nothing, so card 1 starts clean', async () => {
    expect(await listApplications(db, { customerId: 'cust-aino' })).toEqual([]);
  });

  it('still runs card 1', async () => {
    const applied = await applyFor(db, 'cust-aino', 'ebike-003', ainoEbikeAnswers);
    const signed = await signFor(db, 'cust-aino', applied.id);

    expect(signed).toMatchObject({ monthly_net_rent_cents: 10_730, total_cents: 486_612 });
  });

  it('still runs card 6', async () => {
    const applied = await applyFor(db, 'cust-norvi', 'ebike-004', norviEbikeAnswers);
    expect(applied.decision).toBe('approved');
  });

  it('still runs card 7, next to the demo case', async () => {
    const applied = await applyFor(db, 'cust-haapala', 'farm-002', haapalaFarmAnswers, {
      termMonths: 48,
      downPaymentCents: 2_000_000,
    });

    expect(applied.decision).toBe('manual_review');
    expect(await manualReviewCases(db, 'en')).toHaveLength(2);
  });
});
