// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import type { Answers } from '@/data/lease-schemas';
import type { Asset, Customer } from '@/data/schemas';
import {
  ainoEbikeAnswers,
  haapalaFarmAnswers,
  norviEbikeAnswers,
} from '../../../tests/helpers/applicants';
import { createTestDb } from '../../../tests/helpers/test-db';
import { reviewApplication, submitApplication } from '../application/applications';
import { seedAssets } from '../assets/assets';
import { setDemoDate } from '../date/app-date';
import type { PrismaClient } from '../prisma-client';
import {
  contractViews,
  getContract,
  listContracts,
  previewContract,
  signContract,
} from './contracts';
import { listInvoices } from '../invoicing/invoices';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let customers: Customer[];
let assets: Asset[];

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  [customers, assets] = await Promise.all([loadCustomers(), loadAssets()]);
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await db.auditLog.deleteMany();
  await db.assetLife.deleteMany();
  await db.invoice.deleteMany();
  await db.contract.deleteMany();
  await db.application.deleteMany();
  await db.asset.deleteMany();
  await db.appSetting.deleteMany();
  await seedAssets(db, assets);
  await setDemoDate(db, { date: '2026-11-05', actor: 'test' });
  await db.auditLog.deleteMany();
});

function customer(id: string): Customer {
  const found = customers.find((c) => c.id === id);
  if (!found) throw new Error(`no customer ${id}`);
  return found;
}

const AINO = 'cust-aino';

async function apply(
  customerId: string,
  assetId: string,
  answers: Answers,
  deal: { termMonths?: number; downPaymentCents?: number } = {}
) {
  const result = await submitApplication(db, {
    customer: customer(customerId),
    assetId,
    termMonths: deal.termMonths ?? 36,
    downPaymentCents: deal.downPaymentCents ?? 0,
    answers,
  });
  if (!result.ok) throw new Error(`application failed: ${result.reason}`);
  return result.application;
}

const sign = (applicationId: string, customerId = AINO) =>
  signContract(db, { applicationId, customer: customer(customerId) });

async function signOk(applicationId: string, customerId = AINO) {
  const result = await sign(applicationId, customerId);
  if (!result.ok) throw new Error(`signing failed: ${result.reason}`);
  return result.contract;
}

async function assetStatus(id: string) {
  return (await db.asset.findUniqueOrThrow({ where: { id } })).status;
}

