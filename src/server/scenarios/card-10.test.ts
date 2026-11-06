// Card 10 on a real migrated database: ebike-008's passport and CO2 as the data pack seeds it
// (two past lives, "good", 9 800 km), and what a return at the end of a lease adds to a
// passport, and ebike-008 assessed, relisted and leased a third time (wave 3): the pack
// has it `returned`, and the assessment makes it `available` at its second-life price.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { payRents, signedContract } from '../../../tests/helpers/journey';
import { seedPack } from '../../../tests/helpers/invoice-fixture';
import { resetDb } from '../../../tests/helpers/reset-db';
import { createTestDb } from '../../../tests/helpers/test-db';
import { withProductionHandlers } from '../../../tests/helpers/with-handlers';
import { listAssetEvents, readPassport } from '../asset-events';
import { getAsset } from '../assets';
import { verifyAuditChain } from '../audit';
import { getContract } from '../contracts';
import { exitContract } from '../exits';
import type { PrismaClient } from '../prisma-client';
import { createQuote } from '../quotes';
import { assessAsset, loadSecondLifeData } from '../second-life';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetDb(db);
  await seedPack(db);
});
withProductionHandlers();

describe('card 10: ebike-008, two lives, good, 9 800 km', () => {
  it('the seeded passport has both past lives, estimated, and 29 kg avoided by the second', async () => {
    const asset = await getAsset(db, 'ebike-008');
    expect(asset).toMatchObject({ status: 'returned', condition: 'good', previous_lives: 2 });
    const read = await readPassport(db, 'ebike-008', '2026-11-05');
    expect(read?.passport.lives.map((l) => [l.months, l.estimated])).toEqual([
      [24, true],
      [24, true],
    ]);
    expect(read?.co2.perLifeKg).toEqual([0, 29]);
    expect(read?.co2.totalKg).toBe(29);
  });

  it('a returned item is not quoted until it is made available again', async () => {
    const quote = await createQuote(db, {
      assetId: 'ebike-008',
      termMonths: 24,
      downPaymentCents: 0,
      today: '2026-11-05',
      actor: 'cust-aino',
    });
    expect(quote).toEqual({
      ok: false,
      reason: { code: 'asset_not_available', params: { assetId: 'ebike-008', status: 'returned' } },
    });
  });

  it('ebike-008 is leased a third time after its assessment: three lives, 58 kg saved', async () => {
    const assessed = await assessAsset(db, {
      assetId: 'ebike-008',
      actor: 'admin',
      today: '2026-11-06',
    });
    if (!assessed.ok) throw new Error(assessed.reason.code);
    // 179 900 (v1) × 26 % (58 months) × 0.85 × 82 % (9 steps of 1 000 km) = 32 601; D86: the price is that value, the 4 500 inspection is our cost.
    expect(assessed.view.match.relist).toMatchObject({
      condition: 'good',
      upgrade: false,
      secondLifeFinancedCents: 32_601,
    });
    expect(assessed.view.match.winner?.demandId).toBe('wait-05');

    const olavi = 'cust-olavi';
    const trip = { customerId: olavi, assetId: 'ebike-008', termMonths: 24, quoteOn: '2026-11-06' };
    const { contract } = await signedContract(db, trip);
    // 32 601 × 0.036637 = 1 194.40 → 1 194 (band A).
    expect([contract.financedCents, contract.monthlyNetCents]).toEqual([32_601, 1_194]);
    expect((await getAsset(db, 'ebike-008'))?.status).toBe('leased');

    const read = await readPassport(db, 'ebike-008', contract.endDate);
    expect(read?.passport.lives.map((l) => [l.months, l.estimated])).toEqual([
      [24, true],
      [24, true],
      [24, false],
    ]);
    expect(read?.passport.lives[1]?.between.map((e) => e.kind)).toEqual([
      'assessed',
      'refurbished',
      'repriced',
    ]);
    expect(read?.passport.before).toEqual([]);
    expect(read?.co2.perLifeKg).toEqual([0, 29, 29]);
    expect(read?.co2.totalKg).toBe(58);
    expect(await verifyAuditChain(db)).toMatchObject({ ok: true });
  });
});

