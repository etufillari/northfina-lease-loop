// The asset event log on a real, migrated SQLite database: validation, the order of the log
// and the passport and impact read on top of it (card 10).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createContractFixture } from '../../tests/helpers/contract-fixture';
import { createTestDb } from '../../tests/helpers/test-db';
import { resetDb } from '../../tests/helpers/reset-db';
import { appendAssetEvent, listAssetEvents, readFleetImpact, readPassport } from './asset-events';
import { withAudit, type AuditEntry } from './audit';
import type { PrismaClient } from './prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
beforeEach(async () => {
  await resetDb(db);
  await createContractFixture(db, {
    assetId: 'ebike-008',
    contractId: 'c-third',
    previousLives: 2,
  });
  await createContractFixture(db, { assetId: 'ebike-009', contractId: 'c-other' });
});
afterAll(async () => {
  await cleanup();
});

const entry: AuditEntry = {
  actor: 'team-test',
  action: 'asset.event_logged',
  entityType: 'asset',
  entityId: 'ebike-008',
};

describe('appendAssetEvent and listAssetEvents', () => {
  it('refuses an unknown kind and writes nothing', async () => {
    await expect(
      withAudit(db, entry, (tx) =>
        appendAssetEvent(tx, {
          assetId: 'ebike-009',
          // @ts-expect-error: not a kind
          kind: 'stolen',
          onDate: '2026-11-06',
        })
      )
    ).rejects.toThrow();
    expect(await listAssetEvents(db, 'ebike-009')).toEqual([]);
  });

  it('refuses a day that is not a real ISO day', async () => {
    await expect(
      withAudit(db, entry, (tx) =>
        appendAssetEvent(tx, { assetId: 'ebike-009', kind: 'assessed', onDate: '2026-02-30' })
      )
    ).rejects.toThrow();
  });

  it('lists the events in log order, two on one day kept as written', async () => {
    await withAudit(db, entry, async (tx) => {
      await appendAssetEvent(tx, {
        assetId: 'ebike-008',
        kind: 'assessed',
        onDate: '2026-11-06',
        details: { grade: 'good' },
      });
      await appendAssetEvent(tx, {
        assetId: 'ebike-008',
        contractId: 'c-third',
        kind: 'leased',
        onDate: '2026-11-06',
      });
    });
    const events = await listAssetEvents(db, 'ebike-008');
    expect(events.map((e) => [e.kind, e.on_date, e.contract_id])).toEqual([
      ['assessed', '2026-11-06', null],
      ['leased', '2026-11-06', 'c-third'],
    ]);
    expect(events[0]!.details).toEqual({ grade: 'good' });
    expect(events[0]!.id).toBeLessThan(events[1]!.id);
  });
});

// ebike-008's third life as card 10 logs it: assessed, the safety inspection (4 500), then
// leased on c-third on 2026-11-06.
async function logThirdLife(costCents = 4_500) {
  await withAudit(db, entry, async (tx) => {
    await appendAssetEvent(tx, {
      assetId: 'ebike-008',
      kind: 'assessed',
      onDate: '2026-11-06',
      details: { grade: 'good' },
    });
    await appendAssetEvent(tx, {
      assetId: 'ebike-008',
      kind: 'refurbished',
      onDate: '2026-11-06',
      details: { costCents },
    });
    await appendAssetEvent(tx, {
      assetId: 'ebike-008',
      contractId: 'c-third',
      kind: 'leased',
      onDate: '2026-11-06',
    });
  });
}

describe('readPassport', () => {
  beforeEach(() => logThirdLife());

  it('card 10: ebike-008 has two past lives and its third, 58 kg saved after 24 months', async () => {
    const result = await readPassport(db, 'ebike-008', '2028-11-05');
    expect(result?.passport.lives.map((life) => [life.estimated, life.months])).toEqual([
      [true, 24],
      [true, 24],
      [false, 24],
    ]);
    // The assessment ahead of the third lease sits in the gap after the past lives.
    expect(result?.passport.lives[1]!.between.map((e) => e.kind)).toEqual([
      'assessed',
      'refurbished',
    ]);
    expect(result?.co2.perLifeKg).toEqual([0, 29, 29]);
    expect(result?.co2.totalKg).toBe(58);
    // D80 at the list price as new (v2, 188 900): 37 780 of a new bike's use a 24-month life,
    // minus 4 500 (life 2: the mandatory inspection, no record; life 3: the logged cost)
    expect(result?.money).toEqual({ perLifeCents: [0, 33_280, 33_280], totalCents: 66_560 });
  });

  it('on the signing day the third life has earned nothing yet', async () => {
    const result = await readPassport(db, 'ebike-008', '2026-11-06');
    expect(result?.co2.totalKg).toBe(29);
    expect(result?.money.totalCents).toBe(33_280);
  });

  it('an asset with no history has no lives and no saving', async () => {
    const result = await readPassport(db, 'ebike-009', '2026-11-06');
    expect(result?.passport.lives).toEqual([]);
    expect(result?.co2.totalKg).toBe(0);
    expect(result?.money.totalCents).toBe(0);
  });

  it('an unknown asset is null', async () => {
    expect(await readPassport(db, 'nope', '2026-11-06')).toBeNull();
  });
});

describe('readPassport, a costlier refurbishment', () => {
  it('a life charges what its refurbishment really cost: 37 780 − 39 500 saves nothing', async () => {
    await logThirdLife(39_500);
    const result = await readPassport(db, 'ebike-008', '2028-11-05');
    expect(result?.money).toEqual({ perLifeCents: [0, 33_280, 0], totalCents: 33_280 });
  });
});

describe('readFleetImpact', () => {
  beforeEach(() => logThirdLife());

  it('totals the fleet from the past lives and the log', async () => {
    const { fleet, money, assets } = await readFleetImpact(db, '2028-11-05');
    expect(fleet.perCategory.find((row) => row.category === 'e_bike')).toEqual({
      category: 'e_bike',
      assetsWithLaterLife: 1,
      kg: 58,
    });
    expect(fleet.totalKg).toBe(58);
    expect(money.perCategory.find((row) => row.category === 'e_bike')?.cents).toBe(66_560);
    expect(money.totalCents).toBe(66_560);
    expect(assets.map((item) => [item.asset.id, item.kg])).toEqual([['ebike-008', 58]]);
  });
});
