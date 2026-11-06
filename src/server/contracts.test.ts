// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { submitApplication, type SubmitApplicationInput } from './applications';
import { seedAssets } from './assets';
import { getContract, listContracts, signContract } from './contracts';
import { returnContract } from './end-of-term';
import { payAllDue } from './invoices';
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
  await db.contract.deleteMany();
  await db.application.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
});

const approvedAnswers = {
  q_customer_type: 'consumer',
  q_full_name: 'Aino Virtanen',
  q_birth_date: '1997-04-12',
  q_email: 'aino.virtanen@example.com',
  q_country: 'FI',
  q_employment: 'employed',
  q_monthly_income: '3200',
};

async function apply(input: Partial<SubmitApplicationInput>, quoteDate: string) {
  const result = await submitApplication(
    db,
    {
      assetId: 'laptop-004',
      termMonths: 36,
      downPaymentCents: 0,
      answers: approvedAnswers,
      ...input,
    },
    quoteDate
  );
  if (!result.ok) throw new Error(result.reason);
  return result.application;
}

describe('signContract', () => {
  it('card 2: locks Thursday’s price list 1 price when signed on Friday under list 2', async () => {
    // laptop-004 costs 349000 on list 1 and 321100 (−8 %) on list 2
    const application = await apply({}, '2026-11-05');
    const result = await signContract(
      db,
      { applicationId: application.id, signerName: 'Aino Virtanen' },
      '2026-11-06'
    );
    expect(result).toMatchObject({
      ok: true,
      contract: {
        assetId: 'laptop-004',
        signedDate: '2026-11-06',
        startDate: '2026-11-06',
        endDate: '2029-11-05',
        quoteDate: '2026-11-05',
        priceListVersion: 1,
        listPriceCents: 349_000,
        monthlyNetCents: 9_627, // 349000 × 0.027584 = 9626.8 → 9627, not list 2's 8857
        buyoutCents: 52_350, // 15 % of 349000
        customerName: 'Aino Virtanen',
        customerEmail: 'aino.virtanen@example.com',
        status: 'active',
      },
    });
  });

  it('takes the item and writes the audit row in the same transaction', async () => {
    const application = await apply({}, '2026-11-05');
    const result = await signContract(
      db,
      { applicationId: application.id, signerName: 'Aino Virtanen' },
      '2026-11-05'
    );
    if (!result.ok) throw new Error(result.reason);

    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'laptop-004' } });
    expect(asset.status).toBe('leased');
    const audit = await db.auditLog.findMany({ where: { action: 'contract.signed' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ entity_type: 'contract', entity_id: result.contract.id });
    expect(await getContract(db, result.contract.id)).toEqual(result.contract);
  });

  it('signs an application only once', async () => {
    const application = await apply({}, '2026-11-05');
    const first = await signContract(
      db,
      { applicationId: application.id, signerName: 'Aino' },
      '2026-11-05'
    );
    const second = await signContract(
      db,
      { applicationId: application.id, signerName: 'Aino' },
      '2026-11-05'
    );
    expect(second).toEqual({
      ok: false,
      reason: 'already_signed',
      contractId: first.ok ? first.contract.id : undefined,
    });
  });

  it('refuses a second contract for an item someone else has signed for', async () => {
    const first = await apply({}, '2026-11-05');
    const second = await apply({}, '2026-11-05');
    await signContract(db, { applicationId: first.id, signerName: 'Aino' }, '2026-11-05');
    expect(
      await signContract(db, { applicationId: second.id, signerName: 'Lena' }, '2026-11-05')
    ).toEqual({ ok: false, reason: 'asset_not_available' });
    expect(await db.contract.count()).toBe(1);
    expect(await db.auditLog.count({ where: { action: 'contract.signed' } })).toBe(1);
  });

  it('refuses an application that needs a person to check it', async () => {
    const application = await apply(
      {
        assetId: 'ebike-004',
        answers: {
          q_customer_type: 'company',
          q_business_id: '3299871-7',
          q_company_name: 'Norvi Logistics Oy',
          q_email: 'fleet@norvi.example.com',
          q_can_sign: 'no',
          q_signatory_email: 'ceo@norvi.example.com',
          q_vat_registered: 'yes',
          q_usage_purpose: 'delivery',
        },
      },
      '2026-11-05'
    );
    expect(application.decision).toBe('manual_review');
    expect(
      await signContract(db, { applicationId: application.id, signerName: 'Fleet' }, '2026-11-05')
    ).toEqual({ ok: false, reason: 'not_approved' });
  });

  it('refuses a quote older than 14 days', async () => {
    const application = await apply({}, '2026-11-05');
    expect(
      await signContract(db, { applicationId: application.id, signerName: 'Aino' }, '2026-11-20')
    ).toEqual({ ok: false, reason: 'quote_expired' });
  });

  it('refuses an unknown application', async () => {
    expect(
      await signContract(db, { applicationId: 'nope', signerName: 'Aino' }, '2026-11-05')
    ).toEqual({ ok: false, reason: 'application_not_found' });
  });
});

