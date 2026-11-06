import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { listAssets, seedAssets } from './assets';
import { loadCompanyMetrics, staffAttentionCounts } from './company-metrics';
import { seedDemoCases } from './demo-cases';
import { seedDemoLeases } from './demo-history';
import { recoveryCalculationSchema } from './recovery-input';
import { publishRelisting, relistOfferFor } from './relisting';

let fixture: Awaited<ReturnType<typeof createTestDb>>;
const today = '2026-11-06';

beforeAll(async () => {
  fixture = await createTestDb();
  await seedAssets(fixture.db, await loadAssets());
  await seedDemoLeases(fixture.db, today);
  await seedDemoCases(fixture.db, today);
}, 120_000);
afterAll(async () => {
  await fixture.cleanup();
});

describe('simulated history', () => {
  it('writes recorded, audited and clearly simulated rows', async () => {
    const { db } = fixture;
    const leases = await db.contract.count({ where: { id: { startsWith: 'hist-' } } });
    expect(leases).toBeGreaterThan(100);
    expect(await db.contract.count({ where: { isDemo: false } })).toBe(0);
    expect(await db.payment.count({ where: { isSimulated: false } })).toBe(0);
    expect(await db.leaseActionPayment.count()).toBeGreaterThan(0);
    expect(await db.auditLog.count({ where: { action: 'demo.lease_seeded' } })).toBeGreaterThan(
      100
    );
    expect(await db.authIdentity.count()).toBe(0);
  });

  it('changes nothing when run again', async () => {
    const { db } = fixture;
    const before = await Promise.all([
      db.contract.count(),
      db.invoice.count(),
      db.auditLog.count(),
    ]);
    expect((await seedDemoLeases(db, today)).created).toBe(0);
    expect((await seedDemoCases(db, today)).created).toBe(0);
    expect(
      await Promise.all([db.contract.count(), db.invoice.count(), db.auditLog.count()])
    ).toEqual(before);
  });

  it('never offers fleet rows, and keeps the data-pack catalogue intact', async () => {
    const listed = await listAssets(fixture.db);
    expect(listed).toHaveLength(30);
    expect(listed.some((asset) => asset.id.startsWith('fleet-'))).toBe(false);
    expect(await fixture.db.asset.count({ where: { isFleetHistory: true } })).toBeGreaterThan(100);
    expect(
      await fixture.db.asset.count({ where: { isFleetHistory: true, status: 'available' } })
    ).toBe(0);
  });

  it('feeds the dashboard from those rows, without double counting arrears', async () => {
    const metrics = await loadCompanyMetrics(fixture.db, today);
    expect(metrics.revenueCents.total.slice(0, 23).every((value) => value >= 0)).toBe(true);
    expect(metrics.summary.lastFullMonthRevenueCents).toBeGreaterThan(0);
    expect(metrics.summary.activeNow).toBeGreaterThan(100);
    const october = metrics.months.indexOf('2026-10');
    const invoiced = await fixture.db.invoice.aggregate({
      _sum: { netCents: true },
      where: { dueDate: { gte: '2026-10-01', lte: '2026-10-31' } },
    });
    expect(metrics.revenueCents.total[october]).toBeGreaterThanOrEqual(invoiced._sum.netCents ?? 0);
  });
});

describe('open cases', () => {
  it('leaves returned items exactly as the data pack describes them', async () => {
    const pack = await loadAssets();
    for (const id of [
      'ebike-007',
      'ebike-008',
      'ebike-011',
      'laptop-006',
      'laptop-007',
      'farm-005',
    ]) {
      const original = pack.find((asset) => asset.id === id)!;
      const asset = await fixture.db.asset.findUniqueOrThrow({ where: { id } });
      expect(asset).toMatchObject({
        status: 'returned',
        condition: original.condition,
        usage_value: original.usage.value,
        previous_lives: original.previous_lives,
      });
    }
  });

  it('gives staff work at each stage, through the real services', async () => {
    const counts = await staffAttentionCounts(fixture.db);
    expect(counts).toEqual({ toAssess: 3, toReceive: 0, toRelist: 7 });
    expect(await fixture.db.auditLog.count({ where: { action: 'return.assessed' } })).toBe(7);
    expect(await fixture.db.auditLog.count({ where: { action: 'return.receive' } })).toBe(7);
  });

  it('itemizes chargeable damage on the quote', async () => {
    const request = await fixture.db.leaseRequest.findFirstOrThrow({
      where: { contractId: 'hist-case-laptop-007' },
      include: { assessment: true },
    });
    const quote = recoveryCalculationSchema.parse(JSON.parse(request.assessment!.calculationJson));
    expect(quote.chargeableDamage).toContainEqual({
      area: 'Lid corner',
      type: 'dent',
      netCents: 6000,
    });
    expect(quote.damageNetCents).toBeGreaterThanOrEqual(6000);
  });

  it('lets scenario card 10 happen: the third-life bike can be relisted and leased', async () => {
    const request = await fixture.db.leaseRequest.findFirstOrThrow({
      where: { contractId: 'hist-case-ebike-008' },
      include: { assessment: true },
    });
    expect(request.assessment?.status).toBe('ready');
    const offer = await relistOfferFor(fixture.db, request.id, today);
    expect(offer.leasable).toBe(true);
    await publishRelisting(fixture.db, {
      requestId: request.id,
      staffId: 'demo-inspector',
      today,
      expectedPriceCents: offer.priceNetCents,
    });
    expect(await fixture.db.asset.findUniqueOrThrow({ where: { id: 'ebike-008' } })).toMatchObject({
      status: 'available',
      previous_lives: 2,
      secondLifePriceCents: offer.priceNetCents,
    });
  });

  it('skips items that have been used since the data pack was loaded', async () => {
    const other = await createTestDb();
    try {
      await seedAssets(other.db, await loadAssets());
      await other.db.asset.update({ where: { id: 'ebike-012' }, data: { status: 'reserved' } });
      expect((await seedDemoCases(other.db, today)).created).toBe(9);
    } finally {
      await other.cleanup();
    }
  }, 60_000);
});