describe('a returned item leased again (D16: the contract chain)', () => {
  it('card 1 returned, assessed and leased again: the new contract names the old one', async () => {
    const aino = 'cust-aino';
    const card1 = { customerId: aino, assetId: 'ebike-003', termMonths: 36, quoteOn: '2026-11-05' };
    const { contract } = await signedContract(db, card1);
    await payRents(db, contract.id, 36, aino);
    const returned = await exitContract(
      db,
      {
        contractId: contract.id,
        mode: 'return',
        reported: { condition: 'good', usage: { unit: 'km', value: 9_000 } },
        actor: aino,
      },
      contract.endDate
    );
    if (!returned.ok) throw new Error(returned.reason.code);

    const assessed = await assessAsset(db, {
      assetId: 'ebike-003',
      actor: 'admin',
      today: contract.endDate,
    });
    if (!assessed.ok) throw new Error(assessed.reason.code);
    // D31/D60: a first-life item is valued from its own contract's list price and start day.
    expect(assessed.view.contractId).toBe(contract.id);
    expect(assessed.view.input.newPriceCents).toBe(contract.unitListPriceCents);
    // Valued on the term's last day: 35 whole months since the start.
    expect(assessed.view.assessment.ageMonths).toBe(35);

    const next = {
      customerId: 'cust-lena',
      assetId: 'ebike-003',
      termMonths: 12,
      quoteOn: contract.endDate,
    };
    const second = await signedContract(db, next);
    const row = await db.contract.findUniqueOrThrow({ where: { id: second.contract.id } });
    expect(row.previous_contract_id).toBe(contract.id);
    expect(second.contract.financedCents).toBe(assessed.view.match.relist.secondLifeFinancedCents);
    const read = await readPassport(db, 'ebike-003', second.contract.endDate);
    expect(read?.passport.lives.map((l) => l.contractId)).toEqual([
      contract.id,
      second.contract.id,
    ]);
    expect(read?.passport.lives[0]?.between.map((e) => e.kind)).toEqual([
      'assessed',
      'refurbished',
      'repriced',
    ]);
  });
});
describe('the passport after a return at the end of the lease', () => {
  it('card 1 run to its end and given back: a dated, counted life ending in returned', async () => {
    const aino = 'cust-aino';
    const card1 = { customerId: aino, assetId: 'ebike-003', termMonths: 36, quoteOn: '2026-11-05' };
    const { contract } = await signedContract(db, card1);
    await payRents(db, contract.id, 36, aino);

    const returned = await exitContract(
      db,
      {
        contractId: contract.id,
        mode: 'return',
        reported: { condition: 'good', usage: { unit: 'km', value: 9_000 } },
        actor: aino,
      },
      contract.endDate
    );
    if (!returned.ok) throw new Error(returned.reason.code);
    expect((await getContract(db, contract.id))?.status).not.toBe('active');
    expect((await getAsset(db, 'ebike-003'))?.status).toBe('returned');
    expect((await listAssetEvents(db, 'ebike-003')).map((e) => e.kind)).toEqual([
      'leased',
      'returned',
    ]);
    const read = await readPassport(db, 'ebike-003', contract.endDate);
    expect(read?.passport.lives.at(-1)).toMatchObject({
      start: '2026-11-05',
      estimated: false,
      endKind: 'returned',
      months: 36,
    });
    expect(await verifyAuditChain(db)).toMatchObject({ ok: true });
  });
});

describe('an item no condition can lease is not relisted (relist_unpriced)', () => {
  it('refuses the assessment, writes nothing and leaves ebike-008 returned', async () => {
    const data = structuredClone(await loadSecondLifeData());
    // Every band starts above any second-life amount: no option has a rent on any term.
    const shift = 100_000_000;
    data.pricing.table.bands = data.pricing.table.bands.map((b) => ({
      ...b,
      min_financed_cents: b.min_financed_cents + shift,
      max_financed_cents: b.max_financed_cents + shift,
    }));
    const today = '2026-11-06';
    const result = await assessAsset(db, { assetId: 'ebike-008', actor: 'admin', today }, data);
    expect(result).toEqual({
      ok: false,
      reason: { code: 'relist_unpriced', params: { assetId: 'ebike-008' } },
    });
    expect(await db.returnAssessment.count({ where: { asset_id: 'ebike-008' } })).toBe(0);
    expect((await getAsset(db, 'ebike-008'))?.status).toBe('returned');
  });
});
