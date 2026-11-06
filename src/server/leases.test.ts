import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { toAssetRowData } from './assets';
import { withAudit } from './audit';
import { createDemoLease } from './demo-lease';
import { findCustomerLease, listCustomerLeases, requestLeaseChange } from './leases';

let fixture: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  fixture = await createTestDb();
  const asset = (await loadAssets()).find((item) => item.id === 'ebike-005');
  if (!asset) throw new Error('Missing demo asset');
  await withAudit(
    fixture.db,
    { actor: 'test', action: 'test.setup', entityType: 'test', entityId: 'setup' },
    async (tx) => {
      await tx.asset.create({ data: toAssetRowData(asset) });
      for (const id of ['a', 'b']) {
        await tx.user.create({
          data: {
            id,
            name: id,
            email: `${id}@example.com`,
            customer: { create: { id: `customer-${id}` } },
          },
        });
      }
    }
  );
});
afterEach(async () => {
  await fixture.cleanup();
});

describe('customer leases', () => {
  it('creates one explicitly simulated demo and isolates it from another customer', async () => {
    const id = await createDemoLease(fixture.db, {
      customerId: 'customer-a',
      userId: 'a',
      today: '2026-11-05',
    });
    const own = await findCustomerLease(fixture.db, 'customer-a', id);
    expect(own?.isDemo).toBe(true);
    expect(own?.invoices[0]?.payments[0]?.isSimulated).toBe(true);
    expect(own?.asset.previous_lives).toBe(1);
    expect(await findCustomerLease(fixture.db, 'customer-b', id)).toBeNull();
    expect(await listCustomerLeases(fixture.db, 'customer-b')).toHaveLength(0);
    await expect(
      createDemoLease(fixture.db, { customerId: 'customer-a', userId: 'a', today: '2026-11-05' })
    ).rejects.toMatchObject({ status: 409 });
    expect((await fixture.db.asset.findUniqueOrThrow({ where: { id: 'ebike-005' } })).status).toBe(
      'available'
    );
  });
  it('requires ownership and an active lease, records one pending request and audits it', async () => {
    const id = await createDemoLease(fixture.db, {
      customerId: 'customer-a',
      userId: 'a',
      today: '2026-11-05',
    });
    await expect(
      requestLeaseChange(fixture.db, {
        customerId: 'customer-b',
        userId: 'b',
        contractId: id,
        kind: 'return',
      })
    ).rejects.toMatchObject({ status: 404 });
    const result = await requestLeaseChange(fixture.db, {
      customerId: 'customer-a',
      userId: 'a',
      contractId: id,
      kind: 'return',
    });
    expect(result.status).toBe('pending');
    await expect(
      requestLeaseChange(fixture.db, {
        customerId: 'customer-a',
        userId: 'a',
        contractId: id,
        kind: 'buyout',
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(await fixture.db.leaseRequest.count()).toBe(1);
    expect(
      await fixture.db.auditLog.findFirst({
        where: { actor: 'a', action: 'lease.requested', entity_id: id },
      })
    ).not.toBeNull();
    expect((await fixture.db.contract.findUniqueOrThrow({ where: { id } })).status).toBe('active');
  });
});
