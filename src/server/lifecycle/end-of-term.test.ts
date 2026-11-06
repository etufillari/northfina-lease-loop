import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import type { Asset } from '@/data/schemas';
import { createTestDb } from '../../../tests/helpers/test-db';
import { seedAssets } from '../assets/assets';
import { createApplication, type ApplicationSubmissionRequest } from '../applications/applications';
import { createContract } from '../contracts/contracts';
import { generateInvoices } from '../invoicing/invoices';
import { completeContract, endOfTermAvailabilityFor, type EndOfTermRequest } from './end-of-term';
import { previewPassOn, resolvePassOn } from './pass-on';
import { seedCustomers } from '../assets/customers';
import type { PrismaClient } from '../prisma-client';

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
  await db.payment.deleteMany();
  await db.invoice.deleteMany();
  await db.secondLifeMatch.deleteMany();
  await db.assetHistory.deleteMany();
  await db.auditLog.deleteMany();
  await db.contract.deleteMany();
  await db.application.deleteMany();
  await db.customer.deleteMany();
  await db.asset.deleteMany();
  await seedCustomers(db, customerData);
  await seedAssets(db, dataPack);
});

const approvedAnswers = {
  q_customer_type: 'consumer',
  q_full_name: 'Aino Virtanen',
  q_birth_date: '1997-04-12',
  q_email: 'aino@example.com',
  q_country: 'FI',
  q_employment: 'employed',
  q_monthly_income: 320_000,
  q_usage_purpose: 'commuting',
};

async function createActiveContract() {
  const submission: ApplicationSubmissionRequest = {
    customerId: 'cust-aino',
    assetId: 'ebike-003',
    date: '2026-11-05',
    downPaymentCents: 0,
    termMonths: 36,
    actor: 'team-test',
    answers: approvedAnswers,
  };
  const application = await createApplication(db, submission);
  if (!application.ok) throw new Error(`expected approved application, got ${application.reason}`);
  const contract = await createContract(db, {
    applicationId: application.application.id,
    signedOn: '2026-11-05',
    actor: 'team-test',
  });
  if (!contract.ok) throw new Error(`expected active contract, got ${contract.reason}`);
  return contract.contract;
}

async function generateAndSettleRent(contractId: string) {
  const schedule = await generateInvoices(db, { contractId, actor: 'team-test' }, '2029-11-05');
  if (!schedule.ok) throw new Error(`expected invoice schedule, got ${schedule.reason}`);

  for (const invoice of schedule.invoices) {
    await db.payment.create({
      data: {
        id: randomUUID(),
        invoice_id: invoice.id,
        amount_cents: invoice.totalCents,
        paid_on: invoice.dueOn,
      },
    });
    await db.invoice.update({ where: { id: invoice.id }, data: { status: 'paid' } });
  }
}

const returnedRequest: EndOfTermRequest = {
  action: 'returned',
  completedOn: '2029-11-05',
  actor: 'team-test',
};

function passOnRequest(usageValue: number): Extract<EndOfTermRequest, { action: 'passed_on' }> {
  return {
    action: 'passed_on',
    completedOn: '2029-11-06',
    actor: 'team-test',
    condition: 'good',
    usageValue,
    recipient: { type: 'named', name: 'Sam Friend', email: 'sam@example.com' },
  };
}