describe('previewContract', () => {
  const preview = (applicationId: string, customerId = AINO) =>
    previewContract(db, { applicationId, customer: customer(customerId) });

  async function previewOk(applicationId: string, customerId = AINO) {
    const result = await preview(applicationId, customerId);
    if (!result.ok) throw new Error(`preview failed: ${result.reason}`);
    return result.preview;
  }

  it('shows exactly what signing then creates', async () => {
    const application = await apply(AINO, 'ebike-003', ainoEbikeAnswers, {
      downPaymentCents: 50_000,
    });
    const before = await previewOk(application.id);
    const signed = await signOk(application.id);
    const invoices = await listInvoices(db, { contractId: signed.id });

    expect(signed).toMatchObject({
      monthly_net_rent_cents: before.monthly_net_rent_cents,
      buyout_cents: before.buyout_cents,
      signed_on: before.signed_on,
      start_on: before.start_on,
      planned_end_on: before.planned_end_on,
      band: before.band,
      list_price_on_signing_cents: before.list_price_on_signing_cents,
    });
    expect(before.invoices).toHaveLength(invoices.length);
    before.invoices.forEach((invoice, i) => {
      expect(invoices[i]).toMatchObject(invoice);
    });
  });

  it('saves nothing and leaves the asset free', async () => {
    const application = await apply(AINO, 'ebike-003', ainoEbikeAnswers);
    await db.auditLog.deleteMany();
    await previewOk(application.id);

    expect(await db.contract.count()).toBe(0);
    expect(await db.invoice.count()).toBe(0);
    expect(await db.assetLife.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
    expect(await assetStatus('ebike-003')).toBe('available');
  });

  it('shows the first invoices of card 1, with the VAT change', async () => {
    const application = await apply(AINO, 'ebike-003', ainoEbikeAnswers);
    const { invoices, calculated_on } = await previewOk(application.id);

    expect(calculated_on).toBe('2026-11-05');
    expect(invoices).toHaveLength(36);
    expect(invoices.slice(0, 3).map((i) => i.total_cents)).toEqual([13_466, 13_466, 13_520]);
    expect(invoices[2]).toMatchObject({ vat_rate_percent: 26, kind: 'rent' });
    expect(invoices[2]?.vat_change?.total_change_cents).toBe(54);
  });

  it('names the item in words', async () => {
    const application = await apply(AINO, 'ebike-003', ainoEbikeAnswers);
    const asset = assets.find(({ id }) => id === 'ebike-003');

    expect((await previewOk(application.id)).asset_name).toBe(`${asset?.make} ${asset?.model}`);
  });

  it('warns about the VAT change and gives the real total before signing', async () => {
    const application = await apply(AINO, 'ebike-003', ainoEbikeAnswers);

    expect(await previewOk(application.id)).toMatchObject({
      upcoming_vat_change: { effective_on: '2027-01-01', monthly_total_cents: 13_520 },
      total_net_cents: 386_280,
      total_vat_cents: 100_332,
      total_cents: 486_612,
    });
  });

  it('gives the same totals on the signed contract as on the preview', async () => {
    const application = await apply(AINO, 'ebike-003', ainoEbikeAnswers);
    const { total_net_cents, total_vat_cents, total_cents } = await previewOk(application.id);

    const signed = await signContract(db, {
      applicationId: application.id,
      customer: customer(AINO),
    });

    expect(signed).toMatchObject({
      ok: true,
      contract: { total_net_cents, total_vat_cents, total_cents },
    });
  });

  it('keeps the totals of two contracts apart', async () => {
    const first = await apply(AINO, 'ebike-003', ainoEbikeAnswers);
    const second = await apply(AINO, 'laptop-004', ainoEbikeAnswers);
    const expected = await previewOk(second.id);
    await signContract(db, { applicationId: first.id, customer: customer(AINO) });
    await signContract(db, { applicationId: second.id, customer: customer(AINO) });

    const views = await contractViews(db, await listContracts(db));
    const totalOf = (applicationId: string) =>
      views.find((view) => view.application_id === applicationId)?.total_cents;

    expect(totalOf(first.id)).toBe(486_612);
    expect(totalOf(second.id)).toBe(expected.total_cents);
  });

  it('keeps the quoted price and compares it with the list on the day (card 2)', async () => {
    const application = await apply(AINO, 'laptop-004', ainoEbikeAnswers);
    await setDemoDate(db, { date: '2026-11-06', actor: 'test' });

    expect(await previewOk(application.id)).toMatchObject({
      quote_date: '2026-11-05',
      calculated_on: '2026-11-06',
      base_price_cents: 349_000,
      monthly_net_rent_cents: 9_627,
      list_price_on_signing_cents: 321_100,
      can_sign: true,
    });
  });

  it('lets a company applicant read the terms, and says they cannot sign (card 6)', async () => {
    const application = await apply('cust-norvi', 'ebike-004', norviEbikeAnswers);
    expect(await previewOk(application.id, 'cust-norvi')).toMatchObject({
      can_sign: false,
      signatory_email: 'ceo@norvi.example.com',
    });
  });

  it("treats someone else's application as not found", async () => {
    const application = await apply(AINO, 'ebike-003', ainoEbikeAnswers);
    expect(await preview(application.id, 'cust-lena')).toEqual({
      ok: false,
      reason: 'application_not_found',
    });
    expect(await preview('app-nope')).toEqual({ ok: false, reason: 'application_not_found' });
  });

  it('refuses an application that is not approved', async () => {
    const application = await apply(AINO, 'farm-006', {});
    expect(await preview(application.id)).toEqual({ ok: false, reason: 'not_approved' });
  });

  it('refuses after signing, and when the item has gone', async () => {
    const first = await apply(AINO, 'ebike-003', ainoEbikeAnswers);
    const second = await apply(AINO, 'ebike-003', ainoEbikeAnswers);
    await signOk(first.id);

    expect(await preview(first.id)).toEqual({ ok: false, reason: 'already_signed' });
    expect(await preview(second.id)).toEqual({ ok: false, reason: 'asset_not_available' });
  });
});

describe('signContract: card 1', () => {
  it('locks the price and dates from the application', async () => {
    const application = await apply(AINO, 'ebike-003', ainoEbikeAnswers);
    expect(await signOk(application.id)).toMatchObject({
      application_id: application.id,
      customer_id: AINO,
      asset_id: 'ebike-003',
      status: 'active',
      quote_date: '2026-11-05',
      signed_on: '2026-11-05',
      start_on: '2026-11-05',
      planned_end_on: '2029-11-04',
      actual_end_on: null,
      price_list_version: 1,
      base_price_cents: 389_000,
      band: 'B',
      factor_micros: 27_584,
      monthly_net_rent_cents: 10_730,
      buyout_cents: 58_350,
      list_price_on_signing_cents: 389_000,
    });
  });

  it('marks the asset leased', async () => {
    const application = await apply(AINO, 'ebike-003', ainoEbikeAnswers);
    await signOk(application.id);
    expect(await assetStatus('ebike-003')).toBe('leased');
  });

  it('opens the first life of the asset', async () => {
    const application = await apply(AINO, 'ebike-003', ainoEbikeAnswers);
    const contract = await signOk(application.id);
    expect(await db.assetLife.findMany()).toMatchObject([
      {
        asset_id: 'ebike-003',
        life_number: 1,
        contract_id: contract.id,
        first_lease_price_cents: 389_000,
        started_on: '2026-11-05',
        outcome: null,
        start_condition: 'new',
        start_usage_value: 0,
      },
    ]);
  });

  it('writes one audit row', async () => {
    const application = await apply(AINO, 'ebike-003', ainoEbikeAnswers);
    await db.auditLog.deleteMany();
    const contract = await signOk(application.id);

    const rows = await db.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor: AINO,
      action: 'contract.signed',
      entity_type: 'contract',
      entity_id: contract.id,
    });
    expect(JSON.parse(rows[0]?.details_json ?? '')).toMatchObject({
      application_id: application.id,
      monthly_net_rent_cents: 10_730,
      asset_status: { from: 'available', to: 'leased' },
      life_number: 1,
      invoice_count: 36,
    });
  });

  it('records the real life number for a used item', async () => {
    const application = await apply(AINO, 'ebike-005', ainoEbikeAnswers);
    await db.auditLog.deleteMany();
    await signOk(application.id);

    const row = await db.auditLog.findFirstOrThrow();
    expect(JSON.parse(row.details_json ?? '')).toMatchObject({ life_number: 2 });
  });
});

