// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { quoteAndSign } from '../../tests/helpers/quote-and-sign';
import { createTestDb } from '../../tests/helpers/test-db';
import { loadAssets } from '@/data/load';
import { listAuditLog } from './audit';
import { seedAssets } from './assets';
import { endLease, getContractEnding } from './contract-endings';
import { getContract, type LeaseDataPack } from './contracts';
import { loadLeaseDataPack } from './lease-data';
import { loadSecondLifeDataPack } from './second-life';
import { CorruptRowError } from './stored-row';
import type { PrismaClient } from './prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let data: LeaseDataPack & { secondLife: Awaited<ReturnType<typeof loadSecondLifeDataPack>> };
let contractId: number;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  const [lease, secondLife] = await Promise.all([loadLeaseDataPack(), loadSecondLifeDataPack()]);
  data = { ...lease, secondLife };
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await db.contractEnding.deleteMany();
  await db.contract.deleteMany();
  await db.quote.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
  // Card 1: Aino signs ebike-003 (new, 0 km, no earlier lives) for 36 months on 5 Nov 2026.
  const signed = await quoteAndSign(db, data, {
    assetId: 'ebike-003',
    customerId: 'cust-aino',
    termMonths: 36,
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
    today: '2026-11-05',
    actor: 'cust-aino',
  });
  if (!signed.ok) throw new Error(`setup failed: ${signed.reason}`);
  contractId = signed.id;
});

const end = (choice: Parameters<typeof endLease>[2]['choice'], today = '2029-11-05') =>
  endLease(db, data, { contractId, choice, today, actor: 'cust-aino' });

const asset = () => db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });

describe('endLease', () => {
  it('buys the item: buyout invoice with 2029 VAT, item sold, contract untouched (card 1)', async () => {
    const before = await getContract(db, contractId);
    const result = await end({ kind: 'buy' });
    // 58 350 net (DATA.md worked example) + 26 % = 15 171 VAT, 73 521 in total.
    expect(result).toMatchObject({
      ok: true,
      ending: { kind: 'buy', buyoutInvoice: { netCents: 58_350, grossCents: 73_521 } },
    });

    expect(await asset()).toMatchObject({ status: 'sold', previous_lives: 1 });
    expect(await getContract(db, contractId)).toEqual(before);
    expect(await getContractEnding(db, contractId)).toEqual(result.ok && result.ending);
    const [audit] = await listAuditLog(db, 1);
    expect(audit).toMatchObject({
      action: 'contract.ended_buy',
      entity_id: String(contractId),
      actor: 'cust-aino',
      details: { asOf: '2029-11-05' }, // the `today` given to end() (D-030)
    });
  });

  it('returns the item with its inspection recorded', async () => {
    const result = await end({ kind: 'return', condition: 'good', usageValue: 18_400 });
    expect(result.ok).toBe(true);
    expect(await asset()).toMatchObject({
      status: 'returned',
      condition: 'good',
      usage_value: 18_400,
      previous_lives: 1,
    });
  });

  it('passes the item on to a named persona', async () => {
    const result = await end({
      kind: 'pass_on',
      condition: 'like_new',
      usageValue: 3_000,
      nextLessee: 'cust-sanna',
    });
    expect(result).toMatchObject({ ok: true, ending: { nextLessee: 'cust-sanna' } });
    expect((await asset()).status).toBe('returned');
  });

  it('refuses an unknown persona as the next lessee', async () => {
    const result = await end({
      kind: 'pass_on',
      condition: 'good',
      usageValue: 1,
      nextLessee: 'cust-nobody',
    });
    expect(result).toEqual({ ok: false, reason: 'unknown_customer' });
  });

  it('refuses a second ending and leaves the first one in place', async () => {
    await end({ kind: 'buy' });
    expect(await end({ kind: 'return', condition: 'good', usageValue: 1 })).toEqual({
      ok: false,
      reason: 'already_ended',
    });
    expect((await getContractEnding(db, contractId))?.kind).toBe('buy');
  });

  it('refuses before the final month and writes nothing', async () => {
    expect(await end({ kind: 'buy' }, '2027-03-01')).toEqual({
      ok: false,
      reason: 'too_early',
      opensOn: '2029-10-05',
    });
    expect(await getContractEnding(db, contractId)).toBeNull();
    expect((await asset()).status).toBe('reserved');
    expect((await listAuditLog(db)).map((a) => a.action)).toEqual([
      'contract.signed',
      'quote.created',
    ]);
  });

  it('refuses a missing contract', async () => {
    const result = await endLease(db, data, {
      contractId: 999_999,
      choice: { kind: 'buy' },
      today: '2029-11-05',
      actor: 'x',
    });
    expect(result).toEqual({ ok: false, reason: 'contract_not_found' });
  });

  it('refuses when the item is no longer out on lease', async () => {
    await db.asset.update({ where: { id: 'ebike-003' }, data: { status: 'available' } });
    expect(await end({ kind: 'buy' })).toEqual({ ok: false, reason: 'asset_not_leased' });
  });

  it('treats a malformed stored ending as a server error, not a bad request', async () => {
    expect((await end({ kind: 'buy' })).ok).toBe(true);
    await db.contractEnding.update({
      where: { contract_id: contractId },
      data: { ending_json: '{"kind":"melted"}' },
    });
    await expect(getContractEnding(db, contractId)).rejects.toThrow(CorruptRowError);
  });

  it('treats a stored condition outside the schema as a server error', async () => {
    await db.asset.update({ where: { id: 'ebike-003' }, data: { condition: 'shiny' } });
    await expect(end({ kind: 'return', condition: 'good', usageValue: 0 })).rejects.toThrow(
      CorruptRowError
    );
  });
});

