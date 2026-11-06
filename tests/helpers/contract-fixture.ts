// A signed contract and the rows it hangs on (customer, asset, quote, application), for tests
// that need a real `contract_id` foreign key. Writes straight through `db`: test set-up only.
import type { PrismaClient } from '@/server/prisma-client';

export async function createContractFixture(
  db: PrismaClient,
  ids: { assetId: string; contractId: string; customerId?: string; previousLives?: number }
) {
  const customerId = ids.customerId ?? `cust-${ids.contractId}`;
  await db.customer.upsert({
    where: { id: customerId },
    update: {},
    create: {
      id: customerId,
      type: 'consumer',
      name: 'Test Customer',
      country: 'FI',
      city: 'Helsinki',
      email: 'test@example.test',
      is_pep: false,
      story: 'fixture',
    },
  });
  await db.asset.upsert({
    where: { id: ids.assetId },
    update: {},
    create: {
      id: ids.assetId,
      category: 'e_bike',
      make: 'Kettu Bikes',
      model: 'Urban 1',
      model_year: 2022,
      serial_number: `SN-${ids.assetId}`,
      condition: 'good',
      usage_unit: 'km',
      usage_value: 9800,
      previous_lives: ids.previousLives ?? 0,
      status: 'available',
    },
  });
  const prices = {
    list_price_cents: 250000,
    down_payment_cents: 0,
    financed_cents: 250000,
    band: 'A',
    factor_millionths: 45000,
    term_months: 24,
    monthly_net_cents: 11250,
    buyout_cents: 25000,
    price_list_version: 1,
  };
  const quote = await db.quote.create({
    data: {
      asset_id: ids.assetId,
      quote_date: '2026-11-06',
      valid_until: '2026-12-06',
      vat_rate_bp_at_quote: 2550,
      ...prices,
    },
  });
  const application = await db.application.create({
    data: {
      customer_id: customerId,
      quote_id: quote.id,
      answers_json: '{}',
      decision: 'approved',
      reasons_json: '[]',
      decided_on: '2026-11-06',
    },
  });
  await db.contract.create({
    data: {
      id: ids.contractId,
      number: `LL-${ids.contractId}`,
      application_id: application.id,
      customer_id: customerId,
      asset_id: ids.assetId,
      signed_on: '2026-11-06',
      start_date: '2026-11-06',
      end_date: '2028-11-05',
      vat_rate_bp_at_signing: 2550,
      status: 'active',
      ...prices,
    },
  });
  return { customerId };
}