describe('returnContract', () => {
  async function signed(signDate = '2026-11-05') {
    const application = await apply({ termMonths: 12 }, signDate);
    const result = await signContract(
      db,
      { applicationId: application.id, signerName: 'Aino Virtanen' },
      signDate
    );
    if (!result.ok) throw new Error(result.reason);
    // Settle the lease so it can be ended: every invoice up to the end is paid.
    await payAllDue(
      db,
      { contractId: result.contract.id, filter: null, actor: 'Aino' },
      '2027-11-05'
    );
    return result.contract; // 12 months from 5 Nov 2026: last day 4 Nov 2027
  }

  it('returns the item after the last day and starts its next life', async () => {
    const contract = await signed();
    const before = await db.asset.findUniqueOrThrow({ where: { id: 'laptop-004' } });
    const result = await returnContract(
      db,
      { contractId: contract.id, actor: 'Aino Virtanen' },
      '2027-11-05'
    );
    expect(result).toMatchObject({
      ok: true,
      contract: { status: 'returned', returnedDate: '2027-11-05' },
    });

    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'laptop-004' } });
    expect(asset.status).toBe('returned');
    expect(asset.previous_lives).toBe(before.previous_lives + 1);
    expect(await db.auditLog.count({ where: { action: 'contract.returned' } })).toBe(1);
  });

  it('refuses to return before the lease has ended, even on its last day', async () => {
    const contract = await signed();
    expect(
      await returnContract(db, { contractId: contract.id, actor: 'Aino' }, '2027-11-04')
    ).toEqual({ ok: false, reason: 'not_ended' });
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'laptop-004' } });
    expect(asset.status).toBe('leased');
  });

  it('returns a contract only once', async () => {
    const contract = await signed();
    await returnContract(db, { contractId: contract.id, actor: 'Aino' }, '2027-11-05');
    expect(
      await returnContract(db, { contractId: contract.id, actor: 'Aino' }, '2027-12-01')
    ).toEqual({ ok: false, reason: 'already_decided' });
  });

  it('refuses an unknown contract', async () => {
    expect(await returnContract(db, { contractId: 'nope', actor: 'Aino' }, '2027-11-05')).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });
});

describe('listContracts', () => {
  it('lists every contract', async () => {
    const application = await apply({}, '2026-11-05');
    await signContract(db, { applicationId: application.id, signerName: 'Aino' }, '2026-11-05');
    expect((await listContracts(db)).map((c) => c.assetId)).toEqual(['laptop-004']);
  });
});

describe('contracts per customer', () => {
  it('carries the customer from the application to the contract, and filters by it', async () => {
    const ainos = await apply({ customerId: 'cust-aino' }, '2026-11-05');
    const guests = await apply({ assetId: 'laptop-001' }, '2026-11-05');
    await signContract(db, { applicationId: ainos.id, signerName: 'Aino' }, '2026-11-05');
    await signContract(db, { applicationId: guests.id, signerName: 'Guest' }, '2026-11-05');

    const all = await listContracts(db);
    expect(all.map((c) => c.customerId).sort()).toEqual(['cust-aino', null].sort());
    expect((await listContracts(db, { customerId: 'cust-aino' })).map((c) => c.assetId)).toEqual([
      'laptop-004',
    ]);
    expect((await listContracts(db, { customerId: null })).map((c) => c.assetId)).toEqual([
      'laptop-001',
    ]);
    expect(await listContracts(db, { customerId: 'cust-mikko' })).toEqual([]);
  });
});
