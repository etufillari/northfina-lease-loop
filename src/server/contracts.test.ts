// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../tests/helpers/test-db';
import { loadAssets } from '@/data/load';
import { listAuditLog } from './audit';
import { seedAssets } from './assets';
import { getContract, signLease, type LeaseDataPack } from './contracts';
import { loadLeaseDataPack } from './lease-data';
import type { PrismaClient } from './prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let data: LeaseDataPack;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  data = await loadLeaseDataPack();
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await db.contract.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
});

const ainoAnswers = {
  q_customer_type: 'consumer',
  q_full_name: 'Aino Virtanen',
  q_birth_date: '1997-04-12',
  q_email: 'aino.virtanen@example.com',
  q_country: 'FI',
  q_employment: 'employed',
  q_monthly_income: 320_000,
  q_usage_purpose: 'commuting',
};
const aino = {
  assetId: 'ebike-003',
  customerId: 'cust-aino',
  termMonths: 36,
  downPaymentCents: 0,
  answers: ainoAnswers,
  today: '2026-11-05',
  actor: 'cust-aino',
};

describe('signLease', () => {
  it('prices on the server, stores the frozen contract and reserves the asset (card 1)', async () => {
    const result = await signLease(db, data, aino);
    expect(result).toMatchObject({
      ok: true,
      contract: {
        assetId: 'ebike-003',
        customerId: 'cust-aino',
        signDate: '2026-11-05',
        startDate: '2026-11-05',
        priceListVersion: 1,
        monthlyNetRentCents: 10_730, // 389 000 × 0.027584, DATA.md worked example
        billing: 'start_day_full_months',
      },
    });
    if (!result.ok) return;

    expect(await getContract(db, result.id)).toEqual({ id: result.id, contract: result.contract });
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });
    expect(asset.status).toBe('reserved');
  });

  it('writes one audit row naming the new contract, in the same transaction', async () => {
    const result = await signLease(db, data, aino);
    if (!result.ok) throw new Error(result.reason);
    const log = await listAuditLog(db);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      actor: 'cust-aino',
      action: 'contract.signed',
      entity_type: 'contract',
      entity_id: String(result.id),
      details: { assetId: 'ebike-003', monthlyNetRentCents: 10_730, priceListVersion: 1 },
    });
  });

  it('refuses an asset that is not available, and changes nothing', async () => {
    // ebike-009 is reserved in the data pack.
    expect(await signLease(db, data, { ...aino, assetId: 'ebike-009' })).toEqual({
      ok: false,
      reason: 'asset_not_available',
    });
    expect(await db.contract.count()).toBe(0);
    expect(await listAuditLog(db)).toHaveLength(0);
  });

  it('cannot lease the same item twice', async () => {
    expect((await signLease(db, data, aino)).ok).toBe(true);
    expect(await signLease(db, data, { ...aino, customerId: 'cust-sanna' })).toEqual({
      ok: false,
      reason: 'asset_not_available',
    });
    expect(await db.contract.count()).toBe(1);
  });

  it('refuses unknown assets and customers', async () => {
    expect(await signLease(db, data, { ...aino, assetId: 'nope' })).toEqual({
      ok: false,
      reason: 'asset_not_found',
    });
    expect(await signLease(db, data, { ...aino, customerId: 'nobody' })).toEqual({
      ok: false,
      reason: 'unknown_customer',
    });
  });

  it('passes on pricing refusals, such as a down payment off the slider step', async () => {
    expect(await signLease(db, data, { ...aino, downPaymentCents: 1 })).toEqual({
      ok: false,
      reason: 'down_payment_off_step',
    });
  });
});

describe('signLease and the application', () => {
  it('signs only an approved application, deciding it again on the server', async () => {
    const { q_country: _country, ...incomplete } = ainoAnswers;
    expect(await signLease(db, data, { ...aino, answers: incomplete })).toEqual({
      ok: false,
      reason: 'application_incomplete',
    });
  });

  it('refuses a declined applicant (card 5: Mikko is 17)', async () => {
    const mikko = { ...ainoAnswers, q_birth_date: '2009-03-10', q_monthly_income: 40_000 };
    expect(
      await signLease(db, data, {
        ...aino,
        assetId: 'laptop-008',
        customerId: 'cust-mikko',
        answers: mikko,
      })
    ).toEqual({ ok: false, reason: 'application_declined' });
    expect(await db.contract.count()).toBe(0);
  });

  it('refuses to auto-sign an application that needs a person to review it', async () => {
    // PEP is only asked from 10 000 € financed: farm-008 is 12 900 € (1 290 000 cents).
    const pep = { ...ainoAnswers, q_pep: 'yes', q_pep_details: 'Member of parliament' };
    const { q_usage_purpose: _usage, ...answers } = pep;
    expect(
      await signLease(db, data, {
        ...aino,
        assetId: 'farm-008',
        answers: { ...answers, q_farm_registry: 'FR-1' },
      })
    ).toEqual({ ok: false, reason: 'application_needs_review' });
  });

  it('refuses an applicant who may not sign for their company (card 6)', async () => {
    const norvi = {
      q_customer_type: 'company',
      q_email: 'fleet@norvi.example.com',
      q_business_id: '3299871-7',
      q_company_name: 'Norvi Logistics Oy',
      q_can_sign: 'no',
      q_signatory_email: 'ceo@norvi.example.com',
      q_vat_registered: 'yes',
      q_usage_purpose: 'delivery',
    };
    expect(
      await signLease(db, data, {
        ...aino,
        assetId: 'ebike-004',
        customerId: 'cust-norvi',
        answers: norvi,
      })
    ).toEqual({ ok: false, reason: 'signatory_must_sign' });
  });

  it('names a new applicant (not a data-pack persona) by their email', async () => {
    const { customerId: _persona, ...anonymous } = aino;
    const result = await signLease(db, data, anonymous);
    expect(result).toMatchObject({
      ok: true,
      contract: { customerId: 'email:aino.virtanen@example.com' },
    });
  });
});

describe('getContract', () => {
  it('returns null for an id that does not exist', async () => {
    expect(await getContract(db, 999_999)).toBeNull();
  });
});
