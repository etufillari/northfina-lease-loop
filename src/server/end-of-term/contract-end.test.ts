// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ainoEbikeAnswers } from '../../../tests/helpers/applicants';
import { applyFor, findCustomer, resetLeaseData, signFor } from '../../../tests/helpers/lease-flow';
import { createTestDb } from '../../../tests/helpers/test-db';
import { submitApplication } from '../application/applications';
import { contractViews, getContract, previewContract, signContract } from '../contract/contracts';
import { listInvoices } from '../invoicing/invoices';
import { quoteAsset } from '../pricing/quotes';
import type { PrismaClient } from '../prisma-client';
import { relistAsset } from '../second-life/relist';
import { closeDueContracts, closeExpiredContracts, endContract } from './contract-end';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let contractId: string;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetLeaseData(db);
  const application = await applyFor(db, 'cust-aino', 'ebike-003', ainoEbikeAnswers);
  contractId = (await signFor(db, 'cust-aino', application.id)).id;
  await db.auditLog.deleteMany();
});

const setDate = (value: string) =>
  db.appSetting.update({ where: { key: 'demo_date' }, data: { value } });

async function end(outcome: 'bought_out' | 'returned' | 'passed_on', customerId = 'cust-aino') {
  return endContract(db, { contractId, customer: await findCustomer(customerId), outcome });
}

const assetStatus = async () =>
  (await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } })).status;
const life = () => db.assetLife.findFirstOrThrow({ where: { contract_id: contractId } });

describe('endContract: the customer chooses', () => {
  beforeEach(async () => {
    await setDate('2029-11-05');
  });

  it('buys the item: the asset is sold and a buyout invoice is added', async () => {
    expect(await end('bought_out')).toMatchObject({
      ok: true,
      contract: { status: 'bought_out', actual_end_on: '2029-11-05', end_choice: 'closed' },
    });
    expect(await assetStatus()).toBe('sold');
    expect(await life()).toMatchObject({ ended_on: '2029-11-05', outcome: 'bought_out' });

    const invoices = await listInvoices(db, { contractId });
    expect(invoices).toHaveLength(37);
    expect(invoices.at(-1)).toMatchObject({
      sequence: 37,
      invoice_date: '2029-11-05',
      net_cents: 58_350,
      vat_rate_percent: 26,
      total_cents: 73_521,
    });
  });

  it('returns the item: no invoice is added', async () => {
    expect(await end('returned')).toMatchObject({
      ok: true,
      contract: { status: 'returned' },
    });
    expect(await assetStatus()).toBe('returned');
    expect(await life()).toMatchObject({ outcome: 'returned', end_condition: null });
    expect(await listInvoices(db, { contractId })).toHaveLength(36);
  });

  it('passes the item on to someone waiting, and holds it for them', async () => {
    const customer = await findCustomer('cust-aino');
    const result = await endContract(db, {
      contractId,
      customer,
      outcome: 'passed_on',
      passedTo: 'cust-wait-02',
    });

    expect(result).toMatchObject({
      ok: true,
      contract: { status: 'passed_on', passed_to: 'cust-wait-02' },
    });
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });
    expect(asset).toMatchObject({ status: 'returned', reserved_for: 'cust-wait-02' });
    expect(await life()).toMatchObject({ outcome: 'passed_on' });
  });

  it('refuses to pass the item on without a valid person', async () => {
    expect(await end('passed_on')).toEqual({ ok: false, reason: 'invalid_pass_on_target' });
    expect(await assetStatus()).toBe('leased');
  });

  it('writes one audit row in the customer name', async () => {
    await end('bought_out');
    const rows = await db.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor: 'cust-aino',
      action: 'contract.ended',
      entity_id: contractId,
    });
    expect(JSON.parse(rows[0]?.details_json ?? '')).toMatchObject({
      outcome: 'bought_out',
      automatic: false,
      asset_status: { from: 'leased', to: 'sold' },
      buyout_invoice_cents: 73_521,
    });
  });

  it('keeps the locked price', async () => {
    await end('returned');
    expect(await getContract(db, contractId)).toMatchObject({
      monthly_net_rent_cents: 10_730,
      buyout_cents: 58_350,
      planned_end_on: '2029-11-04',
    });
  });

  it('can only happen once', async () => {
    await end('returned');
    expect(await end('bought_out')).toEqual({ ok: false, reason: 'already_ended' });
    expect(await assetStatus()).toBe('returned');
    expect(await db.auditLog.count()).toBe(1);
  });

  it('lets only one of two simultaneous choices through', async () => {
    const results = await Promise.all([end('returned'), end('bought_out')]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await db.auditLog.count()).toBe(1);
  });

  it("treats someone else's contract as not found", async () => {
    expect(await end('returned', 'cust-lena')).toEqual({
      ok: false,
      reason: 'contract_not_found',
    });
    expect(await assetStatus()).toBe('leased');
  });

  it('reports an unknown contract', async () => {
    const customer = await findCustomer('cust-aino');
    expect(await endContract(db, { contractId: 'nope', customer, outcome: 'returned' })).toEqual({
      ok: false,
      reason: 'contract_not_found',
    });
  });
});

describe('endContract: the choice window', () => {
  it('refuses before the planned end', async () => {
    await setDate('2029-11-03');
    expect(await end('returned')).toEqual({ ok: false, reason: 'not_due' });
    expect(await assetStatus()).toBe('leased');
  });

  it.each(['2029-11-04', '2029-11-11'])('accepts %s, an edge of the window', async (date) => {
    await setDate(date);
    expect((await end('returned')).ok).toBe(true);
  });

  it('refuses the day after the window', async () => {
    await setDate('2029-11-12');
    expect(await end('bought_out')).toEqual({ ok: false, reason: 'window_closed' });
    expect(await listInvoices(db, { contractId })).toHaveLength(36);
  });
});

