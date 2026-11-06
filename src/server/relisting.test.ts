import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { inspectionChecks, type InspectionRecord } from '@/domain/inspection';
import { createTestDb } from '../../tests/helpers/test-db';
import { toAssetRowData } from './assets';
import { withAudit } from './audit';
import { createDemoLease } from './demo-lease';
import { requestLeaseChange } from './leases';
import { acceptReturn, assessReturn, progressReturn } from './recovery';
import { recoveryCalculationSchema, type RecoveryInspection } from './recovery-input';
import { publishedRefurbishment, publishRelisting, relistOfferFor } from './relisting';

let fixture: Awaited<ReturnType<typeof createTestDb>>;
let contractId: string;
let requestId: string;
const today = '2026-11-06';
const later = '2027-03-06';

function record(overrides: Partial<InspectionRecord> = {}): InspectionRecord {
  return {
    usageSource: 'display',
    customerPresent: true,
    checks: inspectionChecks('e_bike').map(({ id }) => ({
      id,
      result: id === 'brakes' ? 'repair' : 'pass',
      repairCents: id === 'brakes' ? 5000 : 0,
      note: '',
    })),
    readings: [{ id: 'battery_health', value: 90 }],
    damage: [],
    ...overrides,
  };
}
const inspection = (overrides: Partial<InspectionRecord> = {}, repairCents = 5000) => ({
  condition: 'fair' as const,
  targetCondition: 'good' as const,
  usageValue: 3000,
  ageMonths: 12,
  additionalRepairCents: repairCents,
  notes: 'Replace the brake pads.',
  record: record(overrides),
});

beforeEach(async () => {
  fixture = await createTestDb();
  const asset = (await loadAssets()).find((item) => item.id === 'ebike-005');
  if (!asset) throw new Error('Missing asset');
  await withAudit(
    fixture.db,
    { actor: 'test', action: 'test.setup', entityType: 'asset', entityId: asset.id },
    async (tx) => {
      await tx.asset.create({ data: toAssetRowData(asset) });
      await tx.user.createMany({
        data: [
          { id: 'staff', name: 'Inspector', email: 'inspector@example.com', role: 'staff' },
          { id: 'owner', name: 'Owner', email: 'owner@example.com' },
        ],
      });
      await tx.customer.create({ data: { id: 'owner-customer', ownerUserId: 'owner' } });
    }
  );
  contractId = await createDemoLease(fixture.db, {
    customerId: 'owner-customer',
    userId: 'owner',
    today,
  });
  requestId = (
    await requestLeaseChange(fixture.db, {
      customerId: 'owner-customer',
      userId: 'owner',
      contractId,
      kind: 'return',
      report: { condition: 'fair', usageValue: 3000, issues: ['brakes_fault'], notes: '' },
    })
  ).id;
});
afterEach(async () => {
  await fixture.cleanup();
});

async function assessAndReceive() {
  const assessment = await assessReturn(fixture.db, {
    requestId,
    staffId: 'staff',
    today,
    inspection: inspection(),
  });
  await acceptReturn(fixture.db, {
    requestId,
    contractId,
    customerId: 'owner-customer',
    userId: 'owner',
    today,
    action: 'accept',
    expectedAssessmentUpdatedAt: assessment.updatedAt.toISOString(),
    paymentMethod: 'card',
  });
  await progressReturn(fixture.db, { requestId, staffId: 'staff', today, action: 'receive' });
  return recoveryCalculationSchema.parse(JSON.parse(assessment.calculationJson));
}

describe('itemized assessment', () => {
  it('rejects an incomplete record, a mismatched total and a grade above the findings', async () => {
    const assess = (value: RecoveryInspection) =>
      assessReturn(fixture.db, { requestId, staffId: 'staff', today, inspection: value });
    await expect(assess(inspection({ checks: [] }))).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_INSPECTION',
    });
    await expect(assess(inspection({}, 1))).rejects.toMatchObject({
      code: 'INVALID_INSPECTION',
    });
    await expect(assess({ ...inspection(), condition: 'good' })).rejects.toMatchObject({
      code: 'CONDITION_ABOVE_FINDINGS',
    });
  });

  it('charges logged customer damage, even with no grade drop, without adding the two', async () => {
    const damage = [
      { area: 'Fork', type: 'dent' as const, liability: 'chargeable' as const, repairCents: 40000 },
      { area: 'Grip', type: 'other' as const, liability: 'fair_wear' as const, repairCents: 1000 },
    ];
    const assessment = await assessReturn(fixture.db, {
      requestId,
      staffId: 'staff',
      today,
      inspection: inspection({ damage }, 46000),
    });
    const quote = recoveryCalculationSchema.parse(JSON.parse(assessment.calculationJson));
    expect(quote.damageNetCents).toBe(45000);
    expect(quote.chargeableDamage).toEqual([
      { area: 'brakes', type: 'repair', netCents: 5000, checkId: 'brakes' },
      { area: 'Fork', type: 'dent', netCents: 40000 },
    ]);
    expect(quote.settlement.customerRepairNetCents).toBeGreaterThan(0);
    expect(quote.settlement.customerRepairNetCents).toBeLessThanOrEqual(45000);
  });
});

