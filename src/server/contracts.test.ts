// Signing on a real migrated SQLite database: the contract, the invoices, the passport entry,
// the leased asset and the audit row commit together, and every refusal writes nothing.
import { refusal } from '../../tests/helpers/authz';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PricingData } from '@/domain/pricing';
import { seedPack } from '../../tests/helpers/invoice-fixture';
import { createTestDb } from '../../tests/helpers/test-db';
import { resetDb } from '../../tests/helpers/reset-db';
import { withProductionHandlers } from '../../tests/helpers/with-handlers';
import { listAssetEvents } from './asset-events';
import { getAsset } from './assets';
import { withAudit } from './audit';
import { AssetNotAvailableError, leaseAvailableAsset } from './catalogue-handlers';
import {
  contractCustomerId,
  contractIdOfApplication,
  endContract,
  getContract,
  getContractDetails,
  listContracts,
  signContract,
} from './contracts';
import { listInvoices } from './invoices';
import type { PrismaClient } from './prisma-client';
import { createQuote, loadPricingData } from './quotes';

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

type QuoteTerms = { assetId: string; termMonths: number; downPaymentCents: number; today: string };

const CARD_1: QuoteTerms = {
  assetId: 'ebike-003',
  termMonths: 36,
  downPaymentCents: 0,
  today: '2026-11-05',
};

/** A stored quote (through pricing) and an application with `decision` for `cust-aino`. */
async function application(
  terms: QuoteTerms = CARD_1,
  decision = 'approved',
  quantity = 1
): Promise<string> {
  const quote = await createQuote(db, { ...terms, actor: 'cust-aino' }, data);
  if (!quote.ok) throw new Error(quote.reason.code);
  // A quote prices one item (D8); a larger quantity can only be a row stored before that was
  // decided, which signing still refuses (D76).
  if (quantity !== 1) {
    await db.quote.update({ where: { id: quote.quote.id }, data: { quantity } });
  }
  // The application slice's write, done directly: these tests are about signing.
  const row = await db.application.create({
    data: {
      customer_id: 'cust-aino',
      quote_id: quote.quote.id,
      answers_json: '{}',
      decision,
      reasons_json: '[]',
      decided_on: terms.today,
    },
  });
  return row.id;
}

async function writesSoFar() {
  return {
    contracts: await db.contract.count(),
    invoices: await db.invoice.count(),
    passport: await db.assetEvent.count(),
    audit: await db.auditLog.count({ where: { action: 'contract.signed' } }),
  };
}

