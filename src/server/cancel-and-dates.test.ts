// The fixes around the application's start date and walking away before signing:
// - submission refuses a start date in the past or over 3 months out, and persists it;
// - the customer can cancel an approved application: items go straight back to available;
// - a waiting-list entry the customer left is not shown to them again.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import {
  answerQuestion,
  cancelApplication,
  startApplication,
  submitApplication,
} from './applications';
import { seedAssets } from './assets';
import { seedCustomers } from './customers';
import { joinWaitlist, leaveWaitlist } from './waitlist-actions';
import { customerWaitlist, staffWaitlist } from './waitlist-views';

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

const AINO = 'cust-aino';
const AS_OF = '2026-11-05';

/** Starts and fully answers a consumer application for one asset. */
async function draftApplication(assetId: string) {
  const started = await startApplication(db, {
    assetIds: [assetId],
    downPaymentCents: 0,
    termMonths: 36,
    customerId: AINO,
    actor: AINO,
    asOf: AS_OF,
  });
  if (!started.ok) throw new Error(started.reason);
  const id = started.state.application.id;
  const answers: Array<[string, unknown]> = [
    ['q_customer_type', 'consumer'],
    ['q_full_name', 'Aino Virtanen'],
    ['q_birth_date', '1997-04-12'],
    ['q_email', 'aino.virtanen@example.com'],
    ['q_country', 'FI'],
    ['q_employment', 'employed'],
    ['q_monthly_income', 320_000],
    ['q_usage_purpose', 'commuting'],
  ];
  for (const [questionId, answer] of answers) {
    const result = await answerQuestion(db, {
      applicationId: id,
      questionId,
      answer: answer as never,
      actor: AINO,
      asOf: AS_OF,
    });
    if (!result.ok) throw new Error(`answer ${questionId}: ${result.reason}`);
  }
  return id;
}

describe('the start date at submission', () => {
  it('refuses a date in the past and a date over 3 months ahead', async () => {
    const id = await draftApplication('ebike-003');
    expect(
      await submitApplication(db, {
        applicationId: id,
        startDate: '2026-11-04',
        actor: AINO,
        asOf: AS_OF,
      })
    ).toEqual({ ok: false, reason: 'bad_start_date' });
    expect(
      await submitApplication(db, {
        applicationId: id,
        startDate: '2027-02-06',
        actor: AINO,
        asOf: AS_OF,
      })
    ).toEqual({ ok: false, reason: 'bad_start_date' });

    // Exactly 3 months out is still fine, and the chosen date is persisted.
    const result = await submitApplication(db, {
      applicationId: id,
      startDate: '2027-02-05',
      actor: AINO,
      asOf: AS_OF,
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.application.startDate).toBe('2027-02-05');
    // Clean up: free the asset for the next test block.
    await cancelApplication(db, { applicationId: id, actor: AINO, asOf: AS_OF });
  });
});

describe('cancelling before signing', () => {
  it('a draft cannot be cancelled, only a decided application', async () => {
    const id = await draftApplication('ebike-004');
    expect(await cancelApplication(db, { applicationId: id, actor: AINO, asOf: AS_OF })).toEqual({
      ok: false,
      reason: 'not_cancellable',
    });
    const submitted = await submitApplication(db, {
      applicationId: id,
      startDate: AS_OF,
      actor: AINO,
      asOf: AS_OF,
    });
    if (!submitted.ok) throw new Error(submitted.reason);
    expect(submitted.state.application.status).toBe('approved');

    // Someone else cannot cancel it.
    expect(
      await cancelApplication(db, { applicationId: id, actor: 'cust-norvi', asOf: AS_OF })
    ).toEqual({ ok: false, reason: 'not_yours' });

    const cancelled = await cancelApplication(db, { applicationId: id, actor: AINO, asOf: AS_OF });
    if (!cancelled.ok) throw new Error(cancelled.reason);
    expect(cancelled.state.application.status).toBe('cancelled');

    // The item is available at once — no life added, no reservation left.
    const asset = await db.asset.findUnique({ where: { id: 'ebike-004' } });
    expect(asset?.status).toBe('available');
    expect(asset?.previous_lives).toBe(
      (await loadAssets()).find((a) => a.id === 'ebike-004')!.previous_lives
    );
    expect(await db.reservation.count({ where: { asset_id: 'ebike-004', active: true } })).toBe(0);
    // And it cannot be cancelled twice.
    expect(await cancelApplication(db, { applicationId: id, actor: AINO, asOf: AS_OF })).toEqual({
      ok: false,
      reason: 'not_cancellable',
    });
  });
});

describe('leaving the waiting list', () => {
  it('hides the left entry from the customer but keeps it for staff', async () => {
    const joined = await joinWaitlist(db, {
      customerId: AINO,
      category: 'laptop',
      maxMonthlyNetRentCents: 5_000,
      minMonthlyNetRentCents: 1_000,
      minCondition: 'good',
      preferredTermMonths: 24,
      neededBy: '2026-12-01',
      quantity: 1,
      actor: AINO,
      asOf: AS_OF,
    });
    if (!joined.ok) throw new Error(joined.reason);
    expect(joined.entry.min_monthly_net_rent_cents).toBe(1_000);
    expect((await customerWaitlist(db, AINO, AS_OF)).map((v) => v.entry.id)).toContain(
      joined.entry.id
    );

    const left = await leaveWaitlist(db, { entryId: joined.entry.id, actor: AINO, asOf: AS_OF });
    expect(left).toEqual({ ok: true });
    expect((await customerWaitlist(db, AINO, AS_OF)).map((v) => v.entry.id)).not.toContain(
      joined.entry.id
    );
    expect((await staffWaitlist(db, AS_OF)).map((v) => v.entry.id)).toContain(joined.entry.id);
  });
});
