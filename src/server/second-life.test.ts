// Scenario card 9 end to end against a real database: ebike-007 comes back fair with
// 18,400 km. Battery + inspection, no upgrade, wait-02 wins (accepts fair, joined first),
// wait-13 is excluded because it needs 'good'. Executing it is audited and holds the item.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadCo2Factors, loadSecondLifeDemand } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import {
  executeSecondLife,
  lifeCo2Kg,
  listReturnedDecisions,
  previewSecondLife,
  toSecondLifeRequest,
} from './second-life';
import { seedWaitlist } from './waitlist';

let db: Awaited<ReturnType<typeof createTestDb>>['db'];
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  await seedAssets(db, await loadAssets());
  await seedWaitlist(db, await loadSecondLifeDemand());
});
afterAll(async () => {
  await cleanup();
});

const AS_OF = '2026-11-05';

describe('toSecondLifeRequest', () => {
  it('maps a waiting-list row back to the data-pack shape', async () => {
    const row = await db.waitlistEntry.findUniqueOrThrow({ where: { id: 'wait-02' } });
    expect(toSecondLifeRequest(row)).toEqual({
      id: 'wait-02',
      category: 'e_bike',
      max_monthly_net_rent_cents: 9000,
      min_condition: 'fair',
      preferred_term_months: 12,
      needed_by: '2026-11-10',
      joined_on: '2026-10-01',
      quantity: 1,
      customer_id: 'cust-pekka',
      who: 'Delivery courier, accepts scratches',
    });
  });

  it('rejects a row edited into an impossible condition', async () => {
    const row = await db.waitlistEntry.findUniqueOrThrow({ where: { id: 'wait-02' } });
    expect(() => toSecondLifeRequest({ ...row, min_condition: 'mint' })).toThrow();
  });
});

describe('lifeCo2Kg', () => {
  it('scales the reuse saving by the remaining-value fraction', async () => {
    const factors = await loadCo2Factors();
    const half = lifeCo2Kg(
      { category: 'e_bike', valueCents: 50_000, originalListPriceCents: 100_000 },
      factors
    );
    // 165 kg × (1 − 0.12) × 0.5 = 72.6 kg
    expect(half).toEqual({ kg: 72.6, remainingValueFraction: 0.5 });
  });

  it('gives 0 kg when there is no original price to compare with', async () => {
    const factors = await loadCo2Factors();
    expect(
      lifeCo2Kg({ category: 'laptop', valueCents: 10_000, originalListPriceCents: 0 }, factors)
    ).toEqual({ kg: 0, remainingValueFraction: 0 });
  });
});