describe('completeContract', () => {
  it('completes a return and writes the asset passport and audit entry', async () => {
    const contract = await createActiveContract();
    await generateAndSettleRent(contract.id);

    const result = await completeContract(db, contract.id, returnedRequest);

    expect(result).toEqual({
      ok: true,
      contract: {
        id: contract.id,
        assetId: 'ebike-003',
        status: 'completed',
        action: 'returned',
        completedOn: '2029-11-05',
        buyoutCents: 58_350,
        buyoutPaidCents: null,
      },
    });
    expect(await db.contract.findUniqueOrThrow({ where: { id: contract.id } })).toMatchObject({
      status: 'completed',
      end_of_term_action: 'returned',
      completed_on: '2029-11-05',
      buyout_paid_cents: null,
    });
    expect((await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } })).status).toBe(
      'returned'
    );
    expect(await db.assetHistory.findFirstOrThrow({ orderBy: { id: 'desc' } })).toMatchObject({
      event_type: 'returned',
      from_status: 'reserved',
      to_status: 'returned',
      occurred_on: '2029-11-05',
    });
    expect(
      await db.auditLog.findFirstOrThrow({ where: { action: 'contract.completed' } })
    ).toMatchObject({
      entity_id: contract.id,
      actor: 'team-test',
    });
  });

  it('hands the item to a named person and ends the first lease without a buyout', async () => {
    const contract = await createActiveContract();
    await generateAndSettleRent(contract.id);
    const before = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });

    const result = await completeContract(db, contract.id, passOnRequest(before.usage_value + 900));

    expect(result).toMatchObject({
      ok: true,
      contract: { action: 'passed_on', buyoutPaidCents: null },
    });
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });
    expect(asset).toMatchObject({
      status: 'reserved',
      usage_value: before.usage_value + 900,
      previous_lives: before.previous_lives + 1,
    });
    const match = await db.secondLifeMatch.findUniqueOrThrow({
      where: { from_contract_id: contract.id },
    });
    expect(match).toMatchObject({
      asset_id: 'ebike-003',
      recipient_name: 'Sam Friend',
      recipient_email: 'sam@example.com',
      term_months: 24,
    });
    expect(match.market_value_cents).toBeLessThan(before.original_list_price_cents ?? Infinity);

    const history = await db.assetHistory.findFirstOrThrow({ orderBy: { id: 'desc' } });
    expect(history).toMatchObject({
      event_type: 'passed_on',
      from_status: 'reserved',
      to_status: 'reserved',
      usage_value: before.usage_value + 900,
    });
    expect(history.details_json).not.toContain('sam@example.com');
    expect(JSON.parse(history.details_json ?? '')).toMatchObject({
      matchId: match.id,
      recipientType: 'named',
      termMonths: 24,
    });
  });

  it('offers a waiting-list entry until it is claimed', async () => {
    const contract = await createActiveContract();
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });
    const report = { condition: 'good' as const, usageValue: asset.usage_value };
    const preview = await previewPassOn(db, contract.id, { ...report, handoverOn: '2026-12-01' });
    if (!preview.ok) throw new Error(`expected options, got ${preview.reason}`);
    const requestId = preview.waitingList[0]?.request.id;
    if (!requestId) throw new Error('expected a waiting-list match');

    const details = {
      ...report,
      recipient: { type: 'waiting_list' as const, requestId },
      completedOn: '2026-12-01',
      actor: 'team-test',
    };
    const resolve = () => db.$transaction((tx) => resolvePassOn(tx, asset, details));

    expect(await resolve()).toMatchObject({ ok: true });
    await db.secondLifeMatch.create({
      data: {
        id: 'already-claimed',
        asset_id: 'ebike-001',
        request_id: requestId,
        matched_on: '2026-11-05',
        actor: 'team-test',
        market_value_cents: 1,
        term_months: 24,
        monthly_net_rent_cents: 1,
        pricing_snapshot_json: '{}',
        request_snapshot_json: '{}',
      },
    });
    expect(await resolve()).toEqual({ ok: false, reason: 'recipient_not_eligible' });
  });

  it('rolls everything back when the handover report fails', async () => {
    const contract = await createActiveContract();
    await generateAndSettleRent(contract.id);
    const asset = await db.asset.update({
      where: { id: 'ebike-003' },
      data: { usage_value: 500 },
    });

    const result = await completeContract(db, contract.id, passOnRequest(asset.usage_value - 1));

    expect(result).toMatchObject({ ok: false, reason: 'usage_below_recorded' });
    expect(await db.contract.findUniqueOrThrow({ where: { id: contract.id } })).toMatchObject({
      status: 'active',
      end_of_term_action: null,
    });
    expect(await db.secondLifeMatch.count()).toBe(0);
    expect(await db.auditLog.count({ where: { action: 'contract.completed' } })).toBe(0);
  });

  it('refuses a named person below good condition', async () => {
    const contract = await createActiveContract();
    await generateAndSettleRent(contract.id);
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });

    const result = await completeContract(db, contract.id, {
      ...passOnRequest(asset.usage_value),
      condition: 'fair',
    });

    expect(result).toEqual({ ok: false, reason: 'recipient_not_eligible' });
  });

  it('completes a buyout only for the exact locked amount', async () => {
    const contract = await createActiveContract();
    await generateAndSettleRent(contract.id);

    const mismatch = await completeContract(db, contract.id, {
      action: 'bought',
      completedOn: '2029-11-05',
      buyoutPaidCents: contract.buyoutCents - 1,
      actor: 'team-test',
    });
    expect(mismatch).toEqual({
      ok: false,
      reason: 'buyout_amount_mismatch',
      expectedCents: contract.buyoutCents,
      receivedCents: contract.buyoutCents - 1,
    });

    const result = await completeContract(db, contract.id, {
      action: 'bought',
      completedOn: '2029-11-05',
      buyoutPaidCents: contract.buyoutCents,
      actor: 'team-test',
    });
    expect(result).toMatchObject({
      ok: true,
      contract: { action: 'bought', buyoutPaidCents: contract.buyoutCents },
    });
    expect((await db.asset.findUniqueOrThrow({ where: { id: contract.assetId } })).status).toBe(
      'sold'
    );
  });

  it('rejects missing schedules, unpaid rent, early completion, and wrong asset state', async () => {
    const contract = await createActiveContract();
    await expect(completeContract(db, contract.id, returnedRequest)).resolves.toEqual({
      ok: false,
      reason: 'invoice_schedule_not_generated',
    });

    await generateAndSettleRent(contract.id);
    const invoice = await db.invoice.findFirstOrThrow();
    await db.payment.deleteMany({ where: { invoice_id: invoice.id } });
    await db.invoice.update({ where: { id: invoice.id }, data: { status: 'issued' } });
    await expect(completeContract(db, contract.id, returnedRequest)).resolves.toMatchObject({
      ok: false,
      reason: 'rent_balance_outstanding',
    });

    await db.payment.create({
      data: {
        id: randomUUID(),
        invoice_id: invoice.id,
        amount_cents: invoice.total_cents,
        paid_on: invoice.due_on,
      },
    });
    await db.invoice.update({ where: { id: invoice.id }, data: { status: 'paid' } });
    await expect(
      completeContract(db, contract.id, { ...returnedRequest, completedOn: '2029-11-04' })
    ).resolves.toMatchObject({ ok: false, reason: 'term_not_finished' });

    await db.asset.update({ where: { id: contract.assetId }, data: { status: 'available' } });
    await expect(completeContract(db, contract.id, returnedRequest)).resolves.toMatchObject({
      ok: false,
      reason: 'asset_not_reserved',
    });
    expect(await db.contract.findUniqueOrThrow({ where: { id: contract.id } })).toMatchObject({
      status: 'active',
    });
    expect(await db.auditLog.count({ where: { action: 'contract.completed' } })).toBe(0);
  });
});

