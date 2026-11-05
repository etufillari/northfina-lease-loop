// Card 7 against a real, migrated SQLite database (see tests/global-setup.ts): a signed contract
// with a down payment and its invoices add up to the same total (D-037).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { quoteAndSign } from '../../tests/helpers/quote-and-sign';
import { createTestDb } from '../../tests/helpers/test-db';
import { loadAssets } from '@/data/load';
import { answersFromCustomer } from '@/domain/persona';
import { billedBefore, invoiceSchedule } from '@/domain/invoicing';
import { seedAssets } from './assets';
import { getContract, type LeaseDataPack } from './contracts';
import { loadLeaseDataPack } from './lease-data';
import type { PrismaClient } from './prisma-client';

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

function haapalaAnswers() {
  const customer = data.customers.find((c) => c.id === 'cust-haapala');
  if (!customer) throw new Error('cust-haapala missing from the data pack');
  return { ...answersFromCustomer(customer), q_farm_registry: 'FR-2876543' };
}

// Card 7: farm-002 (145 000 €), 48 months, 20 000 € down, on 5 Nov 2026.
const card7 = {
  assetId: 'farm-002',
  termMonths: 48,
  downPaymentCents: 2_000_000,
  today: '2026-11-05',
  actor: 'customer',
};

describe('card 7, the big ticket, signed', () => {
  it('cannot be signed by Haapala in the app: a PEP always goes to manual review', async () => {
    const answers = { ...haapalaAnswers(), q_pep_details: 'Municipal council, since 2021' };
    expect(await quoteAndSign(db, data, { ...card7, customerId: 'cust-haapala', answers })).toEqual(
      { ok: false, reason: 'application_needs_review' }
    );
  });

  it('bills invoice 0 for the down payment, so the invoices add up to the contract total', async () => {
    // The same deal for a new company applicant who is not a PEP, so it can be signed. Its own
    // email and business ID (1572860-0: weighted sum 220, mod 11 = 0), or it would be held to
    // Haapala's record (D-040).
    const answers = {
      ...haapalaAnswers(),
      q_email: 'office@newfarm.example.com',
      q_business_id: '1572860-0',
      q_pep: 'no',
    };
    const signed = await quoteAndSign(db, data, { ...card7, answers });
    if (!signed.ok) throw new Error(signed.reason);
    const found = await getContract(db, signed.id);
    if (!found) throw new Error('contract not stored');

    // 2 000 000 + 48 × 272 038 = 15 057 824 net. Before invoice 0, the invoices said 13 057 824.
    expect(found.contract.totalNetCostCents).toBe(15_057_824);
    const schedule = invoiceSchedule(found.contract, data.vatRates);
    if (!schedule.ok) throw new Error(schedule.reason);
    // What the contract page and GET /api/contracts/:id show while the lease runs.
    const billed = billedBefore(schedule, null);
    // VAT: 510 000 on the down payment (25.5 %), 2 × 69 370 + 46 × 70 730 on the rents.
    expect(billed.totals).toEqual({
      netCents: 15_057_824,
      vatCents: 3_902_320,
      grossCents: 18_960_144,
    });
    expect(billed.downPayment).toMatchObject({ number: 0, netCents: 2_000_000 });
    expect(billed.invoices).toHaveLength(48);
  });
});
