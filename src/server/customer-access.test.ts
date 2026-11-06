import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import { createCustomerAccess, getContractByAccessToken } from './customer-access';
import { loadPricingData } from './pricing-data';
import type { PrismaClient } from './prisma-client';
import { createQuote } from './quotes';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  await db.auditLog.deleteMany();
  await db.customerAccessToken.deleteMany();
  await db.contract.deleteMany();
  await db.quote.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
});

describe('customer access links', () => {
  it('resolves a random token to its contract and audits its creation', async () => {
    const data = await loadPricingData();
    const quote = await createQuote(db, data, {
      assetId: 'ebike-003',
      termMonths: 36,
      downPaymentCents: 0,
      onDate: '2026-11-06',
      actor: 'test',
    });
    const contract = await db.contract.create({
      data: {
        id: 'contract-access-1',
        quote_id: quote.id,
        asset_id: 'ebike-003',
        customer_id: 'cust-aino',
        status: 'active',
        signed_on: '2026-11-06',
        start_date: '2026-11-06',
        end_date: '2029-11-05',
        price_list_version: quote.priceListVersion,
        list_price_cents: quote.listPriceCents,
        down_payment_cents: quote.downPaymentCents,
        term_months: quote.termMonths,
        financed_cents: quote.financedCents,
        band: quote.band,
        monthly_factor: quote.monthlyFactor,
        annual_interest_percent: quote.annualInterestPercent,
        monthly_net_rent_cents: quote.monthlyNetRentCents,
        buyout_percent: quote.buyoutPercent,
        buyout_net_cents: quote.buyoutNetCents,
        contract_net_total_cents: quote.contractNetTotalCents,
        price_lock_json: JSON.stringify({}),
      },
    });

    const access = await createCustomerAccess(db, {
      contractId: contract.id,
      actor: 'cust-aino',
      createdAt: new Date('2026-11-06T00:00:00Z'),
    });

    expect(access.token).not.toContain(contract.id);
    expect((await getContractByAccessToken(db, access.token)).id).toBe(contract.id);
    expect(await db.auditLog.count({ where: { action: 'customer_access.created' } })).toBe(1);
    const expired = await createCustomerAccess(db, {
      contractId: contract.id,
      actor: 'cust-aino',
      createdAt: new Date('2020-01-01T00:00:00Z'),
    });
    await expect(getContractByAccessToken(db, expired.token)).rejects.toMatchObject({
      code: 'ACCESS_LINK_INVALID',
    });
  });
});
