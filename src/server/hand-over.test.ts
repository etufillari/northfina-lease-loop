// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { quoteAndSign } from '../../tests/helpers/quote-and-sign';
import { createTestDb } from '../../tests/helpers/test-db';
import { loadAssets } from '@/data/load';
import { listAuditLog } from './audit';
import { seedAssets } from './assets';
import { endLease } from './contract-endings';
import { getContract, type LeaseDataPack } from './contracts';
import { handOver } from './hand-over';
import { loadLeaseDataPack } from './lease-data';
import { getQuote } from './quotes';
import { loadSecondLifeDataPack, type SecondLifeDataPack } from './second-life';
import type { PrismaClient } from './prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let lease: LeaseDataPack;
let secondLife: SecondLifeDataPack;
let contractId: number;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  [lease, secondLife] = await Promise.all([loadLeaseDataPack(), loadSecondLifeDataPack()]);
});
afterAll(async () => {
  await cleanup();
});

// A 12-month lease of ebike-003 signed on 2 Jan 2026; the handover day is 2 Jan 2027.
beforeEach(async () => {
  await db.secondLifeListing.deleteMany();
  await db.contractEnding.deleteMany();
  await db.contract.deleteMany();
  await db.quote.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
  const signed = await quoteAndSign(db, lease, {
    assetId: 'ebike-003',
    customerId: 'cust-aino',
    termMonths: 12,
    downPaymentCents: 0,
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
    today: '2026-01-02',
    actor: 'cust-aino',
  });
  if (!signed.ok) throw new Error(`setup failed: ${signed.reason}`);
  contractId = signed.id;
});

const end = async (choice: Parameters<typeof endLease>[2]['choice']) => {
  const ended = await endLease(
    db,
    { ...lease, secondLife },
    { contractId, choice, today: '2026-12-15', actor: 'cust-aino' }
  );
  if (!ended.ok) throw new Error(`setup failed: ${ended.reason}`);
};
// Passed on to the small bakery (wait-04: good, 24 months, by 5 Jan 2027), good with 3 000 km.
const passOnToBakery = () =>
  end({ kind: 'pass_on', condition: 'good', usageValue: 3_000, nextLessee: 'wait-04' });

const handOverOn = (today: string) => handOver(db, { lease, secondLife }, { contractId, today });

/** Everything a refusal must leave as it was. */
const snapshot = async () => ({
  asset: await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } }),
  listings: await db.secondLifeListing.count(),
  quotes: await db.quote.count(),
  audit: await db.auditLog.count(),
});

describe('handOver', () => {
  it('re-lists the bike for the bakery and stores their 24-month quote on the handover day', async () => {
    await passOnToBakery();
    const contractBefore = await getContract(db, contractId);

    const result = await handOverOn('2027-01-02');
    if (!result.ok) throw new Error(result.reason);

    expect(await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } })).toMatchObject({
      status: 'available',
      condition: 'good',
      usage_value: 3_000,
    });
    expect(await db.secondLifeListing.count()).toBe(1);

    const stored = await getQuote(db, result.quoteId);
    // By hand: first-lease price 389 000 (price list v1). Age on 2 Jan 2027 is 12 months from its
    // first lease new on 2 Jan 2026 (D-042): e-bike curve 70 %. Good × 0.85. 3 000 km = 3 steps
    // × −2 % = −6 % (no battery reset below 15 000 km). 389 000 × 0.70 × 0.85 × 0.94 = 217 567.7
    // → 217 568. Band B, 24 months: 217 568 × 0.035532 = 7 730.63 → 7 731 cents (77.31 €).
    expect(stored?.quote).toMatchObject({
      assetId: 'ebike-003',
      quoteDate: '2027-01-02',
      termMonths: 24,
      downPaymentCents: 0,
      listPriceCents: 217_568,
      monthlyNetRentCents: 7_731,
    });
    expect(stored?.contractId).toBeNull();

    const [quoteRow, relistRow] = await listAuditLog(db, 2);
    expect(relistRow).toMatchObject({ action: 'asset.relisted', actor: 'back-office' });
    expect(quoteRow).toMatchObject({
      action: 'quote.created',
      actor: 'customer',
      entity_id: String(result.quoteId),
    });
    expect(await getContract(db, contractId)).toEqual(contractBefore);
  });

  it('gives a named persona the cheapest condition and the term they took over', async () => {
    await end({ kind: 'pass_on', condition: 'good', usageValue: 3_000, nextLessee: 'cust-sanna' });
    const result = await handOverOn('2027-01-02');
    if (!result.ok) throw new Error(result.reason);
    // Good is the lowest it can be listed at (fair only with a waiting-list taker who accepts
    // fair, and never a downgrade). Same 217 568 list price; band B, 12 months:
    // 217 568 × 0.054799 = 11 922.51 → 11 923 cents.
    expect((await getQuote(db, result.quoteId))?.quote).toMatchObject({
      termMonths: 12,
      monthlyNetRentCents: 11_923,
    });
  });

  it('refuses before the handover day and writes nothing', async () => {
    await passOnToBakery();
    const before = await snapshot();
    expect(await handOverOn('2026-12-15')).toEqual({
      ok: false,
      reason: 'too_early',
      opensOn: '2027-01-02',
    });
    expect(await snapshot()).toEqual(before);
  });

  it('refuses a lease that was returned, not passed on', async () => {
    await end({ kind: 'return', condition: 'good', usageValue: 3_000 });
    const before = await snapshot();
    expect(await handOverOn('2027-01-02')).toEqual({ ok: false, reason: 'not_passed_on' });
    expect(await snapshot()).toEqual(before);
  });

  it('refuses a second hand-over and writes nothing more', async () => {
    await passOnToBakery();
    expect((await handOverOn('2027-01-02')).ok).toBe(true);
    const before = await snapshot();
    expect(await handOverOn('2027-01-02')).toEqual({ ok: false, reason: 'already_handed_over' });
    expect(await snapshot()).toEqual(before);
  });

  it('refuses a contract that does not exist', async () => {
    expect(
      await handOver(db, { lease, secondLife }, { contractId: 999, today: '2027-01-02' })
    ).toEqual({ ok: false, reason: 'contract_not_found' });
  });
});
