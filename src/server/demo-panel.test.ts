// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
// Expected counts read from data/assets.json: 23 available, 6 returned, 1 reserved (30 items).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import type { Asset } from '@/data/schemas';
import { quoteAndSign } from '../../tests/helpers/quote-and-sign';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import { loadDemoPanel, resolveScenarioTarget } from './demo-panel';
import { loadLeaseDataPack, type LeaseDataPack } from './lease-data';
import type { PrismaClient } from './prisma-client';
import { createQuote } from './quotes';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let assets: Asset[];
let data: LeaseDataPack;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  [assets, data] = await Promise.all([loadAssets(), loadLeaseDataPack()]);
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await db.contractEnding.deleteMany();
  await db.quote.deleteMany();
  await db.contract.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, assets);
});

// Card 1: Aino's own record (data/customers.json), ebike-003 for 36 months on 5 Nov 2026.
const card1 = {
  assetId: 'ebike-003',
  customerId: 'cust-aino',
  termMonths: 36,
  downPaymentCents: 0,
  answers: {
    q_customer_type: 'consumer',
    q_full_name: 'Aino Virtanen',
    q_birth_date: '1997-04-12',
    q_email: 'aino.virtanen@example.com',
    q_country: 'FI',
    q_employment: 'employed',
    q_monthly_income: 320_000,
    q_usage_purpose: 'commuting',
  },
  today: '2026-11-05',
  actor: 'cust-aino',
};
const card8 = {
  kind: 'contract',
  assetId: 'ebike-003',
  customerId: 'cust-aino',
  status: 'active',
} as const;

describe('loadDemoPanel', () => {
  it('groups the seeded items by status, with nothing signed yet', async () => {
    const panel = await loadDemoPanel(db);
    expect(panel.assets.filter((a) => a.status === 'available')).toHaveLength(23);
    expect(panel.assets.filter((a) => a.status === 'returned').map((a) => a.id)).toEqual(
      expect.arrayContaining(['ebike-007', 'ebike-008'])
    );
    expect(panel.assets.filter((a) => a.status === 'returned')).toHaveLength(6);
    expect(panel.assets.filter((a) => a.status === 'reserved')).toHaveLength(1);
    expect(panel.contracts).toEqual([]);
    expect(panel.auditCount).toBe(0);
  });

  it('shows card 1 as a live contract once Aino has signed, and counts its audit rows', async () => {
    const signed = await quoteAndSign(db, data, card1);
    if (!signed.ok) throw new Error(signed.reason);
    const panel = await loadDemoPanel(db);
    expect(panel.contracts).toEqual([
      {
        id: signed.id,
        assetId: 'ebike-003',
        customerId: 'cust-aino',
        status: 'active',
        startDate: '2026-11-05',
        ended: false,
      },
    ]);
    // quote.created and contract.signed.
    expect(panel.auditCount).toBe(2);
  });

  it('marks a contract that has an ending as ended', async () => {
    const signed = await quoteAndSign(db, data, card1);
    if (!signed.ok) throw new Error(signed.reason);
    await db.contractEnding.create({
      data: {
        contract_id: signed.id,
        kind: 'buy',
        decided_on: '2029-11-05',
        effective_date: '2029-11-05',
        ending_json: '{}',
      },
    });
    expect((await loadDemoPanel(db)).contracts[0]?.ended).toBe(true);
  });
});

describe('resolveScenarioTarget', () => {
  it('card 8 has nowhere to go until card 1 is signed', async () => {
    expect(resolveScenarioTarget(await loadDemoPanel(db), card8)).toBeNull();
  });

  it('card 8 opens Aino’s live ebike-003 contract', async () => {
    const signed = await quoteAndSign(db, data, card1);
    if (!signed.ok) throw new Error(signed.reason);
    expect(resolveScenarioTarget(await loadDemoPanel(db), card8)).toEqual({
      kind: 'contract',
      id: signed.id,
    });
  });

  it('card 8 skips an ended contract', async () => {
    const signed = await quoteAndSign(db, data, card1);
    if (!signed.ok) throw new Error(signed.reason);
    await db.contractEnding.create({
      data: {
        contract_id: signed.id,
        kind: 'return',
        decided_on: '2029-11-05',
        effective_date: '2029-11-05',
        ending_json: '{}',
      },
    });
    expect(resolveScenarioTarget(await loadDemoPanel(db), card8)).toBeNull();
  });

  it('card 6 step 2 opens the ebike-004 contract that waits for its signatory', async () => {
    const target = {
      kind: 'contract',
      assetId: 'ebike-004',
      status: 'awaiting_signatory',
    } as const;
    expect(resolveScenarioTarget(await loadDemoPanel(db), target)).toBeNull();
    const row = await db.contract.create({
      data: {
        asset_id: 'ebike-004',
        customer_id: 'cust-norvi',
        sign_date: '2026-11-05',
        start_date: '2026-11-05',
        terms_json: '{}',
        status: 'awaiting_signatory',
        signatory_email: 'ceo@norvi.example.com',
        sent_on: '2026-11-05',
      },
    });
    expect(resolveScenarioTarget(await loadDemoPanel(db), target)).toEqual({
      kind: 'contract',
      id: row.id,
    });
  });

  it('card 2 step 2 opens the newest laptop-004 quote that hasn’t been signed', async () => {
    const target = { kind: 'open_quote', assetId: 'laptop-004' } as const;
    expect(resolveScenarioTarget(await loadDemoPanel(db), target)).toBeNull();
    const quote = (day: string) =>
      createQuote(db, data, {
        assetId: 'laptop-004',
        termMonths: 36,
        downPaymentCents: 0,
        today: day,
        actor: 'customer',
      });
    const first = await quote('2026-11-05');
    const second = await quote('2026-11-05');
    if (!first.ok || !second.ok) throw new Error('quote refused');
    expect(resolveScenarioTarget(await loadDemoPanel(db), target)).toEqual({
      kind: 'quote',
      id: second.id,
    });
  });

  it('gives null for targets the page links to itself', async () => {
    const panel = await loadDemoPanel(db);
    expect(resolveScenarioTarget(panel, { kind: 'asset', assetId: 'ebike-003' })).toBeNull();
  });
});
