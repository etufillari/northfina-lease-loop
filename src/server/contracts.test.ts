// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { relistAsset, resolveAssetEndOfTerm, seedAssets } from './assets';
import { findPersistedContract, signContract, subtractOneDayIso } from './contracts';
import { executeEarlyExit } from './early-exit';
import type { PrismaClient } from './prisma-client';
import { reserveAsset } from './reservations';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await db.assetEvent.deleteMany();
  await db.invoiceRow.deleteMany();
  await db.contract.deleteMany();
  await db.application.deleteMany();
  await db.quote.deleteMany();
  await db.assetReservation.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
});

describe('subtractOneDayIso', () => {
  it('subtracts one calendar day across month and year boundaries', () => {
    expect(subtractOneDayIso('2026-12-05')).toBe('2026-12-04');
    expect(subtractOneDayIso('2027-01-01')).toBe('2026-12-31');
    expect(subtractOneDayIso('2028-03-01')).toBe('2028-02-29');
  });
});

const AINO_EBIKE_ANSWERS = {
  q_customer_type: 'consumer',
  q_full_name: 'Aino Virtanen',
  q_email: 'aino@example.com',
  q_usage_purpose: 'commuting',
  q_birth_date: '1991-06-18',
  q_country: 'FI',
  q_employment: 'employed',
  q_monthly_income: 310_000,
};

const HAAPALA_COMPANY_ANSWERS = {
  q_customer_type: 'company',
  q_company_name: 'Haapalan Tila Oy',
  q_business_id: '2876543-5',
  q_vat_registered: 'yes',
  q_country: 'FI',
  q_email: 'office@haapala.example.com',
  q_annual_revenue: 95_000_000,
  q_beneficial_owners: 'Jussi Haapala (60 %)',
  q_can_sign: 'yes',
  q_farm_registry: 'yes',
  q_pep: 'no',
};

