// Card 6 as the judges clarified it (D-048, D-050): an applicant who may not sign sends the lease
// to their signatory. It is stored, not signed and not active, until that person signs.
// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { quoteAndSign as quoteAndSignLease, type Lease } from '../../tests/helpers/quote-and-sign';
import { createTestDb } from '../../tests/helpers/test-db';
import { loadAssets, loadResidualCurves } from '@/data/load';
import { listAuditLog } from './audit';
import { seedAssets } from './assets';
import { countersignContract } from './awaiting-signature';
import { endLease } from './contract-endings';
import { getContract, issuedInvoices, type LeaseDataPack } from './contracts';
import { endLeaseEarly } from './early-exit';
import { ageClockFor } from './item-age';
import { loadLeaseDataPack } from './lease-data';
import { loadSecondLifeDataPack } from './second-life';
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
  await db.contractEnding.deleteMany();
  await db.quote.deleteMany();
  await db.contract.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
});

// Card 6: Norvi's own record (data/customers.json); the applicant may not sign.
const norviAnswers = {
  q_customer_type: 'company',
  q_email: 'fleet@norvi.example.com',
  q_business_id: '3299871-7',
  q_company_name: 'Norvi Logistics Oy',
  q_can_sign: 'no',
  q_signatory_email: 'ceo@norvi.example.com',
  q_vat_registered: 'yes',
  q_usage_purpose: 'delivery',
};
const norvi: Lease = {
  assetId: 'ebike-004',
  customerId: 'cust-norvi',
  termMonths: 36,
  downPaymentCents: 0,
  answers: norviAnswers,
  today: '2026-11-05',
  actor: 'cust-norvi',
};

const quoteAndSign = (lease: Lease) => quoteAndSignLease(db, data, lease);

async function sendNorvi() {
  const result = await quoteAndSign(norvi);
  if (!result.ok) throw new Error(`setup failed: ${result.reason}`);
  return result;
}

const invoicesOf = async (id: number) => {
  const found = await getContract(db, id);
  if (!found) throw new Error('contract missing');
  const schedule = issuedInvoices(found, null, data.vatRates);
  if (schedule && !schedule.ok) throw new Error(schedule.reason);
  return schedule?.invoices ?? null;
};

describe('signLease when the applicant may not sign (card 6)', () => {
  it('stores the contract as waiting for the signatory, with the email and the day sent', async () => {
    const result = await sendNorvi();
    expect(result).toMatchObject({
      ok: true,
      awaitingSignature: { email: 'ceo@norvi.example.com', sentOn: '2026-11-05' },
      contract: { assetId: 'ebike-004', customerId: 'cust-norvi' },
    });
    expect(await getContract(db, result.id)).toEqual({
      id: result.id,
      contract: result.contract,
      awaitingSignature: { email: 'ceo@norvi.example.com', sentOn: '2026-11-05' },
    });
    const row = await db.contract.findUniqueOrThrow({ where: { id: result.id } });
    expect(row).toMatchObject({
      status: 'awaiting_signatory',
      signatory_email: 'ceo@norvi.example.com',
      sent_on: '2026-11-05',
    });
  });

  it('is not active: no invoices, the item reserved for it, no age clock started', async () => {
    const result = await sendNorvi();
    expect(await invoicesOf(result.id)).toBeNull();
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-004' } });
    expect(asset.status).toBe('reserved');
    // ebike-004 is new in the data pack: its clock starts with its first *active* lease (D-042).
    expect((await ageClockFor(db, 'ebike-004'))?.firstLeasedNewOn).toBeNull();
  });

  it('writes one audit row "sent to the signatory"', async () => {
    const result = await sendNorvi();
    const log = (await listAuditLog(db)).filter((e) => e.action !== 'quote.created');
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      actor: 'cust-norvi',
      action: 'contract.sent_to_signatory',
      entity_type: 'contract',
      entity_id: String(result.id),
      details: {
        assetId: 'ebike-004',
        signatoryEmail: 'ceo@norvi.example.com',
        monthlyNetRentCents: result.contract.monthlyNetRentCents,
        asOf: '2026-11-05',
      },
    });
  });

  it('offers no end-of-term or early-exit action while it waits', async () => {
    const { id } = await sendNorvi();
    const secondLife = await loadSecondLifeDataPack();
    expect(
      await endLease(
        db,
        { ...data, secondLife },
        { contractId: id, choice: { kind: 'buy' }, today: '2029-11-05', actor: 'cust-norvi' }
      )
    ).toEqual({ ok: false, reason: 'contract_not_active' });
    expect(
      await endLeaseEarly(
        db,
        { ...data, curves: await loadResidualCurves() },
        {
          contractId: id,
          choice: { kind: 'early_buy', month: 7 },
          today: '2027-05-20',
          actor: 'cust-norvi',
        }
      )
    ).toEqual({ ok: false, reason: 'contract_not_active' });
  });

  it("still checks the answers against Norvi's record (D-031, D-040)", async () => {
    const { q_signatory_email: _signatory, ...answers } = norviAnswers;
    expect(await quoteAndSign({ ...norvi, answers: { ...answers, q_can_sign: 'yes' } })).toEqual({
      ok: false,
      reason: 'answers_do_not_match_customer',
      questionIds: ['q_can_sign'],
    });
    expect(await db.contract.count()).toBe(0);
  });

  it('leaves an applicant who signs themselves exactly as before (Aino, card 1)', async () => {
    const result = await quoteAndSign({
      ...norvi,
      assetId: 'ebike-003',
      customerId: 'cust-aino',
      actor: 'cust-aino',
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
    });
    expect(result).toMatchObject({ ok: true, awaitingSignature: null });
    if (!result.ok) return;
    const row = await db.contract.findUniqueOrThrow({ where: { id: result.id } });
    expect(row).toMatchObject({ status: 'active', signatory_email: null, sent_on: null });
    expect((await invoicesOf(result.id))?.[0]?.invoiceDate).toBe('2026-11-05');
  });
});

