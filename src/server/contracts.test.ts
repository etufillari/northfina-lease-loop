// The quote → contract → invoices path on a real, migrated SQLite database, using the
// challenge's scenario cards. Runs against the real data pack.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { ApiError } from './api-response';
import { seedAssets } from './assets';
import { getContract, listContracts, signContract, toContract } from './contracts';
import { getInvoiceTimeline, issueInvoices } from './invoices';
import { loadPricingData, refusal, type PricingData } from './pricing-data';
import type { PrismaClient } from './prisma-client';
import { createQuote, createSecondLifeQuote, getQuote, previewQuote } from './quotes';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let data: PricingData;
const actor = 'test';

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  data = await loadPricingData();
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await db.auditLog.deleteMany();
  await db.invoice.deleteMany();
  await db.contract.deleteMany();
  await db.quote.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
});

const quoteFor = (assetId: string, termMonths: number, onDate: string, downPaymentCents = 0) =>
  createQuote(db, data, { assetId, termMonths, onDate, downPaymentCents, actor });

async function signAsQuoted(
  assetId: string,
  termMonths: number,
  startDate: string,
  downPaymentCents = 0
) {
  const quote = await quoteFor(assetId, termMonths, startDate, downPaymentCents);
  return signContract(db, data, {
    quoteId: quote.id,
    customerId: 'cust-aino',
    signedOn: startDate,
    startDate,
    accepted: quote,
    actor,
  });
}

const code = (promise: Promise<unknown>) =>
  promise.then(
    () => 'no error',
    (error: unknown) => (error instanceof ApiError ? error.code : 'unexpected error')
  );

describe('previewQuote', () => {
  it('prices an asset with VAT and writes nothing', async () => {
    const request = {
      assetId: 'ebike-003',
      termMonths: 36,
      downPaymentCents: 0,
      onDate: '2026-11-05',
    };
    expect(await previewQuote(db, data, request)).toMatchObject({
      monthlyNetRentCents: 10_730,
      firstRent: { vatCents: 2736, grossCents: 13_466 },
      totals: { grossCents: 486_612 },
      totalWithBuyoutGrossCents: 560_133,
    });
    expect(await db.quote.count()).toBe(0);
  });

  it('refuses an unknown or reserved asset and a price that cannot be financed', async () => {
    const request = { termMonths: 36, downPaymentCents: 0, onDate: '2026-11-05' };
    const preview = (assetId: string) => previewQuote(db, data, { ...request, assetId });
    expect(await code(preview('nope'))).toBe('UNKNOWN_ASSET');
    expect(await code(preview('ebike-009'))).toBe('ASSET_UNAVAILABLE');
    expect(await code(preview('ebike-010'))).toBe('BELOW_MINIMUM');
    expect(await code(preview('farm-006'))).toBe('ABOVE_MAXIMUM');
  });
});

describe('createQuote', () => {
  it('saves the quote with an audit row and reads it back unchanged', async () => {
    const quote = await quoteFor('ebike-003', 36, '2026-11-05');
    expect(await getQuote(db, data, quote.id)).toEqual(quote);
    expect(await db.auditLog.findFirst()).toMatchObject({
      action: 'quote.created',
      entity_id: quote.id,
    });
  });

  it('answers 404 for a quote that does not exist', async () => {
    expect(await code(getQuote(db, data, 'nope'))).toBe('QUOTE_NOT_FOUND');
  });
});

describe('createSecondLifeQuote', () => {
  const request = {
    assetId: 'ebike-007',
    assessedNetPriceCents: 150_000,
    termMonths: 24,
    downPaymentCents: 0,
    onDate: '2026-11-06',
    actor,
  };

  it('prices a returned item from its assessed value through the same calculation', async () => {
    expect(await createSecondLifeQuote(db, data, request)).toMatchObject({
      priceListVersion: null,
      listPriceCents: 150_000,
      band: 'A',
    });
  });

  it('refuses an unknown asset and an amount that cannot be financed', async () => {
    expect(await code(createSecondLifeQuote(db, data, { ...request, assetId: 'nope' }))).toBe(
      'UNKNOWN_ASSET'
    );
    expect(
      await code(createSecondLifeQuote(db, data, { ...request, assessedNetPriceCents: 100 }))
    ).toBe('BELOW_MINIMUM');
  });
});