describe('endLease: pass it on to someone from the waiting list (D-048)', () => {
  // A 12-month lease of ebike-003 signed on 2 Jan 2026 (the demo date set back): the choice opens
  // on 2 Dec 2026 and the bike is handed over on 2 Jan 2027, before wait-04's deadline (5 Jan
  // 2027) but after wait-01's and wait-02's.
  let shortLease: number;
  beforeEach(async () => {
    await db.contract.deleteMany();
    await db.quote.deleteMany();
    await db.asset.deleteMany();
    await seedAssets(db, await loadAssets());
    const signed = await quoteAndSign(db, data, {
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
    shortLease = signed.id;
  });

  const passOn = (nextLessee: string) =>
    endLease(db, data, {
      contractId: shortLease,
      choice: { kind: 'pass_on', condition: 'good', usageValue: 3_000, nextLessee },
      today: '2026-12-15',
      actor: 'cust-aino',
    });

  it('passes the bike to wait-04 (bakery: good, 24 months, up to 120 € a month)', async () => {
    const result = await passOn('wait-04');
    expect(result).toMatchObject({ ok: true, ending: { kind: 'pass_on', nextLessee: 'wait-04' } });
    expect(await asset()).toMatchObject({ status: 'returned', condition: 'good' });
    const [audit] = await listAuditLog(db, 1);
    expect(audit).toMatchObject({
      action: 'contract.ended_pass_on',
      details: { nextLessee: 'wait-04' },
    });
  });

  it('refuses someone the bike does not fit and writes nothing', async () => {
    // wait-01 needed a bike by 20 Nov 2026, before the handover.
    expect(await passOn('wait-01')).toEqual({ ok: false, reason: 'waiting_list_not_a_match' });
    expect(await getContractEnding(db, shortLease)).toBeNull();
    expect((await asset()).status).toBe('reserved');
  });

  it('refuses an id that is not on the waiting list', async () => {
    expect(await passOn('wait-99')).toEqual({ ok: false, reason: 'unknown_waiting_list_entry' });
  });
});
