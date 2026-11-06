// A signed contract row for the invoices tests: card 1 (ebike-003, 36 months from 2026-11-05,
// net 10 730, no down payment) unless overridden. Writes the quote, application and contract
// the way wave 2's signing will, straight through the test database.
import type { EventOf } from '@/domain/events';
import { loadAssets, loadCustomers } from '@/data/load';
import { seedAssets } from '@/server/assets';
import { seedCustomers } from '@/server/customers';
import type { PrismaClient } from '@/server/prisma-client';

export type ContractTerms = {
  signedOn: string;
  startDate: string;
  endDate: string;
  termMonths: number;
  downPaymentCents: number;
  netRentCents: number;
  buyoutCents: number;
};

export const CARD_1: ContractTerms = {
  signedOn: '2026-11-05',
  startDate: '2026-11-05',
  endDate: '2029-11-04',
  termMonths: 36,
  downPaymentCents: 0,
  netRentCents: 10_730,
  buyoutCents: 58_350,
};

let counter = 0;

export async function seedPack(db: PrismaClient): Promise<void> {
  await seedAssets(db, await loadAssets());
  await seedCustomers(db, await loadCustomers());
}

/** Inserts a contract for `cust-aino` on `ebike-003` and returns its CONTRACT_SIGNED event. */
export async function insertContract(
  db: PrismaClient,
  terms: ContractTerms = CARD_1
): Promise<EventOf<'CONTRACT_SIGNED'>> {
  counter += 1;
  const financed = 389_000;
  const quote = await db.quote.create({
    data: {
      asset_id: 'ebike-003',
      quote_date: terms.signedOn,
      valid_until: terms.signedOn,
      price_list_version: 1,
      list_price_cents: financed + terms.downPaymentCents,
      down_payment_cents: terms.downPaymentCents,
      financed_cents: financed,
      band: 'B',
      factor_millionths: 27_584,
      term_months: terms.termMonths,
      monthly_net_cents: terms.netRentCents,
      buyout_cents: terms.buyoutCents,
      vat_rate_bp_at_quote: 2_550,
    },
  });
  const application = await db.application.create({
    data: {
      customer_id: 'cust-aino',
      quote_id: quote.id,
      answers_json: '{}',
      decision: 'approved',
      reasons_json: '[]',
      decided_on: terms.signedOn,
    },
  });
  const contract = await db.contract.create({
    data: {
      number: `LL-TEST-${counter}`,
      application_id: application.id,
      customer_id: 'cust-aino',
      asset_id: 'ebike-003',
      signed_on: terms.signedOn,
      start_date: terms.startDate,
      end_date: terms.endDate,
      term_months: terms.termMonths,
      list_price_cents: financed + terms.downPaymentCents,
      down_payment_cents: terms.downPaymentCents,
      financed_cents: financed,
      band: 'B',
      factor_millionths: 27_584,
      monthly_net_cents: terms.netRentCents,
      buyout_cents: terms.buyoutCents,
      vat_rate_bp_at_signing: 2_550,
      price_list_version: 1,
      status: 'active',
    },
  });
  return {
    type: 'CONTRACT_SIGNED',
    contractId: contract.id,
    customerId: 'cust-aino',
    assetId: 'ebike-003',
    quantity: 1,
    signedOn: terms.signedOn,
    startDate: terms.startDate,
    endDate: terms.endDate,
    termMonths: terms.termMonths,
    downPaymentCents: terms.downPaymentCents,
    netRentCents: terms.netRentCents,
    buyoutCents: terms.buyoutCents,
    vatRateBasisPoints: 2_550,
  };
}