describe('signContract: the quote always wins (card 2)', () => {
  it('keeps the quoted price after the list gets cheaper', async () => {
    const application = await apply(AINO, 'laptop-004', ainoEbikeAnswers);
    await setDemoDate(db, { date: '2026-11-06', actor: 'test' });

    expect(await signOk(application.id)).toMatchObject({
      quote_date: '2026-11-05',
      signed_on: '2026-11-06',
      start_on: '2026-11-06',
      planned_end_on: '2029-11-05',
      price_list_version: 1,
      base_price_cents: 349_000,
      monthly_net_rent_cents: 9_627,
      list_price_on_signing_cents: 321_100,
    });
  });

  it('keeps the quoted price after the list gets dearer', async () => {
    const application = await apply(AINO, 'ebike-003', ainoEbikeAnswers);
    await setDemoDate(db, { date: '2026-11-06', actor: 'test' });

    expect(await signOk(application.id)).toMatchObject({
      base_price_cents: 389_000,
      monthly_net_rent_cents: 10_730,
      list_price_on_signing_cents: 408_400,
    });
  });
});

describe('signContract: who may sign', () => {
  it('reports an application that does not exist', async () => {
    expect(await sign('app-nope')).toEqual({ ok: false, reason: 'application_not_found' });
  });

  it("treats someone else's application as not found", async () => {
    const application = await apply(AINO, 'ebike-003', ainoEbikeAnswers);
    expect(await sign(application.id, 'cust-lena')).toEqual({
      ok: false,
      reason: 'application_not_found',
    });
    expect(await assetStatus('ebike-003')).toBe('available');
  });

  it('refuses a rejected application', async () => {
    const application = await apply(AINO, 'farm-006', {});
    expect(application.decision).toBe('rejected');
    expect(await sign(application.id)).toEqual({ ok: false, reason: 'not_approved' });
  });

  const haapalaDeal = { termMonths: 48, downPaymentCents: 2_000_000 };

  it('refuses a manual review until a person approves it (card 7)', async () => {
    const application = await apply('cust-haapala', 'farm-002', haapalaFarmAnswers, haapalaDeal);
    expect(await sign(application.id, 'cust-haapala')).toEqual({
      ok: false,
      reason: 'not_approved',
    });

    await reviewApplication(db, {
      id: application.id,
      decision: 'approved',
      actor: 'staff-admin',
    });
    expect(await signOk(application.id, 'cust-haapala')).toMatchObject({
      financed_cents: 12_500_000,
      band: 'D',
    });
  });

  it('refuses a manual review that a person rejected', async () => {
    const application = await apply('cust-haapala', 'farm-002', haapalaFarmAnswers, haapalaDeal);
    await reviewApplication(db, {
      id: application.id,
      decision: 'rejected',
      actor: 'staff-admin',
    });
    expect(await sign(application.id, 'cust-haapala')).toEqual({
      ok: false,
      reason: 'not_approved',
    });
  });

  it('stops Norvi and says who must sign (card 6)', async () => {
    const application = await apply('cust-norvi', 'ebike-004', norviEbikeAnswers);
    expect(await sign(application.id, 'cust-norvi')).toEqual({
      ok: false,
      reason: 'signatory_required',
      signatory_email: 'ceo@norvi.example.com',
    });
    expect(await assetStatus('ebike-004')).toBe('available');
  });

  it('stops Norvi even if they answer yes, with no signatory to name', async () => {
    const answers: Answers = { ...norviEbikeAnswers, q_can_sign: 'yes' };
    const application = await apply('cust-norvi', 'ebike-004', answers);
    expect(await sign(application.id, 'cust-norvi')).toEqual({
      ok: false,
      reason: 'signatory_required',
      signatory_email: null,
    });
  });
});

