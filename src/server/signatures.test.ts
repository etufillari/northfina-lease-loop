// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
// Card 6: Norvi's applicant may not sign, so the application waits for the signatory, who
// signs (the contract and invoices go to Norvi) or declines.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import { prefillAnswers } from '@/domain/prefill';
import { createTestDb } from '../../tests/helpers/test-db';
import { submitApplication } from './applications';
import { seedAssets } from './assets';
import { signContract } from './contracts';
import { submitFleetApplication } from './fleets';
import type { PrismaClient } from './prisma-client';
import {
  declineAsSignatory,
  getSignatureRequest,
  listSignatureRequests,
  signAsSignatory,
} from './signatures';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  for (const table of ['contract', 'application', 'auditLog', 'asset'] as const) {
    await (db[table] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await seedAssets(db, await loadAssets());
});

const QUOTED = '2026-11-06';
const EMAIL = 'ceo@norvi.example.com';

async function norviAnswers() {
  const customer = (await loadCustomers()).find((c) => c.id === 'cust-norvi');
  if (!customer) throw new Error('missing');
  return {
    ...prefillAnswers(customer),
    q_can_sign: 'no',
    q_signatory_email: EMAIL,
    q_usage_purpose: 'business',
  };
}

/** Card 6: Norvi applies for ebike-004, and the applicant may not sign. */
async function applyForEbike004() {
  const applied = await submitApplication(
    db,
    {
      assetId: 'ebike-004',
      termMonths: 36,
      downPaymentCents: 0,
      answers: await norviAnswers(),
      customerId: 'cust-norvi',
    },
    QUOTED
  );
  if (!applied.ok) throw new Error(applied.reason);
  expect(applied.application.decision).toBe('manual_review');
  return applied.application;
}

describe('signature requests', () => {
  it('card 6: waits for the signatory, and the applicant cannot sign it', async () => {
    const application = await applyForEbike004();
    const [request] = await listSignatureRequests(db, QUOTED);
    expect(request).toMatchObject({
      id: application.id,
      kind: 'application',
      status: 'waiting',
      signatoryEmail: EMAIL,
      applicant: { customerId: 'cust-norvi' },
      assetIds: ['ebike-004'],
      validUntil: '2026-11-20',
    });
    expect(
      await signContract(db, { applicationId: application.id, signerName: 'Applicant' }, QUOTED)
    ).toMatchObject({ ok: false, reason: 'not_approved' });
    expect(await db.contract.count()).toBe(0);
  });

  it('the signatory signs a few days later: the contract is on Norvi’s account at the quoted price', async () => {
    const application = await applyForEbike004();
    const signed = await signAsSignatory(
      db,
      { id: application.id, signerName: 'Noora Norvi' },
      '2026-11-10'
    );
    if (!signed.ok) throw new Error(signed.reason);
    const contract = await db.contract.findUniqueOrThrow({ where: { id: signed.contractIds[0] } });
    expect(contract).toMatchObject({
      customer_id: 'cust-norvi',
      signer_name: 'Noora Norvi',
      signed_date: '2026-11-10',
      quote_date: QUOTED,
      monthly_net_cents: application.quote.monthlyNetCents,
    });
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'contract.signed' } });
    expect(audit.actor).toBe(`Noora Norvi <${EMAIL}>`);

    expect((await getSignatureRequest(db, application.id, '2026-11-10'))?.status).toBe('signed');
    // Travelling back before the signature: waiting again, and nothing can be changed.
    const before = await getSignatureRequest(db, application.id, '2026-11-08');
    expect(before).toMatchObject({ status: 'waiting', laterHistory: true, contractIds: [] });
    expect(await declineAsSignatory(db, { id: application.id, note: null }, '2026-11-08')).toEqual({
      ok: false,
      reason: 'later_history',
    });
  });

  it('the signatory declines: recorded with a note, and nobody can sign it afterwards', async () => {
    const application = await applyForEbike004();
    expect(
      await declineAsSignatory(
        db,
        { id: application.id, note: '  We lease bikes elsewhere.  ' },
        '2026-11-07'
      )
    ).toEqual({ ok: true });
    const request = await getSignatureRequest(db, application.id, '2026-11-07');
    expect(request).toMatchObject({
      status: 'declined',
      declined: { date: '2026-11-07', by: EMAIL, note: 'We lease bikes elsewhere.' },
    });
    expect(await db.auditLog.count({ where: { action: 'signature.declined' } })).toBe(1);
    expect(
      await signAsSignatory(db, { id: application.id, signerName: 'Noora Norvi' }, '2026-11-08')
    ).toMatchObject({ ok: false, reason: 'not_waiting' });
    expect(
      await signContract(
        db,
        { applicationId: application.id, signerName: 'Applicant' },
        '2026-11-08'
      )
    ).toMatchObject({ ok: false, reason: 'declined' });
  });

  it('expires after the quote’s 14 days: the company applies again at that day’s prices', async () => {
    const application = await applyForEbike004();
    expect((await getSignatureRequest(db, application.id, '2026-11-21'))?.status).toBe('expired');
    expect(
      await signAsSignatory(db, { id: application.id, signerName: 'Noora Norvi' }, '2026-11-21')
    ).toMatchObject({ ok: false, reason: 'quote_expired' });
  });

  it('a fleet is one request: one signature signs every item', async () => {
    const applied = await submitFleetApplication(
      db,
      {
        assetIds: ['laptop-001', 'laptop-002'],
        termMonths: 24,
        answers: await norviAnswers(),
        customerId: 'cust-norvi',
      },
      QUOTED
    );
    if (!applied.ok) throw new Error(applied.reason);
    const requests = await listSignatureRequests(db, QUOTED);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ id: applied.fleetId, kind: 'fleet', status: 'waiting' });
    // An application of the fleet is not a request of its own.
    expect(await getSignatureRequest(db, applied.applicationIds[0] ?? '', QUOTED)).toBeNull();

    const signed = await signAsSignatory(
      db,
      { id: applied.fleetId, signerName: 'Noora Norvi' },
      QUOTED
    );
    expect(signed).toMatchObject({ ok: true });
    expect(await db.contract.count({ where: { customer_id: 'cust-norvi' } })).toBe(2);
  });
});
