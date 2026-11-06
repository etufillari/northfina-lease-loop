// The whole waiting-list loop against a real database, on the data pack's own people:
// the desk offers ebike-008 to Sanna (wait-01, a student) and she leases it through the normal
// flow at the offered rent (€11.94 a month, its market value after the work); Pekka (wait-02, a courier) declines ebike-007, which passes to
// Aino, who joined the list in the app; wait-13's offer runs out and passes to the bakery.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers, loadSecondLifeDemand } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { answerQuestion, startApplication, submitApplication } from './applications';
import { seedAssets } from './assets';
import { signApplication } from './contracts';
import { seedCustomers } from './customers';
import { buildLiveQuote, secondLifePrices } from './quotes';
import { executeSecondLife } from './second-life';
import {
  acceptOffer,
  declineOffer,
  expireOffer,
  joinWaitlist,
  leaveWaitlist,
  listExpiredOffers,
} from './waitlist-actions';
import { customerWaitlist, staffWaitlist } from './waitlist-views';
import { seedWaitlist } from './waitlist';

let db: Awaited<ReturnType<typeof createTestDb>>['db'];
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  await seedAssets(db, await loadAssets());
  await seedCustomers(db, await loadCustomers());
  await seedWaitlist(db, await loadSecondLifeDemand());
  for (const assetId of ['ebike-007', 'ebike-008', 'ebike-011']) {
    const result = await executeSecondLife(db, { assetId, actor: 'staff', asOf: AS_OF });
    if (!result.ok) throw new Error(`${assetId}: ${result.reason}`);
  }
});
afterAll(async () => {
  await cleanup();
});

const AS_OF = '2026-11-05';

/** Answers what applies; a question the flow no longer asks is skipped. */
async function answerAll(applicationId: string, actor: string, answers: Array<[string, unknown]>) {
  for (const [questionId, value] of answers) {
    const result = await answerQuestion(db, {
      applicationId,
      questionId,
      answer: value as never,
      actor,
      asOf: AS_OF,
    });
    if (!result.ok && result.reason !== 'question_not_applicable') {
      throw new Error(`${questionId}: ${result.reason}`);
    }
  }
}

const joinAino = (overrides: Partial<Parameters<typeof joinWaitlist>[1]> = {}) =>
  joinWaitlist(db, {
    customerId: 'cust-aino',
    category: 'e_bike',
    maxMonthlyNetRentCents: 9000,
    minCondition: 'fair',
    preferredTermMonths: 12,
    neededBy: '2026-12-31',
    quantity: 1,
    actor: 'cust-aino',
    asOf: AS_OF,
    ...overrides,
  });

describe('card 10: Sanna leases ebike-008 from the waiting list', () => {
  it('shows her the offer: the item, the rent and how long it is held', async () => {
    const [view] = await customerWaitlist(db, 'cust-sanna', AS_OF);
    expect(view!.entry).toMatchObject({ id: 'wait-01', status: 'offered' });
    expect(view!.position).toBeNull();
    expect(view!.offer).toEqual({
      items: [
        {
          assetId: 'ebike-008',
          make: 'Kettu Bikes',
          model: 'Urban 1',
          condition: 'good',
          monthlyNetRentCents: 1194,
        },
      ],
      until: '2026-11-08',
      expired: false,
    });
  });

  it('keeps the item for her: nobody else can apply, and only she can accept', async () => {
    const other = await startApplication(db, {
      assetIds: ['ebike-008'],
      downPaymentCents: 0,
      termMonths: 24,
      customerId: 'cust-aino',
      actor: 'cust-aino',
      asOf: AS_OF,
    });
    expect(other).toEqual({ ok: false, reason: 'asset_unavailable' });
    expect(await acceptOffer(db, { entryId: 'wait-01', actor: 'cust-aino', asOf: AS_OF })).toEqual({
      ok: false,
      reason: 'not_yours',
    });
  });

  it('accepting starts a normal application at the second-life price and the offered rent', async () => {
    const accepted = await acceptOffer(db, {
      entryId: 'wait-01',
      actor: 'cust-sanna',
      asOf: AS_OF,
    });
    if (!accepted.ok) throw new Error(accepted.reason);
    const application = await db.application.findUniqueOrThrow({
      where: { id: accepted.applicationId },
      include: { quote: true },
    });
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-008' } });
    expect(application.quote).toMatchObject({
      financed_cents: asset.second_life_price_cents,
      down_payment_cents: 0,
      term_months: 24,
      monthly_net_rent_cents: 1194,
    });
    const [view] = await customerWaitlist(db, 'cust-sanna', AS_OF);
    expect(view!.entry.status).toBe('accepted');
    expect(view!.applicationId).toBe(accepted.applicationId);

    await answerAll(accepted.applicationId, 'cust-sanna', [
      ['q_customer_type', 'consumer'],
      ['q_full_name', 'Sanna Mäkelä'],
      ['q_birth_date', '2004-11-02'],
      ['q_email', 'sanna.makela@example.com'],
      ['q_country', 'FI'],
      ['q_employment', 'student'],
      ['q_monthly_income', 90_000],
      ['q_usage_purpose', 'commuting'],
    ]);
    const submitted = await submitApplication(db, {
      applicationId: accepted.applicationId,
      startDate: AS_OF,
      actor: 'cust-sanna',
      asOf: AS_OF,
    });
    if (!submitted.ok) throw new Error(submitted.reason);
    const signed = await signApplication(db, {
      applicationId: accepted.applicationId,
      startDate: AS_OF,
      actor: 'cust-sanna',
      asOf: AS_OF,
    });
    if (!signed.ok) throw new Error(signed.reason);

    const entry = await db.waitlistEntry.findUniqueOrThrow({ where: { id: 'wait-01' } });
    expect(entry.status).toBe('leased');
    const events = await db.assetEvent.findMany({
      where: { asset_id: 'ebike-008' },
      orderBy: { id: 'asc' },
    });
    expect(events.map((e) => e.type)).toEqual([
      'refurbished',
      'offered_to_waiter',
      'offer_accepted',
      'leased',
    ]);
  });
});

