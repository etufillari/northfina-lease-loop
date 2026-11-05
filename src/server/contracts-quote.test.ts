// Signing a stored quote (D-014, D-034), against a real, migrated SQLite database.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../tests/helpers/test-db';
import { loadAssets } from '@/data/load';
import type { Contract } from '@/domain/contract';
import type { Quote } from '@/domain/quote';
import { listAuditLog } from './audit';
import { seedAssets } from './assets';
import { getContract, signLease, type LeaseDataPack, type SignLeaseInput } from './contracts';
import { loadLeaseDataPack } from './lease-data';
import type { PrismaClient } from './prisma-client';
import { createQuote, getQuote } from './quotes';

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
  await db.quote.deleteMany();
  await db.contract.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
});

const ainoAnswers = {
  q_customer_type: 'consumer',
  q_full_name: 'Aino Virtanen',
  q_birth_date: '1997-04-12',
  q_email: 'aino.virtanen@example.com',
  q_country: 'FI',
  q_employment: 'employed',
  q_monthly_income: 320_000,
};

/** Quotes 36 months with nothing down on `day` and returns the stored quote. */
async function quote(assetId: string, day: string): Promise<{ id: number; quote: Quote }> {
  const result = await createQuote(db, data, {
    assetId,
    termMonths: 36,
    downPaymentCents: 0,
    today: day,
    actor: 'customer',
  });
  if (!result.ok) throw new Error(`setup failed: ${result.reason}`);
  return result;
}

const sign = (quoteId: number, today: string, extra: Partial<SignLeaseInput> = {}) =>
  signLease(db, data, {
    quoteId,
    customerId: 'cust-aino',
    answers: ainoAnswers,
    shownMonthlyNetRentCents: 9_627,
    today,
    actor: 'cust-aino',
    ...extra,
  });

/** The contract without the signature: exactly the quote that was shown, minus its expiry. */
function lockedTerms(contract: Contract) {
  const { customerId: _c, signDate: _s, startDate: _st, billing: _b, ...terms } = contract;
  return terms;
}
function shownTerms(shown: Quote) {
  const { validUntil: _v, ...terms } = shown;
  return terms;
}

async function nothingSigned(assetId = 'laptop-004') {
  expect(await db.contract.count()).toBe(0);
  expect(await db.quote.count({ where: { contract_id: { not: null } } })).toBe(0);
  const actions = (await listAuditLog(db)).map((entry) => entry.action);
  expect(actions.every((action) => action === 'quote.created')).toBe(true);
  const asset = await db.asset.findUniqueOrThrow({ where: { id: assetId } });
  expect(asset.status).toBe('available');
}