describe('signContract: one item, one contract', () => {
  it('refuses to sign the same application twice', async () => {
    const application = await apply(AINO, 'ebike-003', ainoEbikeAnswers);
    await signOk(application.id);
    expect(await sign(application.id)).toEqual({ ok: false, reason: 'already_signed' });
    expect(await db.contract.count()).toBe(1);
    expect(await db.assetLife.count()).toBe(1);
  });

  it('stops a second application for the same asset (a double click)', async () => {
    const first = await apply(AINO, 'ebike-003', ainoEbikeAnswers);
    const second = await apply(AINO, 'ebike-003', ainoEbikeAnswers);
    await signOk(first.id);
    await db.auditLog.deleteMany();

    expect(await sign(second.id)).toEqual({ ok: false, reason: 'asset_not_available' });
    expect(await db.contract.count()).toBe(1);
    expect(await db.auditLog.count()).toBe(0);
  });

  it('lets only one of two simultaneous signings through', async () => {
    const first = await apply(AINO, 'ebike-003', ainoEbikeAnswers);
    const second = await apply(AINO, 'ebike-003', ainoEbikeAnswers);

    const results = await Promise.all([sign(first.id), sign(second.id)]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await db.contract.count()).toBe(1);
    expect(await db.invoice.count()).toBe(36);
    expect(await db.assetLife.count()).toBe(1);
  });

  it('changes nothing if the asset was taken after the application', async () => {
    const application = await apply(AINO, 'ebike-003', ainoEbikeAnswers);
    await db.asset.update({ where: { id: 'ebike-003' }, data: { status: 'reserved' } });

    expect(await sign(application.id)).toEqual({ ok: false, reason: 'asset_not_available' });
    expect(await db.contract.count()).toBe(0);
    expect(await db.invoice.count()).toBe(0);
    expect(await db.assetLife.count()).toBe(0);
    expect(await assetStatus('ebike-003')).toBe('reserved');
  });
});