describe('signContract, card 1 (the happy path)', () => {
  it('signs ebike-003 on 5 Nov 2026 and writes the contract, invoices, passport, asset and audit at once', async () => {
    const applicationId = await application();
    const result = await signContract(
      db,
      { applicationId, actor: 'cust-aino' },
      '2026-11-05',
      data
    );
    if (!result.ok) throw new Error(result.reason.code);

    const { contract } = result.details;
    expect(contract).toMatchObject({
      applicationId,
      customerId: 'cust-aino',
      assetId: 'ebike-003',
      quantity: 1,
      signedOn: '2026-11-05',
      startDate: '2026-11-05',
      endDate: '2029-11-04',
      monthlyNetCents: 10_730,
      buyoutCents: 58_350,
      band: 'B',
      priceListVersion: 1,
      status: 'active',
    });
    expect(result.details.priceLock).toBeNull();

    const invoices = await listInvoices(db, contract.id);
    expect(invoices).toHaveLength(36);
    expect(invoices[0]).toMatchObject({ sequence: 1, dueDate: '2026-11-05', grossCents: 13_466 });
    expect(invoices[2]).toMatchObject({ issueDate: '2027-01-05', grossCents: 13_520 });

    expect(await listAssetEvents(db, 'ebike-003')).toEqual([
      expect.objectContaining({ kind: 'leased', contract_id: contract.id, on_date: '2026-11-05' }),
    ]);
    expect((await getAsset(db, 'ebike-003'))?.status).toBe('leased');

    const audit = await db.auditLog.findMany({ where: { action: 'contract.signed' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor: 'cust-aino', entity_id: contract.id });
  });

  it('issues the down payment as invoice 0 on the signing day before a later start (D5, D7)', async () => {
    const applicationId = await application({ ...CARD_1, downPaymentCents: 50_000 });
    const result = await signContract(
      db,
      { applicationId, startDate: '2026-11-15', actor: 'cust-aino' },
      '2026-11-05',
      data
    );
    if (!result.ok) throw new Error(result.reason.code);
    expect(result.details.contract).toMatchObject({
      signedOn: '2026-11-05',
      startDate: '2026-11-15',
      endDate: '2029-11-14',
      downPaymentCents: 50_000,
    });
    const [first, second] = await listInvoices(db, result.details.contract.id);
    expect(first).toMatchObject({ sequence: 0, kind: 'down_payment', issueDate: '2026-11-05' });
    expect(second).toMatchObject({ sequence: 1, kind: 'rent', dueDate: '2026-11-15' });
  });

  it('refuses the admin: the customer signs the lease themselves (D88), and nothing is written', async () => {
    const applicationId = await application();
    const result = await signContract(db, { applicationId, actor: 'admin' }, '2026-11-05', data);
    expect(result).toMatchObject({ ok: false, reason: { code: 'customer_signs' } });
    expect(await db.contract.count()).toBe(0);
    expect(await db.auditLog.findFirst({ where: { action: 'contract.signed' } })).toBeNull();
  });
});

describe('signContract, card 2 (the price lock)', () => {
  it('a laptop-004 quote of Thu 5 Nov signed Fri 6 Nov on v2 keeps 9 627 and says why', async () => {
    const applicationId = await application({
      assetId: 'laptop-004',
      termMonths: 36,
      downPaymentCents: 0,
      today: '2026-11-05',
    });
    const result = await signContract(
      db,
      { applicationId, actor: 'cust-aino' },
      '2026-11-06',
      data
    );
    if (!result.ok) throw new Error(result.reason.code);
    expect(result.details.contract).toMatchObject({
      unitListPriceCents: 349_000,
      monthlyNetCents: 9627,
      priceListVersion: 1,
    });
    expect(result.details.quoteDate).toBe('2026-11-05');
    expect(result.details.priceLock).toEqual({
      code: 'price_locked_from_quote',
      params: {
        quoteDate: '2026-11-05',
        priceListVersion: 1,
        currentPriceListVersion: 2,
        currentMonthlyNetCents: 8857,
      },
    });
    const [first] = await listInvoices(db, result.details.contract.id);
    expect(first?.netCents).toBe(9627);

    const read = await getContractDetails(db, result.details.contract.id, '2026-11-06', data);
    expect(read).toEqual(result.details);
  });
});

describe('signContract, the last-unit race', () => {
  it('two approved applications for the same asset: the second is refused and writes nothing', async () => {
    const first = await application();
    const second = await application();
    expect(
      (await signContract(db, { applicationId: first, actor: 'cust-aino' }, '2026-11-05', data)).ok
    ).toBe(true);
    const before = await writesSoFar();

    expect(
      await signContract(db, { applicationId: second, actor: 'cust-aino' }, '2026-11-05', data)
    ).toEqual({ ok: false, reason: { code: 'asset_not_available', params: { status: 'leased' } } });
    expect(await writesSoFar()).toEqual(before);
    expect(await db.contract.findUnique({ where: { application_id: second } })).toBeNull();
  });

  it('two signings at the same instant: exactly one wins, the other is asset_not_available', async () => {
    const [first, second] = [await application(), await application()];
    const results = await Promise.all(
      [first, second].map((applicationId) =>
        signContract(db, { applicationId, actor: 'cust-aino' }, '2026-11-05', data)
      )
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({
      ok: false,
      reason: { code: 'asset_not_available', params: { status: 'leased' } },
    });
    expect(await writesSoFar()).toEqual({ contracts: 1, invoices: 36, passport: 1, audit: 1 });
  });

  it('the conditional write throws on an asset that is no longer available, rolling back the audit row', async () => {
    await db.asset.update({ where: { id: 'ebike-003' }, data: { status: 'leased' } });
    await expect(
      withAudit(
        db,
        { actor: 'test', action: 'contract.signed', entityType: 'contract', entityId: 'x' },
        (tx) => leaseAvailableAsset(tx, 'ebike-003')
      )
    ).rejects.toBeInstanceOf(AssetNotAvailableError);
    expect(await db.auditLog.count()).toBe(0);
  });
});

describe('signContract refusals write nothing', () => {
  it('not_enough_units for a stored quote row of 2 × ebike-003 from before D8 (D76): nothing written, asset still available', async () => {
    const applicationId = await application(CARD_1, 'approved', 2);
    expect(
      await signContract(db, { applicationId, actor: 'cust-aino' }, '2026-11-05', data)
    ).toEqual({
      ok: false,
      reason: { code: 'not_enough_units', params: { requested: 2, available: 1 } },
    });
    expect(await writesSoFar()).toEqual({ contracts: 0, invoices: 0, passport: 0, audit: 0 });
    expect((await getAsset(db, 'ebike-003'))?.status).toBe('available');
  });

  it('already_signed on a second signing of the same application', async () => {
    const applicationId = await application();
    await signContract(db, { applicationId, actor: 'cust-aino' }, '2026-11-05', data);
    const before = await writesSoFar();
    expect(
      await signContract(db, { applicationId, actor: 'cust-aino' }, '2026-11-05', data)
    ).toEqual({ ok: false, reason: { code: 'already_signed', params: { applicationId } } });
    expect(await writesSoFar()).toEqual(before);
  });

  it('D73: not_owner for another customer, not_signed_in for anonymous', async () => {
    const applicationId = await application();
    for (const [actor, code] of [
      ['cust-mikko', 'not_owner'],
      ['anonymous', 'not_signed_in'],
    ] as const) {
      expect(await signContract(db, { applicationId, actor }, '2026-11-05', data)).toEqual({
        ok: false,
        reason: refusal(code, 'sign_contract'),
      });
    }
    expect(await writesSoFar()).toEqual({ contracts: 0, invoices: 0, passport: 0, audit: 0 });
  });

  it('application_not_found for an unknown id', async () => {
    expect(
      await signContract(db, { applicationId: 'nope', actor: 'admin' }, '2026-11-05', data)
    ).toEqual({
      ok: false,
      reason: { code: 'application_not_found', params: { applicationId: 'nope' } },
    });
  });

  it('D73: a case awaiting the signatory is signatory_required, for the applicant and the admin', async () => {
    const applicationId = await application(CARD_1, 'awaiting_signatory');
    for (const actor of ['cust-aino', 'admin']) {
      expect(await signContract(db, { applicationId, actor }, '2026-11-05', data)).toEqual({
        ok: false,
        reason: refusal('signatory_required', 'sign_contract'),
      });
    }
    expect(await writesSoFar()).toEqual({ contracts: 0, invoices: 0, passport: 0, audit: 0 });
  });

  it.each(['rejected', 'manual_review'])(
    'application_not_approved when the decision is %s',
    async (decision) => {
      const applicationId = await application(CARD_1, decision);
      expect(
        await signContract(db, { applicationId, actor: 'cust-aino' }, '2026-11-05', data)
      ).toEqual({ ok: false, reason: { code: 'application_not_approved', params: { decision } } });
      expect(await writesSoFar()).toEqual({ contracts: 0, invoices: 0, passport: 0, audit: 0 });
      expect((await getAsset(db, 'ebike-003'))?.status).toBe('available');
    }
  );

  it('quote_expired after the 14 days, start_too_far past one year (D45)', async () => {
    const applicationId = await application();
    expect(
      await signContract(db, { applicationId, actor: 'cust-aino' }, '2026-11-20', data)
    ).toEqual({
      ok: false,
      reason: { code: 'quote_expired', params: { validUntil: '2026-11-19' } },
    });
    const far = await signContract(
      db,
      { applicationId, startDate: '2027-11-06', actor: 'cust-aino' },
      '2026-11-05',
      data
    );
    expect(far.ok || far.reason.code).toBe('start_too_far');
    expect(await writesSoFar()).toEqual({ contracts: 0, invoices: 0, passport: 0, audit: 0 });
  });
});

describe('the owner reads', () => {
  it('getContract and contractCustomerId read a signed contract, null for an unknown id', async () => {
    const applicationId = await application();
    const result = await signContract(
      db,
      { applicationId, actor: 'cust-aino' },
      '2026-11-05',
      data
    );
    if (!result.ok) throw new Error(result.reason.code);
    const { id } = result.details.contract;
    expect(await getContract(db, id)).toEqual(result.details.contract);
    expect(await contractCustomerId(db, id)).toBe('cust-aino');
    expect(await getContract(db, 'nope')).toBeNull();
    expect(await contractCustomerId(db, 'nope')).toBeNull();
  });

  it('contractIdOfApplication is null until signed, then the contract id (the Sign button, issue 39)', async () => {
    const applicationId = await application();
    expect(await contractIdOfApplication(db, applicationId)).toBeNull();
    const result = await signContract(
      db,
      { applicationId, actor: 'cust-aino' },
      '2026-11-05',
      data
    );
    if (!result.ok) throw new Error(result.reason.code);
    expect(await contractIdOfApplication(db, applicationId)).toBe(result.details.contract.id);
    expect(await contractIdOfApplication(db, 'nope')).toBeNull();
  });
});

describe('getContractDetails', () => {
  it('is null for an unknown contract', async () => {
    expect(await getContractDetails(db, 'nope', '2026-11-05', data)).toBeNull();
  });
});

describe('endContract, the contract operation the exits call (kickoff brief section 6)', () => {
  async function signed(): Promise<string> {
    const applicationId = await application();
    const result = await signContract(
      db,
      { applicationId, actor: 'cust-aino' },
      '2026-11-05',
      data
    );
    if (!result.ok) throw new Error(result.reason.code);
    return result.details.contract.id;
  }
  const entry = (id: string) => ({
    actor: 'admin',
    action: 'contract.ended_early',
    entityType: 'contract' as const,
    entityId: id,
  });

  it('ends an active contract once; a second call finds nothing active and returns null', async () => {
    const id = await signed();
    const first = await withAudit(db, entry(id), (tx) =>
      endContract(tx, { id, status: 'ended_early', endedOn: '2027-06-04' })
    );
    expect(first).toMatchObject({ status: 'ended_early', endedOn: '2027-06-04' });
    const second = await withAudit(db, entry(id), (tx) =>
      endContract(tx, { id, status: 'returned', endedOn: '2027-06-05' })
    );
    expect(second).toBeNull();
    expect((await getContract(db, id))?.status).toBe('ended_early');
  });

  it('D27: an end day before the start is a row error and nothing is written', async () => {
    const id = await signed();
    await expect(
      withAudit(db, entry(id), (tx) =>
        endContract(tx, { id, status: 'ended_early', endedOn: '2026-11-04' })
      )
    ).rejects.toThrow();
    expect((await getContract(db, id))?.status).toBe('active');
  });

  it('listContracts gives one customer their own contracts, newest first, and admin all (My leases)', async () => {
    const sign = async (terms: QuoteTerms) => {
      const result = await signContract(
        db,
        { applicationId: await application(terms), actor: 'cust-aino' },
        terms.today,
        data
      );
      if (!result.ok) throw new Error(result.reason.code);
      return result.details.contract.id;
    };
    const first = await sign(CARD_1);
    const second = await sign({ ...CARD_1, assetId: 'laptop-001', today: '2026-11-06' });

    expect((await listContracts(db, { customerId: 'cust-aino' })).map((c) => c.id)).toEqual([
      second,
      first,
    ]);
    expect(await listContracts(db, { customerId: 'cust-mikko' })).toEqual([]);
    expect(await listContracts(db, {})).toHaveLength(2);
  });
});