describe('closeExpiredContracts', () => {
  it('closes a contract past its window as returned', async () => {
    expect(await closeExpiredContracts(db, '2029-11-12')).toEqual({ closed: [contractId] });

    expect(await getContract(db, contractId)).toMatchObject({
      status: 'returned',
      actual_end_on: '2029-11-11',
    });
    expect(await assetStatus()).toBe('returned');
    expect(await life()).toMatchObject({ ended_on: '2029-11-11', outcome: 'returned' });
    expect(await listInvoices(db, { contractId })).toHaveLength(36);
  });

  it('records the last day of the window, however late it runs', async () => {
    await closeExpiredContracts(db, '2035-06-01');
    expect((await getContract(db, contractId))?.actual_end_on).toBe('2029-11-11');
  });

  it('marks the audit row as automatic, from the system', async () => {
    await closeExpiredContracts(db, '2029-11-12');
    const row = await db.auditLog.findFirstOrThrow();
    expect(row).toMatchObject({ actor: 'system', action: 'contract.ended' });
    expect(JSON.parse(row.details_json ?? '')).toMatchObject({
      outcome: 'returned',
      automatic: true,
    });
  });

  it.each([
    ['before the planned end', '2029-11-03'],
    ['on the planned end', '2029-11-04'],
    ['on the last day of the window', '2029-11-11'],
  ])('leaves a contract alone %s', async (_name, today) => {
    expect(await closeExpiredContracts(db, today)).toEqual({ closed: [] });
    expect((await getContract(db, contractId))?.status).toBe('active');
  });

  it('does nothing the second time', async () => {
    await closeExpiredContracts(db, '2029-11-12');
    expect(await closeExpiredContracts(db, '2029-11-13')).toEqual({ closed: [] });
    expect(await db.auditLog.count()).toBe(1);
  });

  it('leaves a contract the customer already ended', async () => {
    await setDate('2029-11-05');
    await end('bought_out');
    expect(await closeExpiredContracts(db, '2029-11-12')).toEqual({ closed: [] });
    expect((await getContract(db, contractId))?.status).toBe('bought_out');
  });
});

describe('closeDueContracts', () => {
  it('uses the date the app runs on', async () => {
    expect(await closeDueContracts(db)).toEqual({ closed: [] });
    await setDate('2029-11-12');
    expect(await closeDueContracts(db)).toEqual({ closed: [contractId] });
  });
});

describe('an item passed on to someone', () => {
  beforeEach(async () => {
    await setDate('2029-11-05');
    await endContract(db, {
      contractId,
      customer: await findCustomer('cust-aino'),
      outcome: 'passed_on',
      passedTo: 'cust-wait-02',
    });
    await relistAsset(db, {
      assetId: 'ebike-003',
      condition: 'good',
      usageValue: 8_000,
      actor: 'staff-dealer',
    });
  });

  const answers = { ...ainoEbikeAnswers, q_monthly_income: 260_000 };

  it('stays held after the dealer re-lists it', async () => {
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });
    expect(asset).toMatchObject({ status: 'available', reserved_for: 'cust-wait-02' });
  });

  it('can be leased by the person it is held for, which clears the hold', async () => {
    const application = await applyFor(db, 'cust-wait-02', 'ebike-003', answers, {
      termMonths: 24,
    });
    expect(application.decision).toBe('approved');

    const signed = await signFor(db, 'cust-wait-02', application.id);
    expect(signed).toMatchObject({ customer_id: 'cust-wait-02', status: 'active' });

    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });
    expect(asset).toMatchObject({ status: 'leased', reserved_for: null });
  });

  it('cannot be quoted or applied for by anyone else', async () => {
    const customer = await findCustomer('cust-lena');
    const deal = { assetId: 'ebike-003', termMonths: 24, downPaymentCents: 0 };

    expect(await quoteAsset(db, { ...deal, date: '2029-11-05', customerId: customer.id })).toEqual({
      ok: false,
      reason: 'asset_not_available',
    });
    expect(await submitApplication(db, { ...deal, customer, answers })).toEqual({
      ok: false,
      reason: 'asset_not_available',
    });
  });

  it('cannot be signed by someone approved before the hold', async () => {
    await db.asset.update({ where: { id: 'ebike-003' }, data: { reserved_for: null } });
    const application = await applyFor(db, 'cust-lena', 'ebike-003', answers, { termMonths: 24 });
    await db.asset.update({
      where: { id: 'ebike-003' },
      data: { reserved_for: 'cust-wait-02' },
    });
    const customer = await findCustomer('cust-lena');

    expect(await previewContract(db, { applicationId: application.id, customer })).toEqual({
      ok: false,
      reason: 'asset_not_available',
    });
    expect(await signContract(db, { applicationId: application.id, customer })).toEqual({
      ok: false,
      reason: 'asset_not_available',
    });
  });
});

describe('the contract view', () => {
  it('tells a screen when the choice is open', async () => {
    const contract = await getContract(db, contractId);
    if (!contract) throw new Error('expected the contract');

    const state = async () => (await contractViews(db, [contract]))[0];
    expect(await state()).toMatchObject({
      end_choice: 'not_due',
      choice_deadline: '2029-11-11',
    });
    await setDate('2029-11-08');
    expect((await state())?.end_choice).toBe('open');
    await setDate('2029-11-12');
    expect((await state())?.end_choice).toBe('expired');
  });
});
