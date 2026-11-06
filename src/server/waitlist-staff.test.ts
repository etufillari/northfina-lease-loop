// Waiting-list offers meet the staff desk. Norvi Logistics (whose applicant cannot sign) takes
// over ebike-007 after Pekka declines it, so its application waits in the staff queue for the
// signatory. Signing as the signatory closes the entry as leased; a staff decline leaves the
// waiting-list offer hold alone, so the item stays held until the offer lapses and passes on.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers, loadSecondLifeDemand } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { answerQuestion, submitApplication } from './applications';
import { seedAssets } from './assets';
import { signApplication } from './contracts';
import { seedCustomers } from './customers';
import { executeSecondLife } from './second-life';
import { declineApplication } from './staff';
import { acceptOffer, declineOffer, joinWaitlist, listExpiredOffers } from './waitlist-actions';
import { seedWaitlist } from './waitlist';

const AS_OF = '2026-11-05';
const NORVI_SCRIPT: Record<string, unknown> = {
  q_customer_type: 'company',
  q_email: 'fleet@norvi.example.com',
  q_vat_registered: 'yes',
  q_business_id: '3299871-7',
  q_company_name: 'Norvi Logistics Oy',
  q_annual_revenue: 410_000_000,
  q_can_sign: 'no',
  q_signatory_email: 'ceo@norvi.example.com',
  q_beneficial_owners: ['Ilkka Norvi (100 %)'],
  q_pep: 'no',
  q_usage_purpose: 'delivery',
};

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

/** Fresh data pack; Norvi joins for an e-bike, Pekka declines ebike-007, Norvi accepts it. */
async function norviApplication(): Promise<{
  test: TestDb;
  applicationId: string;
  entryId: string;
}> {
  const test = await createTestDb();
  const { db } = test;
  await seedAssets(db, await loadAssets());
  await seedCustomers(db, await loadCustomers());
  await seedWaitlist(db, await loadSecondLifeDemand());
  const joined = await joinWaitlist(db, {
    customerId: 'cust-norvi',
    category: 'e_bike',
    maxMonthlyNetRentCents: 9000,
    minCondition: 'fair',
    preferredTermMonths: 12,
    neededBy: '2026-12-31',
    quantity: 1,
    actor: 'cust-norvi',
    asOf: AS_OF,
  });
  if (!joined.ok) throw new Error(joined.reason);
  await executeSecondLife(db, { assetId: 'ebike-007', actor: 'staff', asOf: AS_OF });
  await declineOffer(db, { entryId: 'wait-02', actor: 'cust-pekka', asOf: AS_OF });
  const accepted = await acceptOffer(db, {
    entryId: joined.entry.id,
    actor: 'cust-norvi',
    asOf: AS_OF,
  });
  if (!accepted.ok) throw new Error(accepted.reason);

  const state = await db.application.findUniqueOrThrow({ where: { id: accepted.applicationId } });
  let next: string | null = 'q_customer_type';
  while (next !== null) {
    if (!(next in NORVI_SCRIPT)) throw new Error(`no scripted answer for ${next}`);
    const result = await answerQuestion(db, {
      applicationId: state.id,
      questionId: next,
      answer: NORVI_SCRIPT[next] as never,
      actor: 'cust-norvi',
      asOf: AS_OF,
    });
    if (!result.ok) throw new Error(`${next}: ${result.reason}`);
    next = result.state.nextQuestionId;
  }
  const submitted = await submitApplication(db, {
    applicationId: state.id,
    startDate: AS_OF,
    actor: 'cust-norvi',
    asOf: AS_OF,
  });
  if (!submitted.ok) throw new Error(submitted.reason);
  expect(submitted.state.application.status).toBe('awaiting_signature');
  return { test, applicationId: state.id, entryId: joined.entry.id };
}

const activeOffer = (db: TestDb['db']) =>
  db.reservation.findFirst({
    where: { asset_id: 'ebike-007', kind: 'waitlist_offer', active: true },
  });

describe('signing as the signatory', () => {
  let ctx: Awaited<ReturnType<typeof norviApplication>>;
  beforeAll(async () => {
    ctx = await norviApplication();
  });
  afterAll(async () => {
    await ctx.test.cleanup();
  });

  it('closes the waiting-list entry as leased', async () => {
    const { db } = ctx.test;
    expect(await activeOffer(db)).not.toBeNull();

    const signed = await signApplication(db, {
      applicationId: ctx.applicationId,
      startDate: AS_OF,
      actor: 'ceo@norvi.example.com',
      asOf: AS_OF,
    });
    if (!signed.ok) throw new Error(signed.reason);
    const entry = await db.waitlistEntry.findUniqueOrThrow({ where: { id: ctx.entryId } });
    expect(entry.status).toBe('leased');
  });
});

describe('staff decline', () => {
  let ctx: Awaited<ReturnType<typeof norviApplication>>;
  beforeAll(async () => {
    ctx = await norviApplication();
  });
  afterAll(async () => {
    await ctx.test.cleanup();
  });

  it('keeps the item held for the offer, which lapses and is passed on', async () => {
    const { db } = ctx.test;
    const declined = await declineApplication(db, {
      applicationId: ctx.applicationId,
      actor: 'staff',
    });
    if (!declined.ok) throw new Error(declined.reason);
    expect(await activeOffer(db)).not.toBeNull();
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-007' } });
    expect(asset.status).toBe('reserved');

    const expired = await listExpiredOffers(db, '2026-11-13');
    expect(expired.map((e) => e.entry.id)).toContain(ctx.entryId);
  });
});