describe('countersignContract', () => {
  it('activates it: signed and started the day the signatory signs, invoices from then', async () => {
    const sent = await sendNorvi();
    const result = await countersignContract(db, {
      contractId: sent.id,
      today: '2026-11-20',
    });
    expect(result).toEqual({
      ok: true,
      contract: { ...sent.contract, signDate: '2026-11-20', startDate: '2026-11-20' },
    });
    expect(await getContract(db, sent.id)).toMatchObject({ awaitingSignature: null });
    const row = await db.contract.findUniqueOrThrow({ where: { id: sent.id } });
    expect(row).toMatchObject({
      status: 'active',
      sign_date: '2026-11-20',
      start_date: '2026-11-20',
      // Who was asked, and when, stays on the row.
      signatory_email: 'ceo@norvi.example.com',
      sent_on: '2026-11-05',
    });
    const invoices = await invoicesOf(sent.id);
    expect(invoices).toHaveLength(36);
    expect(invoices?.[0]).toMatchObject({
      invoiceDate: '2026-11-20',
      netCents: sent.contract.monthlyNetRentCents,
    });
  });

  it('writes an audit row by the signatory', async () => {
    const sent = await sendNorvi();
    await countersignContract(db, { contractId: sent.id, today: '2026-11-20' });
    const log = await listAuditLog(db);
    expect(log.find((e) => e.action === 'contract.signed_by_signatory')).toMatchObject({
      actor: 'ceo@norvi.example.com',
      entity_type: 'contract',
      entity_id: String(sent.id),
      details: {
        from: 'awaiting_signatory',
        to: 'active',
        sentOn: '2026-11-05',
        asOf: '2026-11-20',
      },
    });
  });

  it('refuses a second signature, an active contract and a missing one', async () => {
    const sent = await sendNorvi();
    await countersignContract(db, { contractId: sent.id, today: '2026-11-20' });
    expect(await countersignContract(db, { contractId: sent.id, today: '2026-11-21' })).toEqual({
      ok: false,
      reason: 'not_awaiting_signature',
    });
    expect(await countersignContract(db, { contractId: 999_999, today: '2026-11-21' })).toEqual({
      ok: false,
      reason: 'contract_not_found',
    });
  });

  it('refuses a demo date before the day it was sent, and changes nothing', async () => {
    const sent = await sendNorvi();
    expect(await countersignContract(db, { contractId: sent.id, today: '2026-11-04' })).toEqual({
      ok: false,
      reason: 'signed_before_sent',
    });
    expect(await getContract(db, sent.id)).toMatchObject({
      awaitingSignature: { email: 'ceo@norvi.example.com' },
    });
  });
});
