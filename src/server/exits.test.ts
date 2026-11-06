// Exits on a real migrated SQLite database: card 1 is signed through signContract, 7 rents are
// paid through payInvoice, then Aino leaves in month 7 (card 8). The contract, the invoices,
// the asset, the passport and the audit row change together, and a refusal or a throwing
// handler writes nothing.
import { refusal } from '../../tests/helpers/authz';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PricingData } from '@/domain/pricing';
import { seedPack } from '../../tests/helpers/invoice-fixture';
import { createTestDb } from '../../tests/helpers/test-db';
import { resetDb } from '../../tests/helpers/reset-db';
import { withProductionHandlers } from '../../tests/helpers/with-handlers';
import { listAssetEvents } from './asset-events';
import { getAsset } from './assets';
import { getContract, signContract } from './contracts';
import { onEvent } from './events';
import { exitContract, nextQuoteIdOf, previewExit } from './exits';
import { listInvoices, payInvoice } from './invoices';
import type { PrismaClient } from './prisma-client';
import { createQuote, getQuote, loadPricingData } from './quotes';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let data: PricingData;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  data = await loadPricingData();
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetDb(db);
  await seedPack(db);
});
withProductionHandlers();

const MONTH_7 = '2027-06-05';
const AINO_REPORTS = { condition: 'good' as const, usage: { unit: 'km' as const, value: 1_800 } };

/** Card 1 signed through signContract, then the first `paid` rents paid on their due days. */
async function card1(paid: number): Promise<string> {
  const quote = await createQuote(
    db,
    {
      assetId: 'ebike-003',
      termMonths: 36,
      downPaymentCents: 0,
      today: '2026-11-05',
      actor: 'cust-aino',
    },
    data
  );
  if (!quote.ok) throw new Error(quote.reason.code);
  // The application slice's write, done directly: these tests are about the exit.
  const application = await db.application.create({
    data: {
      customer_id: 'cust-aino',
      quote_id: quote.quote.id,
      answers_json: '{}',
      decision: 'approved',
      reasons_json: '[]',
      decided_on: '2026-11-05',
    },
  });
  const signed = await signContract(
    db,
    { applicationId: application.id, actor: 'cust-aino' },
    '2026-11-05',
    data
  );
  if (!signed.ok) throw new Error(signed.reason.code);
  const contractId = signed.details.contract.id;
  const rents = (await listInvoices(db, contractId)).filter((i) => i.kind === 'rent');
  for (const rent of rents.slice(0, paid)) {
    const result = await payInvoice(db, { id: rent.id, paidOn: rent.dueDate, actor: 'cust-aino' });
    if (!result.ok) throw new Error(result.reason);
  }
  return contractId;
}

async function writesSoFar(contractId: string) {
  const invoices = await listInvoices(db, contractId);
  return {
    status: (await getContract(db, contractId))?.status,
    invoices: invoices.length,
    cancelled: invoices.filter((i) => i.status === 'cancelled').length,
    asset: (await getAsset(db, 'ebike-003'))?.status,
    passport: (await listAssetEvents(db, 'ebike-003')).length,
    audit: await db.auditLog.count({ where: { entity_type: 'contract', entity_id: contractId } }),
  };
}

