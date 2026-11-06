// Whole sets for a multi-item waiter, against a real database. wait-08 (a non-profit) needs
// three office laptops and is first in the laptop queue. Nothing is held back for them: with
// too few laptops free at once, each returned laptop goes to the next person in line; once
// enough are free together (the desk item plus listed refurbished ones), the set is offered
// as one.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadSecondLifeDemand } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import { executeSecondLife, listReturnedDecisions } from './second-life';
import { shelfItems } from './second-life-offers';
import { seedWaitlist } from './waitlist';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
const AS_OF = '2026-11-05';

async function freshDb(): Promise<TestDb> {
  const test = await createTestDb();
  await seedAssets(test.db, await loadAssets());
  await seedWaitlist(test.db, await loadSecondLifeDemand());
  return test;
}

describe('too few laptops for wait-08: nobody waits for them', () => {
  let test: TestDb;
  beforeAll(async () => {
    test = await freshDb();
  });
  afterAll(async () => {
    await test.cleanup();
  });

  it('the desk skips wait-08 and offers both returned laptops to the next people', async () => {
    const desk = await listReturnedDecisions(test.db, AS_OF);
    for (const id of ['laptop-006', 'laptop-007']) {
      const entry = desk.find((d) => d.assetId === id)!;
      if (!entry.result.ok) throw new Error(entry.result.reason);
      const { outcome, decision, setPartners } = entry.result.preview;
      expect(outcome).toMatchObject({ kind: 'offer', withAssetIds: [] });
      expect(outcome).not.toMatchObject({ waiterId: 'wait-08' });
      expect(setPartners).toEqual([]);
      expect(decision.considered.find((v) => v.id === 'wait-08')?.outcome).toBe('set_incomplete');
    }
  });

  it('executing one offers it on at once, and wait-08 keeps waiting', async () => {
    const result = await executeSecondLife(test.db, {
      assetId: 'laptop-006',
      actor: 'staff-desk',
      asOf: AS_OF,
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.applied).toBe('offer');
    const hold = await test.db.reservation.findFirstOrThrow({
      where: { asset_id: 'laptop-006', active: true },
    });
    expect(hold.kind).toBe('waitlist_offer');
    expect(hold.waitlist_entry_id).not.toBe('wait-08');
    const waiter = await test.db.waitlistEntry.findUniqueOrThrow({ where: { id: 'wait-08' } });
    expect(waiter.status).toBe('waiting');
  });
});

describe('enough laptops free at once: the set is offered whole', () => {
  let test: TestDb;
  beforeAll(async () => {
    test = await freshDb();
    // Two are enough for this test: the rule is the same for any quantity.
    await test.db.waitlistEntry.update({ where: { id: 'wait-08' }, data: { quantity: 2 } });
    // A refurbished laptop already listed in the catalogue (the "shelf").
    await test.db.asset.update({
      where: { id: 'laptop-009' },
      data: { condition: 'good', second_life_price_cents: 30_077 },
    });
  });
  afterAll(async () => {
    await test.cleanup();
  });

  it('only refurbished, listed items are on the shelf', async () => {
    expect((await shelfItems(test.db)).map((i) => i.assetId)).toEqual(['laptop-009']);
  });

  it('the desk card shows the listed laptop as the rest of the set', async () => {
    const desk = await listReturnedDecisions(test.db, AS_OF);
    const entry = desk.find((d) => d.assetId === 'laptop-006')!;
    if (!entry.result.ok) throw new Error(entry.result.reason);
    expect(entry.result.preview.outcome).toEqual({
      kind: 'offer',
      waiterId: 'wait-08',
      withAssetIds: ['laptop-009'],
    });
    expect(entry.result.preview.setPartners).toEqual([
      // 30 077 × 0.028625 (band A, 36 months) = 860.95 → 861
      { assetId: 'laptop-009', monthlyNetRentCents: 861 },
    ]);
  });

  it('executing offers both laptops together, each with its own rent', async () => {
    const result = await executeSecondLife(test.db, {
      assetId: 'laptop-006',
      actor: 'staff-desk',
      asOf: AS_OF,
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.applied).toBe('offer');

    for (const id of ['laptop-006', 'laptop-009']) {
      const asset = await test.db.asset.findUniqueOrThrow({ where: { id } });
      expect(asset.status).toBe('reserved');
      const holds = await test.db.reservation.findMany({ where: { asset_id: id, active: true } });
      expect(holds).toEqual([
        expect.objectContaining({
          kind: 'waitlist_offer',
          until: '2026-11-08',
          waitlist_entry_id: 'wait-08',
        }),
      ]);
      const offer = await test.db.assetEvent.findFirstOrThrow({
        where: { asset_id: id, type: 'offered_to_waiter' },
      });
      const details = JSON.parse(offer.details_json!);
      expect(details).toMatchObject({ waiterId: 'wait-08', setSize: 2, termMonths: 36 });
      expect(details.monthlyNetRentCents).toBeGreaterThan(0);
    }
    const waiter = await test.db.waitlistEntry.findUniqueOrThrow({ where: { id: 'wait-08' } });
    expect(waiter).toMatchObject({ status: 'offered', offered_asset_id: 'laptop-006' });
    const audit = await test.db.auditLog.findFirstOrThrow({
      where: { action: 'asset.second_life_executed', entity_id: 'laptop-006' },
    });
    expect(JSON.parse(audit.details_json!)).toMatchObject({
      outcome: 'offer',
      winnerId: 'wait-08',
      setWith: ['laptop-009'],
    });
    expect(await shelfItems(test.db)).toEqual([]);
  });
});