describe('joining the list in the app', () => {
  it('Aino joins for an e-bike and gets a place in the queue', async () => {
    const joined = await joinAino();
    if (!joined.ok) throw new Error(joined.reason);
    expect(joined.entry).toMatchObject({
      customer_id: 'cust-aino',
      who: 'Aino Virtanen',
      joined_on: AS_OF,
      status: 'waiting',
    });
    const [view] = await customerWaitlist(db, 'cust-aino', AS_OF);
    // Everyone still waiting for an e-bike who joined before her, plus one.
    const ahead = (await staffWaitlist(db, AS_OF)).filter(
      (v) => v.entry.category === 'e_bike' && v.position !== null && v.entry.id !== view!.entry.id
    );
    expect(view!.position).toBe(ahead.length + 1);
  });

  it('refuses a second place in the same category, a past deadline and an unpriced term', async () => {
    expect(await joinAino()).toEqual({ ok: false, reason: 'already_on_list' });
    expect(await joinAino({ category: 'laptop', neededBy: '2026-11-01' })).toEqual({
      ok: false,
      reason: 'deadline_in_past',
    });
    expect(await joinAino({ category: 'laptop', preferredTermMonths: 18 })).toEqual({
      ok: false,
      reason: 'unknown_term',
    });
    expect(await joinAino({ customerId: 'nobody' })).toEqual({
      ok: false,
      reason: 'unknown_customer',
    });
  });

  it('lets a customer leave, but only their own entry', async () => {
    const joined = await joinAino({ category: 'laptop', minCondition: 'good' });
    if (!joined.ok) throw new Error(joined.reason);
    const input = { entryId: joined.entry.id, asOf: AS_OF };
    expect(await leaveWaitlist(db, { ...input, actor: 'cust-pekka' })).toEqual({
      ok: false,
      reason: 'not_yours',
    });
    expect(await leaveWaitlist(db, { ...input, actor: 'cust-aino' })).toEqual({ ok: true });
    const entry = await db.waitlistEntry.findUniqueOrThrow({ where: { id: joined.entry.id } });
    expect(entry).toMatchObject({ status: 'removed', left_reason: 'left' });
  });
});

describe('card 9: Pekka declines ebike-007', () => {
  it('passes it to the next person who fits: Aino, at the price the desk set', async () => {
    const declined = await declineOffer(db, {
      entryId: 'wait-02',
      actor: 'cust-pekka',
      asOf: AS_OF,
    });
    if (!declined.ok) throw new Error(declined.reason);
    const aino = await db.waitlistEntry.findFirstOrThrow({
      where: { customer_id: 'cust-aino', category: 'e_bike' },
    });
    expect(declined.passedOn).toEqual([
      { assetId: 'ebike-007', outcome: { kind: 'offer', waiterId: aino.id } },
    ]);
    const pekka = await db.waitlistEntry.findUniqueOrThrow({ where: { id: 'wait-02' } });
    expect(pekka).toMatchObject({ status: 'removed', left_reason: 'declined' });

    const [view] = await customerWaitlist(db, 'cust-aino', AS_OF).then((views) =>
      views.filter((v) => v.entry.id === aino.id)
    );
    expect(view!.offer?.items[0]).toMatchObject({
      assetId: 'ebike-007',
      monthlyNetRentCents: 6497,
    });
  });

  it('quotes the refurbished item at its second-life price, not the price list', async () => {
    const live = await buildLiveQuote({
      assetIds: ['ebike-007'],
      downPaymentCents: 0,
      termMonths: 12,
      asOf: AS_OF,
      secondLifePricesCents: await secondLifePrices(db, ['ebike-007']),
    });
    if (!live.ok) throw new Error(live.reason);
    expect(live.live.secondLifeAssetIds).toEqual(['ebike-007']);
    expect(live.live.listPriceCents).toBe(115_976);
    expect(live.live.quote.monthlyNetRentCents).toBe(6497);
  });
});

describe('an offer nobody answers', () => {
  it('is not expired while its 3-day hold lasts', async () => {
    expect(await listExpiredOffers(db, '2026-11-08')).toEqual([]);
    expect(
      await expireOffer(db, { entryId: 'wait-13', actor: 'staff', asOf: '2026-11-08' })
    ).toEqual({ ok: false, reason: 'not_expired' });
  });

  it('passes ebike-011 from wait-13 to the bakery (wait-04) once the hold has run out', async () => {
    const later = '2026-11-13';
    const expired = await listExpiredOffers(db, later);
    expect(expired.map((e) => [e.entry.id, e.assetIds])).toContainEqual(['wait-13', ['ebike-011']]);

    const result = await expireOffer(db, { entryId: 'wait-13', actor: 'staff', asOf: later });
    if (!result.ok) throw new Error(result.reason);
    expect(result.passedOn).toEqual([
      { assetId: 'ebike-011', outcome: { kind: 'offer', waiterId: 'wait-04' } },
    ]);
    const entry = await db.waitlistEntry.findUniqueOrThrow({ where: { id: 'wait-13' } });
    expect(entry).toMatchObject({ status: 'removed', left_reason: 'offer_expired' });
    const audit = await db.auditLog.count({
      where: { action: 'waitlist.offer_expired', entity_id: 'wait-13' },
    });
    expect(audit).toBe(1);
  });
});
