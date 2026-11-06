// The staff desk against a real (test) database: scenario card 7 (Haapala, manual review)
// and card 6 (Norvi, the applicant cannot sign), end to end through the audit log.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { answerQuestion, startApplication, submitApplication } from './applications';
import { seedAssets } from './assets';
import { listAuditLog } from './audit';
import { signApplication } from './contracts';
import { seedCustomers } from './customers';
import { approveApplication, declineApplication, listStaffQueue } from './staff';

let db: Awaited<ReturnType<typeof createTestDb>>['db'];
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  await seedAssets(db, await loadAssets());
  await seedCustomers(db, await loadCustomers());
});
afterAll(async () => {
  await cleanup();
});

const AS_OF = '2026-11-05';
const STAFF = 'staff';

/** Answers whatever the flow asks next from `script`, until nothing is left to ask. */
async function applyAndSubmit(input: {
  customerId: string;
  assetId: string;
  quantity: number;
  downPaymentCents: number;
  termMonths: number;
  script: Record<string, unknown>;
}) {
  const started = await startApplication(db, { ...input, actor: input.customerId, asOf: AS_OF });
  if (!started.ok) throw new Error(`start: ${started.reason}`);
  const applicationId = started.state.application.id;
  let next = started.state.nextQuestionId;
  while (next !== null) {
    if (!(next in input.script)) throw new Error(`no scripted answer for ${next}`);
    const result = await answerQuestion(db, {
      applicationId,
      questionId: next,
      answer: input.script[next] as never,
      actor: input.customerId,
      asOf: AS_OF,
    });
    if (!result.ok) throw new Error(`answer ${next}: ${result.reason}`);
    next = result.state.nextQuestionId;
  }
  const submitted = await submitApplication(db, {
    applicationId,
    startDate: AS_OF,
    actor: input.customerId,
    asOf: AS_OF,
  });
  if (!submitted.ok) throw new Error(`submit: ${submitted.reason}`);
  return submitted.state;
}

const companyScript = {
  q_customer_type: 'company',
  q_email: 'office@example.com',
  q_vat_registered: 'yes',
  q_pep: 'no',
};

const haapala = () =>
  applyAndSubmit({
    customerId: 'cust-haapala',
    assetId: 'farm-002',
    quantity: 1,
    downPaymentCents: 2_000_000,
    termMonths: 48,
    script: {
      ...companyScript,
      q_business_id: '2876543-5',
      q_company_name: 'Haapalan Tila Oy',
      q_can_sign: 'yes',
      q_farm_registry: 'FI-123456',
      q_annual_revenue: 95_000_000,
      q_beneficial_owners: ['Jussi Haapala (60 %)', 'Maria Haapala (40 %)'],
      q_pep: 'yes',
      q_pep_details: 'Jussi Haapala, municipal council member',
    },
  });