describe('signContract', () => {
  it('card 1: stores the snapshot, reserves the asset, issues the first invoice, audits', async () => {
    const contract = await signAsQuoted('ebike-003', 36, '2026-11-05');
    expect(contract).toMatchObject({
      status: 'active',
      monthlyNetRentCents: 10_730,
      endDate: '2029-11-04',
      priceLock: { reason: 'price_unchanged_since_quote' },
    });
    expect((await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } })).status).toBe(
      'reserved'
    );
    expect(await db.invoice.count()).toBe(1);
    expect(await db.auditLog.count({ where: { action: 'contract.signed' } })).toBe(1);
    expect(await getContract(db, contract.id)).toEqual(contract);
  });

  it('card 2: asks for confirmation on v2, then locks v2 and says why', async () => {
    const quote = await quoteFor('laptop-004', 36, '2026-11-05');
    const request = {
      quoteId: quote.id,
      customerId: 'cust-aino',
      signedOn: '2026-11-06',
      startDate: '2026-11-06',
      actor,
    };

    const refused = await signContract(db, data, { ...request, accepted: quote }).catch(
      (error: unknown) => error
    );
    expect(refused).toMatchObject({
      status: 409,
      code: 'PRICE_CHANGED',
      details: { repriced: { priceListVersion: 2, monthlyNetRentCents: 8857 } },
    });
    expect(await db.contract.count()).toBe(0);

    const contract = await signContract(db, data, {
      ...request,
      accepted: { monthlyNetRentCents: 8857, buyoutNetCents: 48_165 },
    });
    expect(contract).toMatchObject({
      priceListVersion: 2,
      priceLock: {
        reason: 'list_price_changed_since_quote',
        quotedMonthlyNetRentCents: 9627,
        lockedMonthlyNetRentCents: 8857,
      },
    });
  });

  it('never lets a later price list touch a signed contract or its invoices', async () => {
    const contract = await signAsQuoted('ebike-001', 24, '2026-09-15');
    const before = await getInvoiceTimeline(db, data, contract.id);
    const dearer = data.priceLists.map((list) => ({
      ...list,
      prices: Object.fromEntries(Object.keys(list.prices).map((id) => [id, 99_999_999])),
    }));
    const after = await getInvoiceTimeline(db, { ...data, priceLists: dearer }, contract.id);
    expect(after).toEqual(before);
  });

  it('refuses a second signature on the same quote and rolls everything back', async () => {
    const contract = await signAsQuoted('ebike-003', 36, '2026-11-05');
    const quote = await getQuote(db, data, contract.quoteId);
    const again = signContract(db, data, {
      quoteId: quote.id,
      customerId: 'cust-aino',
      signedOn: '2026-11-05',
      startDate: '2026-11-05',
      accepted: quote,
      actor,
    });
    expect(await code(again)).toBe('QUOTE_ALREADY_SIGNED');
    expect(await db.contract.count()).toBe(1);
    expect(await db.auditLog.count({ where: { action: 'contract.signed' } })).toBe(1);
  });

  it('gives an asset to one contract only, when a second quote for it is signed', async () => {
    const first = await quoteFor('ebike-003', 36, '2026-11-05');
    const second = await quoteFor('ebike-003', 24, '2026-11-05');
    const sign = (quote: typeof first) =>
      signContract(db, data, {
        quoteId: quote.id,
        customerId: 'cust-aino',
        signedOn: '2026-11-05',
        startDate: '2026-11-05',
        accepted: quote,
        actor,
      });
    await sign(first);
    expect(await code(sign(second))).toBe('ASSET_UNAVAILABLE');
    expect(await db.contract.count()).toBe(1);
    expect(await db.quote.findUnique({ where: { id: second.id } })).not.toBeNull();
  });

  it('answers with reasons for a missing quote and impossible dates', async () => {
    const request = {
      customerId: 'cust-aino',
      signedOn: '2026-11-05',
      startDate: '2026-11-05',
      accepted: { monthlyNetRentCents: 1, buyoutNetCents: 1 },
      actor,
    };
    expect(await code(signContract(db, data, { ...request, quoteId: 'nope' }))).toBe(
      'QUOTE_NOT_FOUND'
    );
    const quote = await quoteFor('ebike-003', 36, '2026-11-05');
    expect(
      await code(signContract(db, data, { ...request, quoteId: quote.id, startDate: '2026-11-01' }))
    ).toBe('START_BEFORE_SIGNING');
  });
});

