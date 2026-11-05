// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { submitApplication, type SubmitApplicationInput } from './applications';
import { changeAssetStatus, seedAssets } from './assets';
import type { PrismaClient } from './prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await db.application.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
});

const TODAY = '2026-11-05';

const aino: SubmitApplicationInput = {
  assetId: 'ebike-003',
  termMonths: 36,
  downPaymentCents: 0,
  answers: {
    q_customer_type: 'consumer',
    q_full_name: 'Aino Virtanen',
    q_birth_date: '1997-04-12',
    q_email: 'aino.virtanen@example.com',
    q_country: 'FI',
    q_employment: 'employed',
    q_monthly_income: '3200',
    q_usage_purpose: 'commuting',
  },
};

describe('submitApplication', () => {
  it('approves Aino, stores the price snapshot and writes an audit row', async () => {
    const result = await submitApplication(db, aino, TODAY);
    expect(result).toMatchObject({
      ok: true,
      application: {
        assetId: 'ebike-003',
        decision: 'approved',
        reasons: [],
        priceListVersion: 1,
        quoteDate: TODAY,
        quote: { monthlyNetCents: 10_730, monthlyGrossCents: 13_466 },
      },
    });
    if (!result.ok) return;

    const row = await db.application.findUniqueOrThrow({ where: { id: result.application.id } });
    expect(row).toMatchObject({
      asset_id: 'ebike-003',
      applicant_name: 'Aino Virtanen',
      price_list_version: 1,
      monthly_net_cents: 10_730,
      vat_basis_points: 2_550,
      monthly_gross_cents: 13_466,
      decision: 'approved',
    });

    const audit = await db.auditLog.findMany();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actor: 'Aino Virtanen',
      action: 'application.submitted',
      entity_type: 'application',
      entity_id: result.application.id,
    });
  });

  it('prices on the date it is given: the same lease on Friday uses price list 2', async () => {
    const result = await submitApplication(db, aino, '2026-11-06');
    expect(result).toMatchObject({ ok: true, application: { priceListVersion: 2 } });
  });

  it('records a rejection with its reasons (Mikko, 17)', async () => {
    const result = await submitApplication(
      db,
      {
        assetId: 'laptop-008',
        termMonths: 36,
        downPaymentCents: 0,
        answers: { q_customer_type: 'consumer', q_birth_date: '2009-03-10' },
      },
      TODAY
    );
    expect(result).toMatchObject({
      ok: true,
      application: { decision: 'rejected', reasons: ['min_age'] },
    });
  });

  it('drops stale answers before storing them', async () => {
    const result = await submitApplication(
      db,
      { ...aino, answers: { ...aino.answers, q_can_sign: 'no', q_company_name: 'Old Oy' } },
      TODAY
    );
    if (!result.ok) throw new Error(result.reason);
    const row = await db.application.findUniqueOrThrow({ where: { id: result.application.id } });
    expect(JSON.parse(row.answers_json)).toEqual(aino.answers);
  });

  it('refuses an unknown or unavailable asset', async () => {
    expect(await submitApplication(db, { ...aino, assetId: 'ebike-999' }, TODAY)).toEqual({
      ok: false,
      reason: 'asset_not_found',
    });
    expect(await submitApplication(db, { ...aino, assetId: 'ebike-009' }, TODAY)).toEqual({
      ok: false,
      reason: 'asset_not_available',
    });
  });

  it('refuses an asset that became reserved after the page was opened', async () => {
    await changeAssetStatus(db, { id: 'ebike-003', status: 'reserved', actor: 'test' });
    expect(await submitApplication(db, aino, TODAY)).toEqual({
      ok: false,
      reason: 'asset_not_available',
    });
  });

  it('refuses a term or down payment that cannot be priced', async () => {
    expect(await submitApplication(db, { ...aino, termMonths: 30 }, TODAY)).toEqual({
      ok: false,
      reason: 'cannot_quote',
    });
    expect(await submitApplication(db, { ...aino, downPaymentCents: 380_000 }, TODAY)).toEqual({
      ok: false,
      reason: 'cannot_quote',
    });
  });

  it('refuses an application with unanswered questions and stores nothing', async () => {
    const result = await submitApplication(
      db,
      { ...aino, answers: { q_customer_type: 'consumer' } },
      TODAY
    );
    expect(result).toEqual({ ok: false, reason: 'incomplete' });
    expect(await db.application.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
  });
});