describe('scenario card 9: ebike-007', () => {
  it('previews battery + inspection, no upgrade, wait-02 wins and wait-13 is excluded', async () => {
    const result = await previewSecondLife(db, 'ebike-007', AS_OF);
    if (!result.ok) throw new Error(result.reason);
    const { decision, winner, winnerQuote, waiters } = result.preview;

    expect(decision.requiredItems.map((i) => i.id)).toEqual([
      'battery_replacement',
      'safety_inspection',
    ]);
    expect(decision.requiredTotalCents).toBe(39_500);
    expect(decision.usageAfterRefurb).toBe(0);
    expect(decision.upgrade).toBeNull();
    expect(decision.action).toBe('lease_to_waiter');
    expect(decision.financedCents).toBe(decision.valueFinalCents + 39_500);

    expect(winner?.id).toBe('wait-02');
    expect(winnerQuote?.termMonths).toBe(12);
    expect(winnerQuote?.monthlyNetRentCents).toBeLessThanOrEqual(9000);
    const verdict = (id: string) => decision.considered.find((v) => v.id === id)?.outcome;
    expect(verdict('wait-02')).toBe('matched');
    expect(verdict('wait-13')).toBe('condition_below_minimum');
    expect(waiters['wait-13']?.min_condition).toBe('good');
  });

  it('lists ebike-007 on the desk among the other returned assets', async () => {
    const desk = await listReturnedDecisions(db, AS_OF);
    const ids = desk.map((row) => row.assetId);
    expect(ids).toContain('ebike-007');
    expect(ids).toContain('ebike-008');
    expect(desk.every((row) => row.result.ok)).toBe(true);
  });

  it('executes it: passport events, reset usage, one more life, a 7-day offer hold', async () => {
    const result = await executeSecondLife(db, {
      assetId: 'ebike-007',
      actor: 'staff-desk',
      asOf: AS_OF,
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.applied).toBe('offer');
    expect(result.co2AvoidedKg).toBeGreaterThan(0);

    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-007' } });
    expect(asset).toMatchObject({
      status: 'reserved',
      condition: 'fair',
      usage_value: 0,
      // The data pack already counts the life it came back from: this is its second life.
      previous_lives: 1,
    });

    const events = await db.assetEvent.findMany({
      where: { asset_id: 'ebike-007' },
      orderBy: { id: 'asc' },
    });
    expect(events.map((e) => e.type)).toEqual(['refurbished', 'offered_to_waiter']);
    expect(JSON.parse(events[0]!.details_json!)).toMatchObject({
      totalCents: 39_500,
      usageReset: true,
      usageBefore: 18_400,
      life: 2,
      co2AvoidedKg: result.co2AvoidedKg,
    });

    const reservation = await db.reservation.findFirstOrThrow({
      where: { asset_id: 'ebike-007', active: true },
    });
    expect(reservation).toMatchObject({ kind: 'waitlist_offer', until: '2026-11-12' });

    const waiter = await db.waitlistEntry.findUniqueOrThrow({ where: { id: 'wait-02' } });
    expect(waiter).toMatchObject({ status: 'offered', offered_asset_id: 'ebike-007' });

    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: 'asset.second_life_executed', entity_id: 'ebike-007' },
    });
    expect(audit.actor).toBe('staff-desk');
    expect(JSON.parse(audit.details_json!)).toMatchObject({
      outcome: 'offer',
      winnerId: 'wait-02',
    });
  });

  it('refuses to run twice: the asset is no longer returned', async () => {
    const again = await executeSecondLife(db, {
      assetId: 'ebike-007',
      actor: 'staff-desk',
      asOf: AS_OF,
    });
    expect(again).toEqual({ ok: false, reason: 'not_returned' });
  });

  it('never offers a second item to someone who already has an offer', async () => {
    const result = await previewSecondLife(db, 'ebike-008', AS_OF);
    if (!result.ok) throw new Error(result.reason);
    expect(result.preview.decision.considered.map((v) => v.id)).not.toContain('wait-02');
  });
});

describe('counting lives', () => {
  it('counts a life that ended in the app (a returned event) exactly once', async () => {
    const before = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-011' } });
    await db.assetEvent.create({
      data: { asset_id: 'ebike-011', type: 'returned', on_date: '2026-11-01' },
    });
    const result = await executeSecondLife(db, {
      assetId: 'ebike-011',
      actor: 'staff-desk',
      asOf: AS_OF,
    });
    if (!result.ok) throw new Error(result.reason);
    const after = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-011' } });
    expect(after.previous_lives).toBe(before.previous_lives + 1);
    const refurbished = await db.assetEvent.findFirstOrThrow({
      where: { asset_id: 'ebike-011', type: 'refurbished' },
    });
    expect(JSON.parse(refurbished.details_json!).life).toBe(before.previous_lives + 2);
  });
});

describe('failure paths', () => {
  it('reports an unknown asset', async () => {
    expect(await previewSecondLife(db, 'no-such-asset', AS_OF)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(
      await executeSecondLife(db, { assetId: 'no-such-asset', actor: 'x', asOf: AS_OF })
    ).toEqual({ ok: false, reason: 'not_found' });
  });

  it('reports a returned asset that has no price in price list v1', async () => {
    const template = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-008' } });
    await db.asset.create({
      data: {
        ...template,
        id: 'ebike-unpriced',
        serial_number: 'LL-TEST-UNPRICED',
        created_at: undefined,
        updated_at: undefined,
      },
    });
    expect(await previewSecondLife(db, 'ebike-unpriced', AS_OF)).toEqual({
      ok: false,
      reason: 'no_v1_price',
    });
  });
});