describe('invoices', () => {
  it('card 1: shows issued and forecast invoices with the VAT change marked', async () => {
    const contract = await signAsQuoted('ebike-003', 36, '2026-11-05');
    const timeline = await getInvoiceTimeline(db, data, contract.id);
    expect(timeline.invoices).toHaveLength(36);
    expect(timeline.invoices.slice(0, 3)).toMatchObject([
      { status: 'issued', grossCents: 13_466, vatChange: null },
      { status: 'forecast', grossCents: 13_466, vatChange: null },
      { status: 'forecast', grossCents: 13_520, vatChange: { fromPercent: 25.5, toPercent: 26 } },
    ]);
    expect(timeline).toMatchObject({
      totals: { netCents: 386_280, grossCents: 486_612 },
      issuedTotals: { netCents: 10_730 },
      reconciled: true,
    });
  });

  it('issues what is due, once, however often it is asked', async () => {
    const contract = await signAsQuoted('ebike-001', 24, '2026-09-15');
    const input = { contractId: contract.id, asOf: '2027-01-15', actor };
    expect((await issueInvoices(db, data, input)).issued).toEqual([2, 3, 4, 5]);
    const audits = await db.auditLog.count({ where: { action: 'invoice.issued' } });
    expect((await issueInvoices(db, data, input)).issued).toEqual([]);
    expect(await db.invoice.count()).toBe(5);
    expect(await db.auditLog.count({ where: { action: 'invoice.issued' } })).toBe(audits);
  });

  it('card 3: stores different VAT for December and January on the same net rent', async () => {
    const contract = await signAsQuoted('ebike-001', 24, '2026-09-15');
    await issueInvoices(db, data, { contractId: contract.id, asOf: '2027-01-15', actor });
    const row = (invoice_date: string) =>
      db.invoice.findFirstOrThrow({ where: { contract_id: contract.id, invoice_date } });
    expect(await row('2026-12-15')).toMatchObject({
      net_cents: 6957,
      vat_rate_percent: 25.5,
      gross_cents: 8731,
    });
    expect(await row('2027-01-15')).toMatchObject({
      net_cents: 6957,
      vat_rate_percent: 26,
      gross_cents: 8766,
    });
  });

  it('keeps an issued invoice as it was when the VAT data changes later', async () => {
    const contract = await signAsQuoted('ebike-003', 36, '2026-11-05');
    const raised = {
      ...data.vatRates,
      rates: [{ rate_percent: 30, valid_from: '2000-01-01', valid_to: null }],
    };
    const { invoices } = await getInvoiceTimeline(db, { ...data, vatRates: raised }, contract.id);
    expect(invoices[0]).toMatchObject({ status: 'issued', vatRatePercent: 25.5 });
    expect(invoices[1]).toMatchObject({ status: 'forecast', vatRatePercent: 30 });
  });

  it('card 4: month-end due dates survive storage', async () => {
    const contract = await signAsQuoted('laptop-001', 36, '2026-01-31');
    await issueInvoices(db, data, { contractId: contract.id, asOf: '2028-03-31', actor });
    const dates = (await getInvoiceTimeline(db, data, contract.id)).invoices.map((i) => i.dueDate);
    expect(dates).toEqual(expect.arrayContaining(['2026-02-28', '2026-03-31', '2028-02-29']));
  });

  it('bills a down payment once and still reconciles', async () => {
    const contract = await signAsQuoted('farm-002', 48, '2026-11-05', 2_000_000);
    const timeline = await getInvoiceTimeline(db, data, contract.id);
    expect(timeline.invoices).toHaveLength(49);
    expect(timeline.invoices[0]).toMatchObject({ kind: 'down_payment', status: 'issued' });
    expect(timeline.invoices[1]).toMatchObject({ kind: 'rent', status: 'issued' });
    expect(timeline).toMatchObject({
      contractNetTotalCents: 2_000_000 + 48 * 272_038,
      reconciled: true,
    });
  });

  it('answers 404 for a contract that does not exist', async () => {
    expect(await code(getInvoiceTimeline(db, data, 'nope'))).toBe('CONTRACT_NOT_FOUND');
    expect(await code(getContract(db, 'nope'))).toBe('CONTRACT_NOT_FOUND');
    expect(
      await code(issueInvoices(db, data, { contractId: 'nope', asOf: '2026-11-05', actor }))
    ).toBe('CONTRACT_NOT_FOUND');
  });
});

describe('listContracts', () => {
  it('filters by asset and by the last day of the lease', async () => {
    const ending = await signAsQuoted('ebike-003', 12, '2026-01-10');
    await signAsQuoted('ebike-002', 36, '2026-11-05');
    expect(await listContracts(db)).toHaveLength(2);
    expect(await listContracts(db, { assetId: 'ebike-003' })).toHaveLength(1);
    const inMonth = await listContracts(db, { endingFrom: '2027-01-01', endingTo: '2027-01-31' });
    expect(inMonth.map((contract) => contract.id)).toEqual([ending.id]);
  });
});

describe('toContract', () => {
  it('refuses a contract row whose price lock has been damaged', async () => {
    const contract = await signAsQuoted('ebike-003', 36, '2026-11-05');
    const row = await db.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(() => toContract({ ...row, price_lock_json: '{}' })).toThrow();
  });
});

describe('refusal', () => {
  it('keeps the reason as a stable code', () => {
    expect(refusal('below_minimum')).toMatchObject({ status: 422, code: 'BELOW_MINIMUM' });
  });

  it('treats a reason nobody defined as a bug', () => {
    expect(() => refusal('made_up')).toThrow('no refusal defined');
  });
});
