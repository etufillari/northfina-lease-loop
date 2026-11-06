// Card 9 on a real migrated database: `ebike-007` came back fair with 18 400 km. Assessed on
// 6 Nov 2026 it is relisted as returned (no refurbishment beyond the mandatory steps) for
// wait-02, at 115 976 financed (D86: the market value, nothing added; D83: the new battery
// resets the usage the value counts, the odometer keeps its 18 400 km), and a quote at
// wait-02's term gives the matched rent.
import { refusal } from '../../../tests/helpers/authz';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedPack } from '../../../tests/helpers/invoice-fixture';
import { resetDb } from '../../../tests/helpers/reset-db';
import { createTestDb } from '../../../tests/helpers/test-db';
import { withProductionHandlers } from '../../../tests/helpers/with-handlers';
import { listAssetEvents } from '../asset-events';
import { getAsset } from '../assets';
import { verifyAuditChain } from '../audit';
import type { PrismaClient } from '../prisma-client';
import { createQuote } from '../quotes';
import {
  assessAsset,
  latestAssessment,
  previewAssessment,
  toAssessmentResponse,
} from '../second-life';
import { assessmentResponseSchema } from '../second-life-schemas';

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

const today = '2026-11-06';

describe('card 9: ebike-007 assessed, matched and relisted', () => {
  it('the preview writes nothing and decides: as returned, for wait-02', async () => {
    const preview = await previewAssessment(db, 'ebike-007', today);
    if (!preview.ok) throw new Error(preview.reason.code);
    expect(preview.proposal.contractId).toBeNull();
    expect(preview.proposal.match.decision).toEqual({
      code: 'relist_for_winner',
      params: { condition: 'fair', upgrade: false, demandId: 'wait-02' },
    });
    expect(await latestAssessment(db, 'ebike-007')).toBeNull();
    expect((await getAsset(db, 'ebike-007'))?.status).toBe('returned');
  });

  it('assessing writes the row, the passport and the asset available at its market value 115 976 (D86)', async () => {
    const result = await assessAsset(db, { assetId: 'ebike-007', actor: 'admin', today });
    if (!result.ok) throw new Error(result.reason.code);
    const row = await db.returnAssessment.findFirstOrThrow({ where: { asset_id: 'ebike-007' } });
    expect(row).toMatchObject({
      contract_id: null,
      condition: 'fair',
      usage_value: 18_400,
      refurbish: false,
      new_condition: 'fair',
      market_value_cents: 115_976,
      second_life_financed_cents: 115_976,
      matched_demand_id: 'wait-02',
    });
    expect(JSON.parse(row.refurbishment_json)).toEqual([
      { step: 'battery_replacement', cost_cents: 35_000 },
      { step: 'safety_inspection', cost_cents: 4_500 },
    ]);
    expect(await getAsset(db, 'ebike-007')).toMatchObject({
      status: 'available',
      condition: 'fair',
      // D83: the total never resets; the battery is on the row's steps.
      usage: { unit: 'km', value: 18_400 },
    });
    expect((await listAssetEvents(db, 'ebike-007')).map((e) => e.kind)).toEqual([
      'assessed',
      'refurbished',
      'repriced',
    ]);
    expect((await latestAssessment(db, 'ebike-007'))?.match.winner?.demandId).toBe('wait-02');
    // The route's answer holds to its contract.
    const answer = assessmentResponseSchema.parse(toAssessmentResponse(result.view));
    expect(answer).toMatchObject({
      newCondition: 'fair',
      refurbish: false,
      matchedDemandId: 'wait-02',
    });
    expect(await verifyAuditChain(db)).toMatchObject({ ok: true });
  });

  it("a quote at the winner's term gives the matched rent: 6 497 net for 12 months", async () => {
    await assessAsset(db, { assetId: 'ebike-007', actor: 'admin', today });
    const quote = await createQuote(db, {
      assetId: 'ebike-007',
      termMonths: 12,
      downPaymentCents: 0,
      today,
      actor: 'cust-aino',
    });
    if (!quote.ok) throw new Error(quote.reason.code);
    expect(quote.quote.breakdown).toMatchObject({
      unitListPriceCents: 115_976,
      financedCents: 115_976,
      band: 'A',
      monthlyNetCents: 6_497,
      // The live list's version: the amount is the assessment's, the list is v2 on 6 Nov.
      priceListVersion: 2,
    });
  });

  it('back again at 20 200 km (D83): no battery due, the value counts the 1 800 km since it', async () => {
    await assessAsset(db, { assetId: 'ebike-007', actor: 'admin', today });
    // Stand-in for a second lease and return: the odometer moved on 1 800 km.
    await db.asset.update({
      where: { id: 'ebike-007' },
      data: { status: 'returned', usage_value: 20_200 },
    });
    const preview = await previewAssessment(db, 'ebike-007', today);
    if (!preview.ok) throw new Error(preview.reason.code);
    expect(preview.proposal.input.usageAtLastReset).toBe(18_400);
    const fair = preview.proposal.assessment.options[0]!;
    expect(fair.plan.steps.map((s) => s.id)).toEqual(['safety_inspection']);
    expect(fair.plan.usageAfter.value).toBe(20_200);
    // 549 000 × 32.5 % × 0.65 × 0.98 (one step of 1 000 km) = 113 656.725 → 113 657.
    expect(fair.marketValue.usageSteps).toBe(1);
    expect(fair.marketValue.valueCents).toBe(113_657);
  });

  it('only admin assesses, and only a returned asset', async () => {
    expect(await assessAsset(db, { assetId: 'ebike-007', actor: 'cust-aino', today })).toEqual({
      ok: false,
      reason: refusal('admin_only', 'assess_asset'),
    });
    expect(await assessAsset(db, { assetId: 'ebike-003', actor: 'admin', today })).toEqual({
      ok: false,
      reason: { code: 'asset_not_returned', params: { assetId: 'ebike-003', status: 'available' } },
    });
    await assessAsset(db, { assetId: 'ebike-007', actor: 'admin', today });
    const again = await assessAsset(db, { assetId: 'ebike-007', actor: 'admin', today });
    expect(again).toMatchObject({ ok: false, reason: { code: 'asset_not_returned' } });
    expect(await assessAsset(db, { assetId: 'nope', actor: 'admin', today })).toMatchObject({
      ok: false,
      reason: { code: 'asset_not_found' },
    });
  });

  it('an entry already matched to another item is passed over (D62): wait-13 gets it, good', async () => {
    const first = await assessAsset(db, { assetId: 'ebike-008', actor: 'admin', today });
    if (!first.ok) throw new Error(first.reason.code);
    // Stand-in for an earlier match of wait-02 to another item.
    await db.returnAssessment.update({
      where: { id: first.view.id },
      data: { matched_demand_id: 'wait-02' },
    });
    const result = await assessAsset(db, { assetId: 'ebike-007', actor: 'admin', today });
    if (!result.ok) throw new Error(result.reason.code);
    const wait02 = result.view.match.verdicts.find((v) => v.demandId === 'wait-02');
    expect(wait02?.outcome.code).toBe('already_matched');
    expect(result.view.match.winner?.demandId).toBe('wait-13');
    expect((await getAsset(db, 'ebike-007'))?.condition).toBe('good');
  });

  it('the race (wave 3 finding 4): an entry won between the read and the write answers demand_taken and writes nothing', async () => {
    const first = await assessAsset(db, { assetId: 'ebike-008', actor: 'admin', today });
    if (!first.ok) throw new Error(first.reason.code);
    await db.returnAssessment.update({
      where: { id: first.view.id },
      data: { matched_demand_id: 'wait-02' },
    });
    // The second assessment read the taken entries before the first one wrote: a stale read.
    const stale = new Proxy(db, {
      get(target, property) {
        if (property === 'returnAssessment') {
          return { ...target.returnAssessment, findMany: async () => [] };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const audit = await db.auditLog.count();
    const result = await assessAsset(stale, { assetId: 'ebike-007', actor: 'admin', today });
    expect(result).toEqual({
      ok: false,
      reason: { code: 'demand_taken', params: { demandId: 'wait-02' } },
    });
    expect(await db.auditLog.count()).toBe(audit);
    expect((await getAsset(db, 'ebike-007'))?.status).toBe('returned');
  });

  it('a stored assessment that does not parse reads as none, never a crash', async () => {
    const result = await assessAsset(db, { assetId: 'ebike-007', actor: 'admin', today });
    if (!result.ok) throw new Error(result.reason.code);
    await db.returnAssessment.update({
      where: { id: result.view.id },
      data: { assessment_json: '{}' },
    });
    expect(await latestAssessment(db, 'ebike-007')).toBeNull();
  });
});
