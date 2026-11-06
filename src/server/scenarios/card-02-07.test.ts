// Cards 2 to 7 end to end on a real migrated database, through the services the routes call.
// Every date is passed in as the request's day would be; the demo clock is the caller's.
import { forbidden, refusal } from '../../../tests/helpers/authz';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { quoteAndApply, sign, signedContract } from '../../../tests/helpers/journey';
import { seedPack } from '../../../tests/helpers/invoice-fixture';
import { resetDb } from '../../../tests/helpers/reset-db';
import { createTestDb } from '../../../tests/helpers/test-db';
import { withProductionHandlers } from '../../../tests/helpers/with-handlers';
import { ADMIN_ACTOR } from '../actor';
import { decideApplication } from '../applications';
import { getAsset } from '../assets';
import { listInvoices } from '../invoices';
import type { PrismaClient } from '../prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetDb(db);
  await seedPack(db);
});
withProductionHandlers();

describe('card 2: the price lock', () => {
  it('quoted on v1 on 5 Nov, signed on 6 Nov under v2: the contract keeps 9 627 and says why', async () => {
    const trip = {
      customerId: 'cust-aino',
      assetId: 'laptop-004',
      termMonths: 36,
      quoteOn: '2026-11-05',
    };
    const signed = await signedContract(db, trip, '2026-11-06');
    expect(signed.quote.breakdown).toMatchObject({ priceListVersion: 1, monthlyNetCents: 9_627 });
    expect(signed.contract).toMatchObject({
      signedOn: '2026-11-06',
      monthlyNetCents: 9_627,
      priceListVersion: 1,
    });
    expect(signed.priceLock).toEqual({
      code: 'price_locked_from_quote',
      params: {
        quoteDate: '2026-11-05',
        priceListVersion: 1,
        currentPriceListVersion: 2,
        currentMonthlyNetCents: 8_857,
      },
    });
    const [first] = await listInvoices(db, signed.contract.id);
    expect(first?.netCents).toBe(9_627);
  });
});

describe('card 3: tax is not price', () => {
  it('ebike-001, 24 months from 15 Sep 2026 (demo day): December gross 8 731, January 8 766', async () => {
    const day = '2026-09-15';
    const { contract } = await signedContract(db, {
      customerId: 'cust-aino',
      assetId: 'ebike-001',
      termMonths: 24,
      quoteOn: day,
    });
    expect(contract).toMatchObject({ startDate: day, monthlyNetCents: 6_957 });
    const invoices = await listInvoices(db, contract.id);
    const december = invoices.find((i) => i.issueDate === '2026-12-15');
    const january = invoices.find((i) => i.issueDate === '2027-01-15');
    expect(december).toMatchObject({
      netCents: 6_957,
      vatRateBasisPoints: 2_550,
      grossCents: 8_731,
    });
    expect(january).toMatchObject({
      netCents: 6_957,
      vatRateBasisPoints: 2_600,
      grossCents: 8_766,
    });
  });
});

describe('card 4: the calendar traps', () => {
  it('laptop-001, 36 months from 31 Jan 2026: due 28 Feb 2026 and 29 Feb 2028, ends 30 Jan 2029', async () => {
    const day = '2026-01-31';
    const { contract } = await signedContract(db, {
      customerId: 'cust-aino',
      assetId: 'laptop-001',
      termMonths: 36,
      quoteOn: day,
    });
    expect(contract).toMatchObject({
      startDate: day,
      endDate: '2029-01-30',
      monthlyNetCents: 3_432,
    });
    const due = (await listInvoices(db, contract.id)).map((i) => i.dueDate);
    expect(due).toHaveLength(36);
    expect(due[0]).toBe('2026-01-31');
    expect(due).toEqual(expect.arrayContaining(['2026-02-28', '2028-02-29']));
    expect(due.at(-1)).toBe('2028-12-31');
  });
});

describe('cards 5, 6 and 7: an application that is not approved cannot be signed', () => {
  it('card 5: Mikko is rejected (too young) and signing is refused with the decision', async () => {
    const { application } = await quoteAndApply(db, {
      customerId: 'cust-mikko',
      assetId: 'laptop-008',
      termMonths: 36,
      quoteOn: '2026-11-05',
    });
    expect(application.decision).toBe('rejected');
    expect(application.reasons).toEqual([
      { code: 'too_young', params: { birthDate: '2009-03-10', eighteenOn: '2027-03-10' } },
    ]);
    expect(await sign(db, application.id, 'cust-mikko', '2026-11-05')).toEqual({
      ok: false,
      reason: { code: 'application_not_approved', params: { decision: 'rejected' } },
    });
    expect((await getAsset(db, 'laptop-008'))?.status).toBe('available');
  });

  it('card 6: one ebike-004 for Norvi awaits the signatory; the applicant cannot sign', async () => {
    const { quote, application } = await quoteAndApply(db, {
      customerId: 'cust-norvi',
      assetId: 'ebike-004',
      termMonths: 36,
      quoteOn: '2026-11-05',
    });
    expect(quote.breakdown).toMatchObject({
      quantity: 1,
      financedCents: 549_000,
      band: 'B',
      monthlyNetCents: 15_144,
    });
    expect(application.decision).toBe('awaiting_signatory');
    expect(application.reasons.map((r) => r.code)).toEqual(['signatory_needed']);
    expect(await sign(db, application.id, 'cust-norvi', '2026-11-05')).toEqual({
      ok: false,
      reason: refusal('signatory_required', 'sign_contract'),
    });
  });

  it('card 7: Haapala (PEP) is in manual review; signing is refused until an admin decides', async () => {
    const { quote, application } = await quoteAndApply(db, {
      customerId: 'cust-haapala',
      assetId: 'farm-002',
      termMonths: 48,
      downPaymentCents: 2_000_000,
      quoteOn: '2026-11-05',
    });
    expect(quote.breakdown).toMatchObject({
      financedCents: 12_500_000,
      band: 'D',
      monthlyNetCents: 272_038,
    });
    expect(application.decision).toBe('manual_review');
    expect(application.reasons).toEqual([{ code: 'pep', params: {} }]);
    expect(await sign(db, application.id, 'cust-haapala', '2026-11-05')).toEqual({
      ok: false,
      reason: { code: 'application_not_approved', params: { decision: 'manual_review' } },
    });
    // Only the admin decides a manual review; the customer cannot approve themself.
    expect(
      await decideApplication(db, {
        id: application.id,
        decision: 'approved',
        reviewedBy: 'cust-haapala',
        today: '2026-11-05',
        actor: 'cust-haapala',
      })
    ).toEqual(forbidden('admin_only', 'decide_application'));
    const decided = await decideApplication(db, {
      id: application.id,
      decision: 'approved',
      reviewedBy: ADMIN_ACTOR,
      today: '2026-11-05',
      actor: ADMIN_ACTOR,
    });
    expect(decided).toMatchObject({ ok: true, application: { decision: 'approved' } });
  });
});