describe('card 2: laptop-004 quoted Thu 5 Nov on v1, signed Fri 6 Nov on v2', () => {
  // Thu v1: 349 000 × 0.027584 = 9 626.8 → 9 627. Fri v2: 321 100 × 0.027584 = 8 857.2 → 8 857.

  it('offers today’s cheaper price first, and signs nothing', async () => {
    const thu = await quote('laptop-004', '2026-11-05');
    expect(await sign(thu.id, '2026-11-06')).toEqual({
      ok: false,
      reason: 'price_choice_required',
      quotedMonthlyNetRentCents: 9_627,
      todaysMonthlyNetRentCents: 8_857,
      todaysPriceListVersion: 2,
      savingPerMonthCents: 770,
    });
    await nothingSigned();
  });

  it('keeps the quote: locks 9 627 on v1, exactly what was shown, and audits the choice', async () => {
    const thu = await quote('laptop-004', '2026-11-05');
    const result = await sign(thu.id, '2026-11-06', { priceChoice: 'keep_quote' });
    if (!result.ok) throw new Error(result.reason);
    expect(result.contract).toMatchObject({
      quoteDate: '2026-11-05',
      signDate: '2026-11-06',
      priceListVersion: 1,
      listPriceCents: 349_000,
      monthlyNetRentCents: 9_627,
    });
    expect(lockedTerms(result.contract)).toEqual(shownTerms(thu.quote));
    expect(result.quoteId).toBe(thu.id);
    expect((await getContract(db, result.id))?.contract).toEqual(result.contract);
    expect((await getQuote(db, thu.id))?.contractId).toBe(result.id);

    const [signed] = await listAuditLog(db, 1);
    expect(signed).toMatchObject({
      action: 'contract.signed',
      entity_id: String(result.id),
      details: {
        quoteId: thu.id,
        signedQuoteId: thu.id,
        monthlyNetRentCents: 9_627,
        priceListVersion: 1,
        priceCheck: 'cheaper_today',
        priceChoice: 'keep_quote',
        savingPerMonthCents: 770,
        asOf: '2026-11-06',
      },
    });
  });

  it('takes today’s price: locks 8 857 on v2 from a new stored quote, and audits the choice', async () => {
    const thu = await quote('laptop-004', '2026-11-05');
    const result = await sign(thu.id, '2026-11-06', {
      priceChoice: 'todays_price',
      shownMonthlyNetRentCents: 8_857,
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.contract).toMatchObject({
      quoteDate: '2026-11-06',
      priceListVersion: 2,
      listPriceCents: 321_100,
      monthlyNetRentCents: 8_857,
    });
    expect(result.quoteId).not.toBe(thu.id);

    const fri = await getQuote(db, result.quoteId);
    expect(fri).toMatchObject({ contractId: result.id, replacesQuoteId: thu.id });
    // The locked contract is the stored quote the customer was offered, number for number.
    expect(lockedTerms(result.contract)).toEqual(shownTerms(fri!.quote));
    // The Thursday quote is used up too, so it can't be signed into a second contract.
    expect((await getQuote(db, thu.id))?.contractId).toBe(result.id);

    const [signed] = await listAuditLog(db, 1);
    expect(signed).toMatchObject({
      action: 'contract.signed',
      details: {
        quoteId: thu.id,
        signedQuoteId: result.quoteId,
        monthlyNetRentCents: 8_857,
        priceListVersion: 2,
        priceCheck: 'cheaper_today',
        priceChoice: 'todays_price',
      },
    });
  });

  it('refuses a price the customer was not shown, and signs nothing', async () => {
    const thu = await quote('laptop-004', '2026-11-05');
    for (const choice of [
      { priceChoice: 'keep_quote' as const, shownMonthlyNetRentCents: 8_857 },
      { priceChoice: 'todays_price' as const, shownMonthlyNetRentCents: 9_627 },
    ]) {
      expect(await sign(thu.id, '2026-11-06', choice)).toEqual({
        ok: false,
        reason: 'price_changed',
      });
    }
    await nothingSigned();
  });
});

describe('a quote today’s list makes dearer', () => {
  it('protects the customer: ebike-003 signs at the Thursday price', async () => {
    // Thu v1 389 000 × 0.027584 = 10 730.2 → 10 730. Fri v2 408 400 × 0.027584 = 11 265.3 → 11 265.
    const thu = await quote('ebike-003', '2026-11-05');
    const result = await sign(thu.id, '2026-11-06', {
      answers: { ...ainoAnswers, q_usage_purpose: 'commuting' },
      shownMonthlyNetRentCents: 10_730,
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.contract).toMatchObject({ priceListVersion: 1, monthlyNetRentCents: 10_730 });
    expect(lockedTerms(result.contract)).toEqual(shownTerms(thu.quote));
    const [signed] = await listAuditLog(db, 1);
    expect(signed?.details).toMatchObject({
      priceCheck: 'dearer_today',
      priceChoice: null,
      extraPerMonthCents: 535, // 11 265 − 10 730
    });
  });
});

describe('quotes that cannot be signed', () => {
  it('signs on day 7 (Thu 12 Nov) and refuses on day 8 (Fri 13 Nov)', async () => {
    const thu = await quote('laptop-004', '2026-11-05'); // valid until 12 Nov
    expect(await sign(thu.id, '2026-11-13', { priceChoice: 'keep_quote' })).toEqual({
      ok: false,
      reason: 'quote_expired',
    });
    await nothingSigned();
    expect((await sign(thu.id, '2026-11-12', { priceChoice: 'keep_quote' })).ok).toBe(true);
  });

  it('refuses a quote that was already signed, and writes nothing more', async () => {
    const thu = await quote('laptop-004', '2026-11-05');
    expect((await sign(thu.id, '2026-11-05')).ok).toBe(true);
    const auditRows = (await listAuditLog(db)).length;
    expect(await sign(thu.id, '2026-11-05', { customerId: 'cust-sanna' })).toEqual({
      ok: false,
      reason: 'quote_already_used',
    });
    expect(await db.contract.count()).toBe(1);
    expect(await listAuditLog(db)).toHaveLength(auditRows);
  });

  it('refuses an unknown quote', async () => {
    expect(await sign(999_999, '2026-11-05')).toEqual({ ok: false, reason: 'quote_not_found' });
    await nothingSigned();
  });

  it('refuses a quote for an item someone else has leased since', async () => {
    const mine = await quote('laptop-004', '2026-11-05');
    const theirs = await quote('laptop-004', '2026-11-05');
    expect((await sign(theirs.id, '2026-11-05')).ok).toBe(true);
    expect(await sign(mine.id, '2026-11-05')).toEqual({
      ok: false,
      reason: 'asset_not_available',
    });
    expect(await db.contract.count()).toBe(1);
    expect((await getQuote(db, mine.id))?.contractId).toBeNull();
  });

  it('refuses to sign before the quote day (a demo date moved back)', async () => {
    const fri = await quote('laptop-004', '2026-11-06');
    expect(await sign(fri.id, '2026-11-05', { shownMonthlyNetRentCents: 8_857 })).toEqual({
      ok: false,
      reason: 'signed_before_quote',
    });
    await nothingSigned();
  });

  it('still decides the application on the quote’s numbers (D-024)', async () => {
    // Mikko is 17 (born 2009-03-10), so he is declined whatever the quote.
    const thu = await quote('laptop-008', '2026-11-05');
    const result = await sign(thu.id, '2026-11-05', {
      customerId: 'cust-mikko',
      answers: {
        q_customer_type: 'consumer',
        q_full_name: 'Mikko Laine',
        q_birth_date: '2009-03-10',
        q_email: 'mikko.laine@example.com',
        q_country: 'FI',
        q_employment: 'student',
        q_monthly_income: 40_000,
      },
      shownMonthlyNetRentCents: thu.quote.monthlyNetRentCents,
    });
    expect(result).toEqual({ ok: false, reason: 'application_declined' });
    await nothingSigned('laptop-008');
  });
});