describe('scenario card 7: Haapala is approved from the manual-review queue', () => {
  let applicationId = '';

  it('lands in the staff queue with its reasons', async () => {
    const state = await haapala();
    expect(state.application.status).toBe('manual_review');
    applicationId = state.application.id;

    const queue = await listStaffQueue(db);
    const item = queue.find((q) => q.applicationId === applicationId);
    expect(item).toMatchObject({
      status: 'manual_review',
      customerName: 'Haapalan Tila Oy',
      assetId: 'farm-002',
      termMonths: 48,
    });
    expect(Array.isArray(item!.decisionReasons)).toBe(true);
  });

  it('approves with a fresh 7-day hold, the asset reserved, and an audit row', async () => {
    const result = await approveApplication(db, {
      applicationId,
      actor: STAFF,
      asOf: '2026-11-06',
    });
    expect(result).toEqual({ ok: true, status: 'approved', holdUntil: '2026-11-13' });

    const app = await db.application.findUnique({ where: { id: applicationId } });
    expect(app).toMatchObject({ status: 'approved', hold_until: '2026-11-13' });
    const holds = await db.reservation.findMany({ where: { asset_id: 'farm-002', active: true } });
    expect(holds).toHaveLength(1);
    expect(holds[0]).toMatchObject({ kind: 'approval_hold', until: '2026-11-13' });
    const asset = await db.asset.findUnique({ where: { id: 'farm-002' } });
    expect(asset?.status).toBe('reserved');

    const audit = await listAuditLog(db);
    expect(audit[0]).toMatchObject({
      actor: STAFF,
      action: 'application.approved_by_staff',
      entity_id: applicationId,
    });
    expect((await listStaffQueue(db)).some((q) => q.applicationId === applicationId)).toBe(false);
  });

  it('cannot approve or decline twice', async () => {
    expect(await approveApplication(db, { applicationId, actor: STAFF, asOf: AS_OF })).toEqual({
      ok: false,
      reason: 'not_reviewable',
    });
    expect(await declineApplication(db, { applicationId, actor: STAFF })).toEqual({
      ok: false,
      reason: 'not_reviewable',
    });
  });

  it('reports an unknown application', async () => {
    expect(
      await approveApplication(db, { applicationId: 'nope', actor: STAFF, asOf: AS_OF })
    ).toEqual({ ok: false, reason: 'not_found' });
    expect(await declineApplication(db, { applicationId: 'nope', actor: STAFF })).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });
});

describe('declining a manual review releases the asset', () => {
  it('sets declined, drops the hold and makes the asset available again', async () => {
    // A second Haapala application on a fresh database row: reuse farm-002 after a reset.
    await db.reservation.updateMany({ where: { asset_id: 'farm-002' }, data: { active: false } });
    await db.asset.update({ where: { id: 'farm-002' }, data: { status: 'available' } });
    const state = await haapala();
    expect(state.application.status).toBe('manual_review');

    const result = await declineApplication(db, {
      applicationId: state.application.id,
      actor: STAFF,
      note: 'Missing PEP documentation',
    });
    expect(result).toEqual({ ok: true, status: 'declined', holdUntil: null });
    const asset = await db.asset.findUnique({ where: { id: 'farm-002' } });
    expect(asset?.status).toBe('available');
    expect(await db.reservation.count({ where: { asset_id: 'farm-002', active: true } })).toBe(0);
    const audit = await listAuditLog(db);
    expect(audit[0]).toMatchObject({
      action: 'application.declined_by_staff',
      details: { from: 'manual_review', to: 'declined', note: 'Missing PEP documentation' },
    });
  });
});

describe('scenario card 6: the Norvi signatory signs from the staff desk', () => {
  const SIGNATORY = 'ceo@norvi.example.com';

  it('waits for the signatory, then the signature is audited under their e-mail', async () => {
    const state = await applyAndSubmit({
      customerId: 'cust-norvi',
      assetId: 'ebike-004',
      quantity: 4,
      downPaymentCents: 0,
      termMonths: 36,
      script: {
        ...companyScript,
        q_business_id: '3299871-7',
        q_company_name: 'Norvi Logistics Oy',
        q_can_sign: 'no',
        q_signatory_email: SIGNATORY,
        q_usage_purpose: 'delivery',
        q_annual_revenue: 410_000_000,
        q_beneficial_owners: ['Norvi Holding Oy (100 %)'],
      },
    });
    expect(state.application.status).toBe('awaiting_signature');

    const item = (await listStaffQueue(db)).find((q) => q.applicationId === state.application.id);
    expect(item).toMatchObject({ status: 'awaiting_signature', signatoryEmail: SIGNATORY });

    const signed = await signApplication(db, {
      applicationId: state.application.id,
      startDate: AS_OF,
      actor: SIGNATORY,
      asOf: AS_OF,
    });
    expect(signed.ok).toBe(true);
    const audit = await listAuditLog(db);
    expect(audit[0]).toMatchObject({ actor: SIGNATORY, action: 'contract.signed' });
  });
});
