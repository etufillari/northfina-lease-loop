import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { toAssetRowData } from './assets';
import { withAudit } from './audit';
import { listCoLeaseCandidates, saveCoLeaseShares } from './co-lease';
import { createDemoLease } from './demo-lease';
import { findCustomerLease } from './leases';

let fixture: Awaited<ReturnType<typeof createTestDb>>;
let contractId: string;
const today = '2026-11-06';
const save = (
  shares: { userId: string; percent: number }[],
  overrides: Partial<Parameters<typeof saveCoLeaseShares>[1]> = {}
) =>
  saveCoLeaseShares(fixture.db, {
    customerId: 'customer',
    userId: 'owner',
    contractId,
    today,
    shares,
    ...overrides,
  });
const split = [
  { userId: 'owner', percent: 50 },
  { userId: 'demo-user-0', percent: 30 },
  { userId: 'demo-user-9', percent: 20 },
];

beforeEach(async () => {
  fixture = await createTestDb();
  const asset = (await loadAssets()).find((item) => item.id === 'ebike-005')!;
  await withAudit(
    fixture.db,
    { actor: 'test', action: 'test.setup', entityType: 'asset', entityId: asset.id },
    async (tx) => {
      await tx.asset.create({ data: toAssetRowData(asset) });
      await tx.user.createMany({
        data: [
          { id: 'owner', name: 'Owner', email: 'owner@example.com' },
          { id: 'other', name: 'Other', email: 'other@example.com' },
          { id: 'demo-user-0', name: 'Aada Aalto', email: 'a@example.com' },
          { id: 'demo-user-9', name: 'Eero Heikkinen', email: 'b@example.com' },
        ],
      });
      await tx.customer.createMany({
        data: [
          { id: 'customer', ownerUserId: 'owner' },
          { id: 'other-customer', ownerUserId: 'other' },
        ],
      });
    }
  );
  contractId = await createDemoLease(fixture.db, {
    customerId: 'customer',
    userId: 'owner',
    today,
  });
});
afterEach(async () => {
  await fixture.cleanup();
});

describe('saveCoLeaseShares', () => {
  it('saves an audited split that the lease then shows, with no email exposed', async () => {
    await save(split);
    const lease = await findCustomerLease(fixture.db, 'customer', contractId);
    expect(lease?.coLeaseShares).toHaveLength(3);
    expect(lease?.coLeaseShares.find((share) => share.isHolder)?.percent).toBe(50);
    expect(Object.keys(lease!.coLeaseShares[0]!.user).sort()).toEqual(['id', 'name']);
    expect(await fixture.db.auditLog.count({ where: { action: 'lease.co_lease_changed' } })).toBe(
      1
    );
  });

  it('replaces a same-day change but keeps earlier versions for earlier invoices', async () => {
    await save(split);
    await save([{ userId: 'owner', percent: 100 }]);
    expect(await fixture.db.coLeaseShare.count()).toBe(1);
    await save(split, { today: '2026-12-01' });
    expect(await fixture.db.coLeaseShare.count()).toBe(4);
  });

  it('rejects a bad total, a real account, and another customer', async () => {
    await expect(save([{ userId: 'owner', percent: 90 }])).rejects.toMatchObject({ status: 400 });
    await expect(
      save([
        { userId: 'owner', percent: 50 },
        { userId: 'other', percent: 50 },
      ])
    ).rejects.toMatchObject({ code: 'INVALID_SHARES' });
    await expect(save(split, { customerId: 'other-customer' })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('refuses leases that have ended and real contracts', async () => {
    await withAudit(
      fixture.db,
      { actor: 'test', action: 'test.setup', entityType: 'contract', entityId: contractId },
      (tx) => tx.contract.update({ where: { id: contractId }, data: { status: 'bought' } })
    );
    await expect(save(split)).rejects.toMatchObject({ code: 'LEASE_INACTIVE' });
    await withAudit(
      fixture.db,
      { actor: 'test', action: 'test.setup', entityType: 'contract', entityId: contractId },
      (tx) =>
        tx.contract.update({
          where: { id: contractId },
          data: { status: 'active', isDemo: false },
        })
    );
    await expect(save(split)).rejects.toMatchObject({ code: 'REAL_LEASE' });
  });

  it('offers only the dummy accounts', async () => {
    expect((await listCoLeaseCandidates(fixture.db)).map((user) => user.id)).toEqual([
      'demo-user-0',
      'demo-user-9',
    ]);
  });
});