describe('exitContract, card 8: Aino leaves card 1 in month 7', () => {
  it('a buy: ended_early, the asset sold, the early_exit invoice 330 675 + 26 % VAT, 29 rents cancelled', async () => {
    const contractId = await card1(7);
    const result = await exitContract(
      db,
      { contractId, mode: 'buy', reported: AINO_REPORTS, actor: 'cust-aino' },
      MONTH_7
    );
    if (!result.ok) throw new Error(result.reason.code);
    expect(result.contract.status).toBe('ended_early');
    expect(result.contract.endedOn).toBe(MONTH_7);
    expect(result.plan.buy.totalCents).toBe(330_675);

    const invoices = await listInvoices(db, contractId);
    const exit = invoices.find((i) => i.kind === 'early_exit')!;
    expect(exit).toMatchObject({
      sequence: 37,
      periodStart: null,
      issueDate: MONTH_7,
      dueDate: MONTH_7,
      netCents: 330_675,
      vatRateBasisPoints: 2600,
      vatCents: 85_976,
      grossCents: 416_651,
      status: 'issued',
    });
    const rents = invoices.filter((i) => i.kind === 'rent');
    expect(rents.filter((i) => i.status === 'paid')).toHaveLength(7);
    expect(rents.filter((i) => i.status === 'cancelled')).toHaveLength(29);

    expect((await getAsset(db, 'ebike-003'))?.status).toBe('sold');
    const passport = await listAssetEvents(db, 'ebike-003');
    expect(passport.map((e) => e.kind)).toEqual(['leased', 'bought']);
    const audit = await db.auditLog.findMany({ where: { action: 'contract.bought_out' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actor).toBe('cust-aino');
  });

  it('a return: the asset returned with the reported condition and usage, 75 945 billed', async () => {
    const contractId = await card1(7);
    const result = await exitContract(
      db,
      { contractId, mode: 'return', reported: AINO_REPORTS, actor: 'cust-aino' },
      MONTH_7
    );
    if (!result.ok) throw new Error(result.reason.code);
    const asset = await getAsset(db, 'ebike-003');
    expect(asset).toMatchObject({
      status: 'returned',
      condition: 'good',
      usage: AINO_REPORTS.usage,
    });
    const exit = (await listInvoices(db, contractId)).find((i) => i.kind === 'early_exit')!;
    expect(exit).toMatchObject({ netCents: 75_945, vatCents: 19_746, grossCents: 95_691 });
    expect((await listAssetEvents(db, 'ebike-003')).at(-1)?.kind).toBe('returned');
  });

  it('a pass-on names the next customer; admin may do it for the customer', async () => {
    const contractId = await card1(7);
    const result = await exitContract(
      db,
      {
        contractId,
        mode: 'pass_on',
        reported: AINO_REPORTS,
        nextCustomerId: 'cust-mikko',
        actor: 'admin',
      },
      MONTH_7
    );
    if (!result.ok) throw new Error(result.reason.code);
    expect(result.contract.status).toBe('ended_early');
    const passport = await listAssetEvents(db, 'ebike-003');
    // D90 (review 2): the life closes with passed_on, then the item is repriced at its market
    // value for the next life, as the second-life path does.
    expect(passport.slice(-2)).toMatchObject([
      { kind: 'passed_on' },
      { kind: 'repriced', details: { marketValueCents: 259_230 } },
    ]);
    // D90 (review 1): relisted as it is and held for the named customer, out of the catalogue.
    expect((await getAsset(db, 'ebike-003'))?.status).toBe('reserved');
  });

  it('D90, card 8 passed on early: 71 445 billed, no refurbishment, 29 rents cancelled, the next quote at the market value 259 230', async () => {
    const contractId = await card1(7);
    const result = await exitContract(
      db,
      {
        contractId,
        mode: 'pass_on',
        reported: AINO_REPORTS,
        nextCustomerId: 'cust-mikko',
        actor: 'cust-aino',
      },
      MONTH_7
    );
    if (!result.ok) throw new Error(result.reason.code);
    const invoices = await listInvoices(db, contractId);
    const exit = invoices.find((i) => i.kind === 'early_exit')!;
    expect(exit).toMatchObject({ netCents: 71_445 });
    expect(invoices.filter((i) => i.status === 'cancelled')).toHaveLength(29);
    expect(result.plan.passOn.lines.map((l) => l.code)).not.toContain('refurb_fixed');
    expect(result.nextQuoteId).toBeTruthy();
    expect(await nextQuoteIdOf(db, contractId)).toBe(result.nextQuoteId);
    expect((await getAsset(db, 'ebike-003'))?.status).toBe('reserved');
    const quote = await getQuote(db, result.nextQuoteId!);
    expect(quote).toMatchObject({ quoteDate: MONTH_7, customerId: 'cust-mikko' });
    expect(quote?.breakdown).toMatchObject({
      assetId: 'ebike-003',
      unitListPriceCents: 259_230,
      termMonths: 36,
      downPaymentCents: 0,
    });
  });

  it('D90: a pass-on that fails rolls the next quote back with it', async () => {
    const contractId = await card1(7);
    const before = await writesSoFar(contractId);
    const quotesBefore = await db.quote.count();
    const off = onEvent('UNIT_PASSED_ON', async () => {
      throw new Error('boom');
    });
    try {
      await expect(
        exitContract(
          db,
          {
            contractId,
            mode: 'pass_on',
            reported: AINO_REPORTS,
            nextCustomerId: 'cust-mikko',
            actor: 'cust-aino',
          },
          MONTH_7
        )
      ).rejects.toThrow('boom');
    } finally {
      off();
    }
    expect(await writesSoFar(contractId)).toEqual(before);
    expect(await db.quote.count()).toBe(quotesBefore);
  });

  it('D90: a next quote that cannot be priced refuses the whole pass-on, the relisting rolled back', async () => {
    const contractId = await card1(7);
    const before = await writesSoFar(contractId);
    const quotesBefore = await db.quote.count();
    const unpriced = { ...data, priceLists: [] };
    const result = await exitContract(
      db,
      {
        contractId,
        mode: 'pass_on',
        reported: AINO_REPORTS,
        nextCustomerId: 'cust-mikko',
        actor: 'cust-aino',
      },
      MONTH_7,
      undefined,
      unpriced
    );
    expect(result).toMatchObject({ ok: false, reason: { code: 'next_quote_refused' } });
    expect(await writesSoFar(contractId)).toEqual(before);
    expect(before.asset).toBe('leased');
    expect(await db.quote.count()).toBe(quotesBefore);
  });

  it('D90 (review 2): a pass-on below good is refused, nothing written; return it instead', async () => {
    const contractId = await card1(7);
    const before = await writesSoFar(contractId);
    const result = await exitContract(
      db,
      {
        contractId,
        mode: 'pass_on',
        reported: { ...AINO_REPORTS, condition: 'fair' },
        nextCustomerId: 'cust-mikko',
        actor: 'cust-aino',
      },
      MONTH_7
    );
    expect(result).toEqual({
      ok: false,
      reason: { code: 'pass_on_below_leasable', params: { condition: 'fair', needed: 'good' } },
    });
    expect(await writesSoFar(contractId)).toEqual(before);
  });

  it('previewExit returns the same lines without writing', async () => {
    const contractId = await card1(7);
    const before = await writesSoFar(contractId);
    const preview = await previewExit(
      db,
      { contractId, mode: 'return', reported: AINO_REPORTS },
      MONTH_7
    );
    if (!preview.ok) throw new Error(preview.reason.code);
    expect(preview.preview.return.totalCents).toBe(75_945);
    expect(preview.preview.buy.totalCents).toBe(330_675);
    expect(await writesSoFar(contractId)).toEqual(before);

    const done = await exitContract(
      db,
      { contractId, mode: 'return', reported: AINO_REPORTS, actor: 'cust-aino' },
      MONTH_7
    );
    if (!done.ok) throw new Error(done.reason.code);
    expect(done.plan).toEqual(preview.preview);
  });
});

describe('exitContract at the end of the term', () => {
  it('a buy on the last day: bought, the buyout invoice 58 350, nothing cancelled', async () => {
    const contractId = await card1(36);
    const result = await exitContract(
      db,
      { contractId, mode: 'buy', reported: AINO_REPORTS, actor: 'cust-aino' },
      '2029-11-04'
    );
    if (!result.ok) throw new Error(result.reason.code);
    expect(result.contract.status).toBe('bought');
    const invoices = await listInvoices(db, contractId);
    expect(invoices.find((i) => i.kind === 'buyout')).toMatchObject({
      netCents: 58_350,
      vatCents: 15_171,
    });
    expect(invoices.filter((i) => i.status === 'cancelled')).toHaveLength(0);
  });
});

describe('exitContract refusals write nothing', () => {
  it('an asset that is no longer leased is asset_not_leased, not a 500 (product review 4)', async () => {
    const contractId = await card1(7);
    // Whatever moved it (a direct write, a script): the lease's asset is not out any more.
    await db.asset.update({ where: { id: 'ebike-003' }, data: { status: 'returned' } });
    const before = await writesSoFar(contractId);
    const result = await exitContract(
      db,
      { contractId, mode: 'return', reported: AINO_REPORTS, actor: 'cust-aino' },
      MONTH_7
    );
    expect(result).toEqual({
      ok: false,
      reason: { code: 'asset_not_leased', params: { assetId: 'ebike-003' } },
    });
    expect(await writesSoFar(contractId)).toEqual(before);
  });

  it('a second exit is refused contract_not_active', async () => {
    const contractId = await card1(7);
    const first = await exitContract(
      db,
      { contractId, mode: 'buy', reported: AINO_REPORTS, actor: 'cust-aino' },
      MONTH_7
    );
    expect(first.ok).toBe(true);
    const before = await writesSoFar(contractId);
    const second = await exitContract(
      db,
      { contractId, mode: 'return', reported: AINO_REPORTS, actor: 'cust-aino' },
      MONTH_7
    );
    expect(second).toMatchObject({ ok: false, reason: { code: 'contract_not_active' } });
    expect(await writesSoFar(contractId)).toEqual(before);
  });

  it('only the customer or admin; an unknown contract or next customer is a refusal', async () => {
    const contractId = await card1(7);
    const before = await writesSoFar(contractId);
    const base = { contractId, mode: 'buy' as const, reported: AINO_REPORTS };
    expect(await exitContract(db, { ...base, actor: 'cust-mikko' }, MONTH_7)).toEqual({
      ok: false,
      reason: refusal('not_owner', 'exit_contract'),
    });
    expect(await exitContract(db, { ...base, actor: 'anonymous' }, MONTH_7)).toEqual({
      ok: false,
      reason: refusal('not_signed_in', 'exit_contract'),
    });
    expect(
      await exitContract(db, { ...base, contractId: 'nope', actor: 'admin' }, MONTH_7)
    ).toMatchObject({ ok: false, reason: { code: 'contract_not_found' } });
    expect(
      await exitContract(
        db,
        { ...base, mode: 'pass_on', nextCustomerId: 'cust-ghost', actor: 'admin' },
        MONTH_7
      )
    ).toMatchObject({ ok: false, reason: { code: 'next_customer_not_found' } });
    expect(await writesSoFar(contractId)).toEqual(before);
  });

  it('a handler that throws rolls everything back: still active, no invoice, nothing cancelled', async () => {
    const contractId = await card1(7);
    const before = await writesSoFar(contractId);
    const off = onEvent('CONTRACT_BOUGHT_OUT', async () => {
      throw new Error('boom');
    });
    try {
      await expect(
        exitContract(
          db,
          { contractId, mode: 'buy', reported: AINO_REPORTS, actor: 'cust-aino' },
          MONTH_7
        )
      ).rejects.toThrow('boom');
    } finally {
      off();
    }
    expect(await writesSoFar(contractId)).toEqual(before);
    expect(before.status).toBe('active');
  });
});