describe('signContract: asset lives', () => {
  it('numbers on from previous lives for a used item', async () => {
    const application = await apply(AINO, 'ebike-005', ainoEbikeAnswers);
    await signOk(application.id);
    expect(await db.assetLife.findMany()).toMatchObject([
      { asset_id: 'ebike-005', life_number: 2, first_lease_price_cents: 159_000 },
    ]);
  });
});

describe('a signed contract never changes with the price list', () => {
  const locked = {
    price_list_version: 1,
    base_price_cents: 389_000,
    financed_cents: 389_000,
    monthly_net_rent_cents: 10_730,
    buyout_cents: 58_350,
    signed_on: '2026-11-05',
    start_on: '2026-11-05',
    planned_end_on: '2029-11-04',
  };

  it('reads back the same price and dates after a new price list starts', async () => {
    const signed = await signOk((await apply(AINO, 'ebike-003', ainoEbikeAnswers)).id);
    await setDemoDate(db, { date: '2026-11-06', actor: 'test' });

    expect(await getContract(db, signed.id)).toMatchObject(locked);
    const [listed] = await listContracts(db, { customerId: AINO });
    expect(listed).toMatchObject(locked);
  });

  it('stays the same years later, when both the list and VAT have moved on', async () => {
    const signed = await signOk((await apply(AINO, 'ebike-003', ainoEbikeAnswers)).id);
    await setDemoDate(db, { date: '2028-06-01', actor: 'test' });

    expect(await getContract(db, signed.id)).toMatchObject(locked);
  });

  it('compares with the list on the signing date, not today', async () => {
    const signed = await signOk((await apply(AINO, 'ebike-003', ainoEbikeAnswers)).id);
    await setDemoDate(db, { date: '2026-11-06', actor: 'test' });

    const contract = await getContract(db, signed.id);
    if (!contract) throw new Error('expected the contract');
    const [view] = await contractViews(db, [contract]);
    expect(view?.list_price_on_signing_cents).toBe(389_000);
  });
});

describe('reading contracts', () => {
  it('finds a contract by id and lists them by customer', async () => {
    const aino = await signOk((await apply(AINO, 'ebike-003', ainoEbikeAnswers)).id);
    const lena = await signOk(
      (await apply('cust-lena', 'ebike-001', { ...ainoEbikeAnswers, q_country: 'EE' })).id,
      'cust-lena'
    );

    expect(await getContract(db, aino.id)).toMatchObject({ id: aino.id });
    expect(await getContract(db, 'nope')).toBeNull();
    expect((await listContracts(db)).map((c) => c.id).sort()).toEqual([aino.id, lena.id].sort());
    expect((await listContracts(db, { customerId: AINO })).map((c) => c.id)).toEqual([aino.id]);
  });

  it('has no list price to compare for a re-listed item', async () => {
    const signed = await signOk((await apply(AINO, 'ebike-003', ainoEbikeAnswers)).id);
    const [view] = await contractViews(db, [{ ...signed, price_list_version: null }]);
    expect(view?.list_price_on_signing_cents).toBeNull();
  });
});
