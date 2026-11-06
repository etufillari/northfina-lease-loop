import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import type { Asset } from '@/data/schemas';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import { createApplication, type ApplicationSubmissionRequest } from './applications';
import { createContract } from './contracts';
import { seedCustomers } from './customers';
import type { PrismaClient } from './prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let dataPack: Asset[];
let customerData: Awaited<ReturnType<typeof loadCustomers>>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  dataPack = await loadAssets();
  customerData = await loadCustomers();
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  await db.assetHistory.deleteMany();
  await db.contract.deleteMany();
  await db.auditLog.deleteMany();
  await db.application.deleteMany();
  await db.customer.deleteMany();
  await db.asset.deleteMany();
  await seedCustomers(db, customerData);
  await seedAssets(db, dataPack);
});

const approvedSubmission: ApplicationSubmissionRequest = {
  customerId: 'cust-aino',
  assetId: 'ebike-003',
  date: '2026-11-05',
  downPaymentCents: 0,
  termMonths: 36,
  actor: 'team-test',
  answers: {
    q_customer_type: 'consumer',
    q_full_name: 'Aino Virtanen',
    q_birth_date: '1997-04-12',
    q_email: 'aino@example.com',
    q_country: 'FI',
    q_employment: 'employed',
    q_monthly_income: 320_000,
    q_usage_purpose: 'commuting',
  },
};

async function createApprovedApplication() {
  const result = await createApplication(db, approvedSubmission);
  if (!result.ok) throw new Error(`expected approved application, got ${result.reason}`);
  return result.application;
}

describe('createContract', () => {
  it('creates an active contract with locked pricing and asset history', async () => {
    const application = await createApprovedApplication();

    const result = await createContract(db, {
      applicationId: application.id,
      signedOn: '2026-11-06',
      actor: 'team-test',
    });

    expect(result).toMatchObject({
      ok: true,
      contract: {
        applicationId: application.id,
        assetId: 'ebike-003',
        status: 'active',
        signedOn: '2026-11-06',
        startsOn: '2026-11-05',
        endsOn: '2029-11-05',
        termMonths: 36,
        monthlyNetRentCents: 10_730,
        buyoutCents: 58_350,
        pricingSnapshot: {
          pricing: {
            monthlyNetRentCents: 10_730,
            totalCostWithBuyoutCents: 444_630,
          },
        },
      },
    });

    if (!result.ok) throw new Error('expected contract');
    const row = await db.contract.findUniqueOrThrow({ where: { id: result.contract.id } });
    expect(row).toMatchObject({
      application_id: application.id,
      asset_id: 'ebike-003',
      status: 'active',
      signed_on: '2026-11-06',
      starts_on: '2026-11-05',
      ends_on: '2029-11-05',
      price_list_version: 1,
      coefficient_factor_ppm: 27_584,
      monthly_net_rent_cents: 10_730,
      buyout_cents: 58_350,
    });
    expect(JSON.parse(row.pricing_snapshot_json ?? '')).toMatchObject({
      sources: { priceListVersion: 1, coefficientTableVersion: 1 },
    });
    expect(await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } })).toMatchObject({
      status: 'reserved',
      first_leased_on: '2026-11-05',
      original_list_price_cents: 389_000,
    });
    expect(await db.assetHistory.findFirstOrThrow()).toMatchObject({
      asset_id: 'ebike-003',
      contract_id: row.id,
      event_type: 'lease_started',
      occurred_on: '2026-11-05',
      from_status: 'available',
      to_status: 'reserved',
      actor: 'team-test',
    });
    expect(
      await db.auditLog.findFirstOrThrow({ where: { action: 'contract.signed' } })
    ).toMatchObject({
      entity_type: 'contract',
      entity_id: row.id,
      actor: 'team-test',
    });
  });

  it('does not recalculate the application snapshot when signing', async () => {
    const application = await createApprovedApplication();
    await db.application.update({
      where: { id: application.id },
      data: { monthly_net_rent_cents: 99_999 },
    });

    const result = await createContract(db, {
      applicationId: application.id,
      signedOn: '2026-11-06',
      actor: 'team-test',
    });

    expect(result).toMatchObject({
      ok: true,
      contract: {
        monthlyNetRentCents: 10_730,
        pricingSnapshot: { pricing: { monthlyNetRentCents: 10_730 } },
      },
    });
  });

  it('rejects applications that are not approved without writes', async () => {
    const rejected = await createApplication(db, {
      ...approvedSubmission,
      customerId: 'cust-mikko',
      answers: {
        ...approvedSubmission.answers,
        q_birth_date: '2009-03-10',
        q_monthly_income: 40_000,
      },
    });
    if (!rejected.ok) throw new Error(`expected persisted rejection, got ${rejected.reason}`);

    await expect(
      createContract(db, {
        applicationId: rejected.application.id,
        signedOn: '2026-11-06',
        actor: 'team-test',
      })
    ).resolves.toEqual({ ok: false, reason: 'application_not_approved', status: 'rejected' });
    expect(await db.contract.count()).toBe(0);
    expect(await db.assetHistory.count()).toBe(0);
  });

  it('rejects missing applications', async () => {
    await expect(
      createContract(db, {
        applicationId: 'missing',
        signedOn: '2026-11-06',
        actor: 'team-test',
      })
    ).resolves.toEqual({ ok: false, reason: 'application_not_found' });
  });

  it('rejects a duplicate contract', async () => {
    const application = await createApprovedApplication();
    const input = { applicationId: application.id, signedOn: '2026-11-06', actor: 'team-test' };

    const first = await createContract(db, input);
    if (!first.ok) throw new Error(`expected first contract, got ${first.reason}`);
    await expect(createContract(db, input)).resolves.toEqual({
      ok: false,
      reason: 'contract_already_exists',
      contractId: first.contract.id,
    });
    expect(await db.contract.count()).toBe(1);
  });

  it('rejects an asset that became unavailable after application approval', async () => {
    const application = await createApprovedApplication();
    await db.asset.update({ where: { id: application.assetId }, data: { status: 'reserved' } });

    await expect(
      createContract(db, {
        applicationId: application.id,
        signedOn: '2026-11-06',
        actor: 'team-test',
      })
    ).resolves.toEqual({ ok: false, reason: 'asset_unavailable', status: 'reserved' });
    expect(await db.contract.count()).toBe(0);
    expect(await db.assetHistory.count()).toBe(0);
  });
});
