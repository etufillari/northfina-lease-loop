import { expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { withAudit } from './audit';
import { toAssetRowData } from './assets';
import { createDemoLease } from './demo-lease';
import { leaseActionContext, payBuyout } from './lease-actions';
it('buys an owned simulated lease once without staff approval and rejects another owner', async () => {
  const fixture = await createTestDb();
  const db = fixture.db;
  try {
    const asset = (await loadAssets()).find((a) => a.id === 'ebike-005')!;
    await withAudit(
      db,
      { actor: 'test', action: 'test.setup', entityType: 'customer', entityId: 'owner' },
      async (tx) => {
        await tx.user.create({
          data: {
            id: 'owner',
            name: 'Owner',
            email: 'buyout@example.com',
            customer: { create: { id: 'customer' } },
          },
        });
        await tx.asset.create({ data: toAssetRowData(asset) });
      }
    );
    const id = await createDemoLease(db, {
      customerId: 'customer',
      userId: 'owner',
      today: '2026-11-06',
    });
    await expect(
      leaseActionContext(db, 'another-customer', id, '2026-11-06')
    ).rejects.toMatchObject({ status: 404 });
    const data = await leaseActionContext(db, 'customer', id, '2026-11-06');
    const input = {
      customerId: 'customer',
      userId: 'owner',
      contractId: id,
      today: '2026-11-06',
      quoteDate: '2026-11-06',
      expectedTotalCents: data.quote.buyoutTotalCents,
      token: 'f941b658-7c3a-478b-9432-1bcc73c72d73',
      paymentMethod: 'card',
    };
    const receipt = await payBuyout(db, input);
    expect(await payBuyout(db, input)).toBe(receipt);
    expect(await db.leaseActionPayment.count()).toBe(1);
    expect((await db.contract.findUniqueOrThrow({ where: { id } })).status).toBe('bought');
  } finally {
    await fixture.cleanup();
  }
});