describe('signContract and findPersistedContract', () => {
  it('persists Quote, Application, Contract, InvoiceRow[], AssetEvent, and sets Asset to leased (Card 1)', async () => {
    const reserved = await reserveAsset(db, {
      assetId: 'ebike-003',
      actor: 'aino@example.com',
      now: new Date('2026-11-05T10:00:00Z'),
    });
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;

    const signed = await signContract(db, {
      assetId: 'ebike-003',
      actor: 'aino@example.com',
      termMonths: 36,
      downPaymentCents: 0,
      signedOn: '2026-11-05',
      token: reserved.reservation.token,
      answers: {
        ...AINO_EBIKE_ANSWERS,
        q_pep: 'no', // pruned for consumer on ebike-003
      },
    });

    expect(signed).toMatchObject({
      ok: true,
      asset: {
        id: 'ebike-003',
        status: 'leased',
        first_lease_date: '2026-11-05',
        first_list_price_cents: 389_000,
      },
    });
    if (!signed.ok) return;

    const quote = await db.quote.findUniqueOrThrow({ where: { id: signed.quoteId } });
    expect(quote).toMatchObject({
      asset_id: 'ebike-003',
      price_list_version: 1,
      list_price_cents: 389_000,
      monthly_net_rent_cents: 10_730,
      buyout_net_cents: 58_350,
    });

    const application = await db.application.findUniqueOrThrow({
      where: { id: signed.applicationId },
    });
    expect(application.status).toBe('signed');
    expect(application.decision).toBe('yes');
    expect(JSON.parse(application.answers_json)).toEqual(AINO_EBIKE_ANSWERS);

    const contract = await db.contract.findUniqueOrThrow({ where: { id: signed.contractId } });
    expect(contract).toMatchObject({
      status: 'active',
      total_net_cents: 386_280,
      total_gross_cents: 486_612,
    });

    const rows = await db.invoiceRow.findMany({
      where: { contract_id: signed.contractId },
      orderBy: { seq: 'asc' },
    });
    expect(rows).toHaveLength(36);
    expect(rows[0]).toMatchObject({
      seq: 0,
      kind: 'rent',
      invoice_date: '2026-11-05',
      period_start: '2026-11-05',
      period_end: '2026-12-04',
      net_cents: 10_730,
      vat_rate_bp: 2550,
      vat_cents: 2736,
      gross_cents: 13_466,
    });
    expect(rows[2]).toMatchObject({
      seq: 2,
      kind: 'rent',
      invoice_date: '2027-01-05',
      vat_rate_bp: 2600,
      vat_cents: 2790,
      gross_cents: 13_520,
    });

    const loaded = await findPersistedContract(db, {
      contractId: signed.contractId,
      assetId: 'ebike-003',
      termMonths: 36,
      downPaymentCents: 0,
    });
    expect(loaded?.quote.monthlyNetRentCents).toBe(10_730);
    expect(loaded?.schedule.totalGrossCents).toBe(486_612);
    expect(loaded?.schedule.invoices[2]?.grossTotalCents).toBe(13_520);
  });

  it('includes a down_payment InvoiceRow at seq 0 when downPaymentCents > 0', async () => {
    const signed = await signContract(db, {
      assetId: 'farm-002',
      actor: 'haapala@example.com',
      termMonths: 48,
      downPaymentCents: 2_000_000,
      signedOn: '2026-11-05',
      answers: HAAPALA_COMPANY_ANSWERS,
    });
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;

    const rows = await db.invoiceRow.findMany({
      where: { contract_id: signed.contractId },
      orderBy: { seq: 'asc' },
    });
    expect(rows).toHaveLength(49);
    expect(rows[0]).toMatchObject({
      seq: 0,
      kind: 'down_payment',
      net_cents: 2_000_000,
    });
    expect(rows[1]).toMatchObject({
      seq: 1,
      kind: 'rent',
    });
  });

  it('updates Contract, cancels unbilled InvoiceRows, and writes exit row on early exit', async () => {
    const signed = await signContract(db, {
      assetId: 'ebike-003',
      actor: 'cust-aino',
      termMonths: 36,
      downPaymentCents: 0,
      signedOn: '2026-11-05',
      answers: AINO_EBIKE_ANSWERS,
    });
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;

    const exitRes = await executeEarlyExit(db, {
      assetId: 'ebike-003',
      choice: 'return',
      termMonths: 36,
      downPaymentCents: 0,
      signedOn: '2026-11-05',
      exitMonth: 7,
      inspection: { condition: 'good', usageValue: 0, inspectedBy: 'Workshop Vantaa' },
      actor: 'cust-aino',
    });
    expect(exitRes.ok).toBe(true);

    const contract = await db.contract.findUniqueOrThrow({ where: { id: signed.contractId } });
    expect(contract).toMatchObject({
      status: 'exited',
      closed_on: '2027-05-05',
    });

    const cancelledCount = await db.invoiceRow.count({
      where: { contract_id: signed.contractId, cancelled_by_exit: true },
    });
    expect(cancelledCount).toBe(29);

    const closingRow = await db.invoiceRow.findFirstOrThrow({
      where: { contract_id: signed.contractId, kind: 'exit_return' },
    });
    expect(closingRow).toMatchObject({
      invoice_date: '2027-05-05',
      net_cents: 70_646,
    });
  });

  it('completes a full Spine loop: sign → end-of-term return → relist → second lease', async () => {
    const firstLease = await signContract(db, {
      assetId: 'ebike-003',
      actor: 'cust-aino',
      termMonths: 36,
      downPaymentCents: 0,
      signedOn: '2026-11-05',
      answers: AINO_EBIKE_ANSWERS,
    });
    expect(firstLease.ok).toBe(true);
    if (!firstLease.ok) return;

    const returned = await resolveAssetEndOfTerm(db, {
      id: 'ebike-003',
      action: 'pass_on',
      actor: 'cust-aino',
    });
    expect(returned).toMatchObject({
      ok: true,
      asset: { id: 'ebike-003', status: 'returned', previous_lives: 1 },
    });

    const endedContract = await db.contract.findUniqueOrThrow({
      where: { id: firstLease.contractId },
    });
    expect(endedContract.status).toBe('ended');

    const relisted = await relistAsset(db, {
      id: 'ebike-003',
      actor: 'dealer',
      asOf: '2029-11-05',
    });
    expect(relisted.ok).toBe(true);
    if (!relisted.ok) return;
    expect(relisted.asset.status).toBe('available');
    expect(relisted.asset.relist_price_cents).toBeGreaterThan(0);

    const secondLease = await signContract(db, {
      assetId: 'ebike-003',
      actor: 'cust-second',
      termMonths: 12,
      downPaymentCents: 0,
      signedOn: '2029-11-05',
      answers: AINO_EBIKE_ANSWERS,
    });
    expect(secondLease.ok).toBe(true);
    if (!secondLease.ok) return;

    const secondContract = await db.contract.findUniqueOrThrow({
      where: { id: secondLease.contractId },
    });
    expect(secondContract.price_list_version).toBeNull();
    expect(secondContract.list_price_cents).toBe(relisted.asset.relist_price_cents);

    const events = await db.assetEvent.findMany({
      where: { asset_id: 'ebike-003' },
      orderBy: { id: 'asc' },
    });
    expect(events.map((e) => e.to_status)).toEqual(['leased', 'returned', 'available', 'leased']);
  });

  it('rejects reservation conflicts, unavailable assets, and invalid terms', async () => {
    expect(
      await signContract(db, {
        assetId: 'nope',
        actor: 'x',
        termMonths: 36,
        downPaymentCents: 0,
      })
    ).toEqual({ ok: false, reason: 'not_found' });

    expect(
      await signContract(db, {
        assetId: 'ebike-009', // seeded as reserved
        actor: 'x',
        termMonths: 36,
        downPaymentCents: 0,
      })
    ).toEqual({ ok: false, reason: 'asset_not_available' });

    expect(
      await signContract(db, {
        assetId: 'ebike-003',
        actor: 'x',
        termMonths: 36,
        downPaymentCents: 0,
        token: 'non-existent-token',
      })
    ).toEqual({ ok: false, reason: 'reservation_conflict' });

    expect(
      await signContract(db, {
        assetId: 'ebike-003',
        actor: 'x',
        termMonths: 13,
        downPaymentCents: 0,
      })
    ).toEqual({ ok: false, reason: 'invalid_contract' });
  });

  it('refuses signing when answers are missing, rejected, or require manual review without storing a fake approval', async () => {
    // Missing answers (incomplete)
    expect(
      await signContract(db, {
        assetId: 'ebike-003',
        actor: 'x',
        termMonths: 12,
        downPaymentCents: 0,
        signedOn: '2026-11-06',
      })
    ).toEqual({ ok: false, reason: 'application_not_approved' });

    // Underage applicant (hard no)
    expect(
      await signContract(db, {
        assetId: 'ebike-003',
        actor: 'mikko',
        termMonths: 12,
        downPaymentCents: 0,
        signedOn: '2026-11-06',
        answers: {
          ...AINO_EBIKE_ANSWERS,
          q_birth_date: '2009-03-10',
        },
      })
    ).toEqual({ ok: false, reason: 'application_not_approved' });

    // PEP applicant (manual review)
    expect(
      await signContract(db, {
        assetId: 'farm-002',
        actor: 'haapala',
        termMonths: 48,
        downPaymentCents: 2_000_000,
        signedOn: '2026-11-05',
        answers: {
          ...HAAPALA_COMPANY_ANSWERS,
          q_pep: 'yes',
          q_pep_details: 'Municipal board member',
        },
      })
    ).toEqual({ ok: false, reason: 'application_in_review' });

    expect(await db.application.count()).toBe(0);
    expect(await db.contract.count()).toBe(0);
  });
});
