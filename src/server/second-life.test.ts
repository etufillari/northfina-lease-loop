// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../tests/helpers/test-db';
import { loadAssets } from '@/data/load';
import { seedAssets } from './assets';
import { listAuditLog } from './audit';
import { endLease } from './contract-endings';
import { getContract, type LeaseDataPack } from './contracts';
import { quoteAndSign } from '../../tests/helpers/quote-and-sign';
import { loadLeaseDataPack } from './lease-data';
import { listedPrices } from './listed-prices';
import type { PrismaClient } from './prisma-client';
import {
  loadSecondLifeDataPack,
  relistAsset,
  secondLifeView,
  type SecondLifeDataPack,
} from './second-life';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let lease: LeaseDataPack;
let data: SecondLifeDataPack;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  [lease, data] = await Promise.all([loadLeaseDataPack(), loadSecondLifeDataPack()]);
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await db.secondLifeListing.deleteMany();
  await db.contractEnding.deleteMany();
  await db.contract.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
});

const TODAY = '2026-11-06';

// Aino's facts from customers.json; under 200 000 financed the income question is not asked.
const ainoAnswers = {
  q_customer_type: 'consumer',
  q_full_name: 'Aino Virtanen',
  q_birth_date: '1997-04-12',
  q_email: 'aino.virtanen@example.com',
  q_country: 'FI',
  q_employment: 'employed',
  q_monthly_income: 320_000,
  q_usage_purpose: 'commuting',
};
const signAsAino = (assetId: string, termMonths: number, today = TODAY) =>
  quoteAndSign(db, lease, {
    assetId,
    customerId: 'cust-aino',
    termMonths,
    downPaymentCents: 0,
    answers: ainoAnswers,
    today,
    actor: 'cust-aino',
  });

describe('secondLifeView', () => {
  it('card 9: ebike-007 is suggested as it is (fair) for wait-02, with good and like new too', async () => {
    const view = await secondLifeView(db, data, 'ebike-007', TODAY);
    expect(view?.match.ranked[0]).toMatchObject({ requestId: 'wait-02', monthlyRentCents: 6_497 });
    expect(view?.suggested).toBe('fair');
    expect(view?.firstLeasePriceListVersion).toBe(1);
    // Values from the hand table in src/domain/second-life.test.ts.
    expect(view?.options.map((o) => [o.target, o.valuation.listPriceCents])).toEqual([
      ['fair', 115_976],
      ['good', 151_661],
      ['like_new', 169_504],
    ]);
    expect(view?.options[0]?.rents).toContainEqual({ termMonths: 12, monthlyNetRentCents: 6_497 });
    expect(view?.passedOnTo).toBeNull();
  });

  it('is null for an item that is not returned', async () => {
    expect(await secondLifeView(db, data, 'ebike-003', TODAY)).toBeNull();
  });
});

describe('relistAsset', () => {
  it('card 9: refurbishes ebike-007, prices it at 115 976 and makes it available, audited', async () => {
    const result = await relistAsset(db, data, {
      assetId: 'ebike-007',
      target: 'fair',
      today: TODAY,
      actor: 'staff',
    });
    expect(result).toMatchObject({
      ok: true,
      asset: { status: 'available', condition: 'fair', usage: { value: 0 }, previous_lives: 1 },
    });
    expect(await listedPrices(db)).toEqual({ 'ebike-007': 115_976 });
    const listing = await db.secondLifeListing.findFirstOrThrow();
    expect(listing).toMatchObject({
      asset_id: 'ebike-007',
      condition_before: 'fair',
      usage_before: 18_400,
      usage_after: 0,
      refurbishment_cents: 39_500,
    });
    const [audit] = await listAuditLog(db);
    expect(audit).toMatchObject({ action: 'asset.relisted', entity_id: 'ebike-007' });
    expect(audit?.details).toMatchObject({ listPriceCents: 115_976, asOf: TODAY });
  });

  it('card 9 leased again: signing prices from the second-life price, 6 497 a month for 12 m', async () => {
    await relistAsset(db, data, { assetId: 'ebike-007', target: 'fair', today: TODAY, actor: 's' });
    const signed = await signAsAino('ebike-007', 12);
    expect(signed).toMatchObject({
      ok: true,
      contract: { listPriceCents: 115_976, financedCents: 115_976, monthlyNetRentCents: 6_497 },
    });
  });

  it('card 10: ebike-008 (2 lives) re-listed good at 32 601, leased for its third life', async () => {
    const relisted = await relistAsset(db, data, {
      assetId: 'ebike-008',
      target: 'good',
      today: TODAY,
      actor: 's',
    });
    // Only the 4 500 inspection; previous_lives stays 2 until this third life ends (D-029).
    expect(relisted).toMatchObject({
      ok: true,
      asset: { previous_lives: 2, condition: 'good', usage: { value: 9_800 } },
      valuation: { refurbishmentCents: 4_500, listPriceCents: 32_601 },
    });
    const signed = await signAsAino('ebike-008', 36);
    expect(signed).toMatchObject({ ok: true, contract: { monthlyNetRentCents: 933 } });
  });

  it('refuses a target below good when nobody waiting accepts fair, and writes nothing', async () => {
    // ebike-008 is good: fair would be a downgrade, so it is not an option.
    expect(
      await relistAsset(db, data, {
        assetId: 'ebike-008',
        target: 'fair',
        today: TODAY,
        actor: 's',
      })
    ).toEqual({ ok: false, reason: 'target_not_allowed' });
    expect(await db.secondLifeListing.count()).toBe(0);
    expect(await listAuditLog(db)).toEqual([]);
  });

  it('refuses an item that is not returned, or does not exist', async () => {
    const relist = (assetId: string) =>
      relistAsset(db, data, { assetId, target: 'good', today: TODAY, actor: 's' });
    expect(await relist('ebike-003')).toEqual({ ok: false, reason: 'asset_not_returned' });
    expect(await relist('nope-001')).toEqual({ ok: false, reason: 'asset_not_found' });
    // Relisting twice: the second time it is available, not returned.
    await relist('ebike-008');
    expect(await relist('ebike-008')).toEqual({ ok: false, reason: 'asset_not_returned' });
  });

  it('a whole loop: lease, pass on, re-list, lease again; the first contract never changes', async () => {
    const first = await signAsAino('ebike-003', 12, '2026-11-05');
    if (!first.ok) throw new Error(first.reason);
    const before = await getContract(db, first.id);
    const ended = await endLease(db, lease, {
      contractId: first.id,
      choice: { kind: 'pass_on', nextLessee: 'cust-sanna', condition: 'good', usageValue: 2_400 },
      today: '2027-11-05',
      actor: 'cust-aino',
    });
    expect(ended.ok).toBe(true);

    const view = await secondLifeView(db, data, 'ebike-003', '2027-11-05');
    expect(view?.passedOnTo).toBe('cust-sanna');
    const relisted = await relistAsset(db, data, {
      assetId: 'ebike-003',
      target: 'good',
      today: '2027-11-05',
      actor: 's',
    });
    // One life counted, at the ending only.
    expect(relisted).toMatchObject({ ok: true, asset: { previous_lives: 1 } });
    expect(relisted.ok && relisted.valuation.listPriceCents).toBeLessThan(389_000);

    const second = await signAsAino('ebike-003', 24, '2027-11-05');
    expect(second.ok).toBe(true);
    expect(await getContract(db, first.id)).toEqual(before);
  });
});
