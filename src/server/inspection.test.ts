// The return inspection end to end, against a real (test) database: Aino leases ebike-003
// new for 12 months and brings it back with 5,000 km. The desk suggests "good" (used → at
// best like new, minus one grade per 5,000 km), values it on that, and staff may correct it.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import { ainoScript, applyAndSubmit } from '../../tests/helpers/apply-and-submit';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import { signApplication } from './contracts';
import { seedCustomers } from './customers';
import { inspectReturn } from './inspection';
import { endOfTerm } from './lifecycle';
import { executeSecondLife, listReturnedDecisions } from './second-life';

type Db = Awaited<ReturnType<typeof createTestDb>>['db'];
let db: Db;
let cleanup: () => Promise<void>;
const RETURNED = '2027-11-05';

/** Leases ebike-003 for a year from `from` and returns it with `km` lifetime on the clock. */
async function returnWith(km: number, from = '2026-11-05', returned = RETURNED) {
  const state = await applyAndSubmit(db, {
    customerId: 'cust-aino',
    assetIds: ['ebike-003'],
    downPaymentCents: 0,
    termMonths: 12,
    script: ainoScript,
    asOf: from,
  });
  const signed = await signApplication(db, {
    applicationId: state.application.id,
    startDate: from,
    actor: 'cust-aino',
    asOf: from,
  });
  if (!signed.ok) throw new Error(signed.reason);
  const ended = await endOfTerm(db, {
    contractId: signed.contractId,
    action: 'return',
    actor: 'cust-aino',
    asOf: returned,
    usageReadings: { 'ebike-003': km },
  });
  if (!ended.ok) throw new Error(ended.reason);
}

async function card() {
  const desk = await listReturnedDecisions(db, RETURNED);
  const entry = desk.find((d) => d.assetId === 'ebike-003')!;
  if (!entry.result.ok) throw new Error(entry.result.reason);
  return entry.result.preview;
}

beforeEach(async () => {
  ({ db, cleanup } = await createTestDb());
  await seedAssets(db, await loadAssets());
  await seedCustomers(db, await loadCustomers());
});
afterEach(async () => {
  await cleanup();
});

describe('the return inspection', () => {
  it('suggests a grade from how it went out and how far it was ridden, and values it on that', async () => {
    await returnWith(5000);
    const preview = await card();
    expect(preview.inspection).toMatchObject({
      needed: true,
      conditionOut: 'new',
      usedDuringLease: 5000,
      wearStep: 5000,
      suggested: { condition: 'good', gradesForUse: 1 },
      inspected: null,
    });
    // The decision already uses the suggested grade, and the usage shows in the factors.
    expect(preview.asset.condition).toBe('good');
    expect(preview.decision.valueFactors.asReturned).toMatchObject({
      condition: 'good',
      conditionMultiplier: 0.85,
      usage: 5000,
      usagePercent: -10,
    });
  });

  it('staff can grade it worse (the value follows) but never better than it went out', async () => {
    await returnWith(5000);
    const before = (await card()).decision.valueAsReturnedCents;
    const asStaff = { assetId: 'ebike-003', actor: 'staff', asOf: RETURNED };
    expect(await inspectReturn(db, { ...asStaff, condition: 'new' })).toEqual({
      ok: true,
      condition: 'new',
    });
    expect(await inspectReturn(db, { ...asStaff, condition: 'fair' })).toEqual({
      ok: true,
      condition: 'fair',
    });
    const after = await card();
    expect(after.inspection).toMatchObject({ needed: false, inspected: 'fair' });
    expect(after.asset.condition).toBe('fair');
    expect(after.decision.valueAsReturnedCents).toBeLessThan(before);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'asset.inspected' } });
    expect(JSON.parse(audit.details_json!)).toMatchObject({ suggested: 'good' });
  });

  it('a grade better than it went out is refused', async () => {
    // This time the bike goes out in good condition.
    await db.asset.update({ where: { id: 'ebike-003' }, data: { condition: 'good' } });
    await returnWith(1000);
    const asStaff = { assetId: 'ebike-003', actor: 'staff', asOf: RETURNED };
    expect(await inspectReturn(db, { ...asStaff, condition: 'like_new' })).toEqual({
      ok: false,
      reason: 'better_than_out',
    });
    expect((await inspectReturn(db, { ...asStaff, condition: 'good' })).ok).toBe(true);
  });

  it('carrying the card out without inspecting accepts the suggestion', async () => {
    await returnWith(5000);
    const executed = await executeSecondLife(db, {
      assetId: 'ebike-003',
      actor: 'staff',
      asOf: RETURNED,
    });
    if (!executed.ok) throw new Error(executed.reason);
    const events = await db.assetEvent.findMany({
      where: { asset_id: 'ebike-003', on_date: RETURNED },
      orderBy: { id: 'asc' },
    });
    expect(events.map((e) => e.type).slice(0, 3)).toEqual(['returned', 'inspected', 'refurbished']);
    expect(JSON.parse(events[1]!.details_json!)).toMatchObject({
      condition: 'good',
      suggested: 'good',
    });
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });
    expect(['good', 'like_new']).toContain(asset.condition); // like new only if upgraded
  });

  it('wear counts across leases: 4,900 km twice is a grade, like 9,800 km once', async () => {
    await returnWith(4900);
    const first = await card();
    expect(first.inspection?.suggested).toMatchObject({
      condition: 'like_new',
      usedSinceBaseline: 4900,
    });
    const listed = await executeSecondLife(db, {
      assetId: 'ebike-003',
      actor: 'staff',
      asOf: RETURNED,
    });
    if (!listed.ok) throw new Error(listed.reason);

    // A second year with Aino: another 4,900 km.
    await returnWith(9800, RETURNED, '2028-11-05');
    const desk = await listReturnedDecisions(db, '2028-11-05');
    const second = desk.find((d) => d.assetId === 'ebike-003')!;
    if (!second.result.ok) throw new Error(second.result.reason);
    expect(second.result.preview.inspection).toMatchObject({
      conditionOut: 'like_new',
      usedDuringLease: 4900,
      baselineCondition: 'new',
      suggested: { condition: 'good', usedSinceBaseline: 9800, gradesForUse: 1 },
    });
  });

  it('an upgrade at the desk sets the condition anew: wear counts from there', async () => {
    // Nobody waits any more by 2029: ebike-007 (fair) is upgraded to good to be listed.
    const executed = await executeSecondLife(db, {
      assetId: 'ebike-007',
      actor: 'staff',
      asOf: '2029-04-29',
    });
    if (!executed.ok) throw new Error(executed.reason);
    expect(executed.preview.decision.upgrade).toMatchObject({ to: 'good' });
    const row = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-007' } });
    expect(row).toMatchObject({ wear_from_condition: 'good', wear_from_total: 18_400 });
  });

  it('the data pack’s returned items were graded already: no inspection', async () => {
    const desk = await listReturnedDecisions(db, '2026-11-05');
    const ebike007 = desk.find((d) => d.assetId === 'ebike-007')!;
    if (!ebike007.result.ok) throw new Error(ebike007.result.reason);
    expect(ebike007.result.preview.inspection).toBeNull();
    expect(
      await inspectReturn(db, {
        assetId: 'ebike-007',
        condition: 'poor',
        actor: 'staff',
        asOf: '2026-11-05',
      })
    ).toEqual({ ok: false, reason: 'no_return' });
  });
});