describe('previewPassOn', () => {
  it('shows options without changing data, and only for active contracts', async () => {
    const contract = await createActiveContract();
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });
    const input = {
      condition: 'good' as const,
      usageValue: asset.usage_value,
      handoverOn: '2026-12-01',
    };

    const preview = await previewPassOn(db, contract.id, input);

    expect(preview).toMatchObject({ ok: true, mandatorySteps: [] });
    expect(await db.secondLifeMatch.count()).toBe(0);
    expect(await previewPassOn(db, 'missing', input)).toEqual({
      ok: false,
      reason: 'contract_not_found',
    });

    await db.contract.update({ where: { id: contract.id }, data: { status: 'completed' } });
    expect(await previewPassOn(db, contract.id, input)).toEqual({
      ok: false,
      reason: 'contract_not_active',
      status: 'completed',
    });
  });
});

describe('endOfTermAvailabilityFor', () => {
  async function availability(asOf: string) {
    const row = await db.contract.findFirstOrThrow({
      include: { invoices: { include: { payments: true }, orderBy: { sequence: 'asc' } } },
    });
    return endOfTermAvailabilityFor(row, asOf);
  }

  it('explains each reason a customer cannot choose yet', async () => {
    const contract = await createActiveContract();
    expect(await availability('2029-11-05')).toMatchObject({
      reason: 'invoice_schedule_not_generated',
    });

    await generateInvoices(db, { contractId: contract.id, actor: 'team-test' }, '2029-11-05');
    const unpaid = await availability('2029-11-05');
    expect(unpaid).toMatchObject({ reason: 'rent_balance_outstanding' });
    expect(unpaid).toHaveProperty('outstandingRentCents', expect.any(Number));

    await db.contract.update({ where: { id: contract.id }, data: { status: 'completed' } });
    expect(await availability('2029-11-05')).toMatchObject({ reason: 'contract_not_active' });
  });

  it('is ready once the term has ended and all rent is paid', async () => {
    const contract = await createActiveContract();
    await generateAndSettleRent(contract.id);

    expect(await availability('2029-11-05')).toEqual({ status: 'ready' });
    expect(await availability('2027-01-01')).toMatchObject({ reason: 'term_not_finished' });
  });
});