describe('relisting', () => {
  const ready = assessAndReceive;

  it('shows the quoted price on the quote date and publishes exactly that', async () => {
    const quote = await ready();
    const offer = await relistOfferFor(fixture.db, requestId, today);
    expect(offer).toMatchObject({
      priceNetCents: quote.recovery.postRepairValueCents,
      priceChangeSinceQuoteCents: 0,
      leasable: true,
    });
    expect(offer.monthlyTotalCents).toBeGreaterThan(0);
    const before = await fixture.db.asset.findUniqueOrThrow({ where: { id: 'ebike-005' } });
    expect(before.status).toBe('returned');
    await publishRelisting(fixture.db, {
      requestId,
      staffId: 'staff',
      today,
      expectedPriceCents: offer.priceNetCents,
    });
    const asset = await fixture.db.asset.findUniqueOrThrow({ where: { id: 'ebike-005' } });
    expect(asset).toMatchObject({
      status: 'available',
      condition: 'good',
      secondLifePriceCents: offer.priceNetCents,
    });
  });

  it('refuses a price the staff member did not see, leaving the item unpublished', async () => {
    const quote = await ready();
    const offer = await relistOfferFor(fixture.db, requestId, later);
    expect(offer.priceNetCents).toBeLessThan(quote.recovery.postRepairValueCents);
    expect(offer.priceChangeSinceQuoteCents).toBeLessThan(0);
    await expect(
      publishRelisting(fixture.db, {
        requestId,
        staffId: 'staff',
        today: later,
        expectedPriceCents: quote.recovery.postRepairValueCents,
      })
    ).rejects.toMatchObject({ code: 'PRICE_CHANGED' });
    const asset = await fixture.db.asset.findUniqueOrThrow({ where: { id: 'ebike-005' } });
    expect(asset).toMatchObject({ status: 'returned', secondLifePriceCents: null });
  });

  it('publishes the aged price once it has been reviewed', async () => {
    await ready();
    const offer = await relistOfferFor(fixture.db, requestId, later);
    const published = await publishRelisting(fixture.db, {
      requestId,
      staffId: 'staff',
      today: later,
      expectedPriceCents: offer.priceNetCents,
    });
    expect(published.publishedPriceCents).toBe(offer.priceNetCents);
  });

  it('needs staff and a received item, and a ready item can still be retired', async () => {
    await expect(
      publishRelisting(fixture.db, { requestId, staffId: 'staff', today, expectedPriceCents: 1 })
    ).rejects.toMatchObject({ status: 404 });
    const quote = await assessAndReceive();
    const price = quote.recovery.postRepairValueCents;
    await expect(
      publishRelisting(fixture.db, {
        requestId,
        staffId: 'owner',
        today,
        expectedPriceCents: price,
      })
    ).rejects.toMatchObject({ status: 403 });
    expect(
      await progressReturn(fixture.db, { requestId, staffId: 'staff', today, action: 'retire' })
    ).toMatchObject({ status: 'retired' });
    await expect(
      publishRelisting(fixture.db, {
        requestId,
        staffId: 'staff',
        today,
        expectedPriceCents: price,
      })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('still publishes a case saved as received before receipt made items ready', async () => {
    const quote = await assessAndReceive();
    await withAudit(
      fixture.db,
      { actor: 'test', action: 'test.legacy', entityType: 'lease_request', entityId: requestId },
      (tx) => tx.returnAssessment.update({ where: { requestId }, data: { status: 'received' } })
    );
    expect(
      await publishRelisting(fixture.db, {
        requestId,
        staffId: 'staff',
        today,
        expectedPriceCents: quote.recovery.postRepairValueCents,
      })
    ).toMatchObject({ status: 'published' });
  });

  it('shows the public what changed only once published, without any notes', async () => {
    await ready();
    expect(await publishedRefurbishment(fixture.db, 'ebike-005')).toBeNull();
    const offer = await relistOfferFor(fixture.db, requestId, today);
    await publishRelisting(fixture.db, {
      requestId,
      staffId: 'staff',
      today,
      expectedPriceCents: offer.priceNetCents,
    });
    const found = await publishedRefurbishment(fixture.db, 'ebike-005');
    expect(found).toMatchObject({
      battery: { kind: 'measured', percent: 90 },
    });
    expect(found?.changes).toContainEqual({ kind: 'part', checkId: 'brakes', action: 'repaired' });
    expect(JSON.stringify(found)).not.toContain('Replace the brake pads');
  });

  it('reports an unknown case as not found', async () => {
    await expect(relistOfferFor(fixture.db, 'missing', today)).rejects.toMatchObject({
      status: 404,
    });
  });
});
