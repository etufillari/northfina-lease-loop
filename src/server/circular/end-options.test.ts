import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/test-db';
import { loadAssets, loadVatRates } from '@/data/load';
import { toAssetRowData } from '@/server/assets';
import { submitApplication } from '@/server/applications';
import { signAndActivateContract } from '@/server/lease-engine/real-contract';
import { completeLease } from '@/server/lease-engine/leases';
import { issueInvoice } from '@/server/lease-engine/invoices';
import { selectEndOption } from './end-options';
import { receiveReturn, requestReturn } from './service';
let database: Awaited<ReturnType<typeof createTestDb>>;
let leaseId: string;
const ctx = (key: string) => ({ actor: 'operator', idempotencyKey: key });
beforeAll(async () => {
  database = await createTestDb();
});
afterAll(async () => {
  await database.cleanup();
});
beforeEach(async () => {
  const db = database.db;
  await db.leaseSettlement.deleteMany();
  await db.assetReturn.deleteMany();
  await db.circularOffer.deleteMany();
  await db.engineAllocation.deleteMany();
  await db.engineInvoice.deleteMany();
  await db.engineLease.deleteMany();
  await db.engineCommandReceipt.deleteMany();
  await db.engineInvoiceCounter.deleteMany();
  await db.contract.deleteMany();
  await db.application.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  const asset = (await loadAssets()).find((a) => a.id === 'ebike-003');
  if (!asset) throw new Error('fixture');
  await db.asset.create({ data: toAssetRowData(asset) });
  await submitApplication(
    db,
    {
      applicationId: 'app',
      customerId: 'cust-aino',
      assetId: asset.id,
      startDate: '2026-11-05',
      termMonths: 36,
      downPaymentCents: 0,
      offerExpiresOn: '2026-11-06',
      actor: 'cust-aino',
    },
    new Date('2026-11-05T12:00:00Z')
  );
  expect(
    (
      await signAndActivateContract(db, {
        applicationId: 'app',
        contractId: 'contract',
        signerId: 'cust-aino',
        signedAt: new Date('2026-11-05T12:00:00Z'),
        actor: 'cust-aino',
      })
    ).ok
  ).toBe(true);
  leaseId = (await db.engineLease.findUniqueOrThrow({ where: { contractId: 'contract' } })).id;
});
describe('persisted end options', () => {
  it('records signed buyout amount once and removes stock without pretending payment', async () => {
    const db = database.db;
    await completeLease(db, ctx('complete'), leaseId, '2029-11-05', 1);
    const input = { leaseId, option: 'BUYOUT' };
    const buyout = await selectEndOption(db, ctx('buyout'), input);
    expect(buyout.netCents).toBe(58350);
    expect(buyout.grossCents).toBe(73521);
    expect(await selectEndOption(db, ctx('buyout'), input)).toEqual(buyout);
    expect((await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } })).status).toBe(
      'retired'
    );
    expect(await db.engineAllocation.count()).toBe(0);
  });
  it('keeps pass-on allocation until checked handover and never rewrites the old customer', async () => {
    const db = database.db;
    await completeLease(db, ctx('complete'), leaseId, '2029-11-05', 1);
    expect((await selectEndOption(db, ctx('pass'), { leaseId, option: 'PASS_ON' })).netCents).toBe(
      0
    );
    expect(await db.engineAllocation.count()).toBe(1);
    expect((await db.contract.findUniqueOrThrow({ where: { id: 'contract' } })).customer_id).toBe(
      'cust-aino'
    );
    expect(
      (
        await receiveReturn(db, ctx('handover'), {
          leaseId,
          assetId: 'ebike-003',
          receivedOn: '2029-11-05',
        })
      ).status
    ).toBe('RECEIVED');
  });
  it('card8 records capped fee, prevents future rent and permits physical early return', async () => {
    const db = database.db;
    const input = { leaseId, option: 'EARLY_RETURN', elapsedMonths: 6 };
    const exit = await selectEndOption(db, ctx('early'), input);
    expect(exit.netCents).toBe(58350);
    expect(exit.effectiveOn).toBe('2027-05-05');
    expect((await db.engineLease.findUniqueOrThrow({ where: { id: leaseId } })).status).toBe(
      'TERMINATED'
    );
    await expect(
      issueInvoice(db, ctx('bad-rent'), { leaseId, periodIndex: 7 }, (await loadVatRates()).rates)
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    expect(
      (
        await issueInvoice(
          db,
          ctx('past-rent'),
          { leaseId, periodIndex: 1 },
          (await loadVatRates()).rates
        )
      ).netCents
    ).toBe(10730);
    expect(
      (
        await receiveReturn(db, ctx('return'), {
          leaseId,
          assetId: 'ebike-003',
          receivedOn: exit.effectiveOn,
        })
      ).status
    ).toBe('RECEIVED');
  });
  it('requires completion for natural options and rejects unagreed legacy fees or a credit-needed exit', async () => {
    const db = database.db;
    await expect(
      selectEndOption(db, ctx('bad'), { leaseId, option: 'BUYOUT' })
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    await db.contract.update({ where: { id: 'contract' }, data: { termination_policy: null } });
    await expect(
      selectEndOption(db, ctx('legacy'), { leaseId, option: 'EARLY_RETURN', elapsedMonths: 6 })
    ).rejects.toMatchObject({ reason: 'early_policy_or_boundary_invalid' });
    await db.contract.update({
      where: { id: 'contract' },
      data: { termination_policy: 'EXIT_CAP_BUYOUT_V1' },
    });
    await issueInvoice(
      db,
      ctx('future-invoice'),
      { leaseId, periodIndex: 7 },
      (await loadVatRates()).rates
    );
    await expect(
      selectEndOption(db, ctx('credit'), { leaseId, option: 'EARLY_RETURN', elapsedMonths: 6 })
    ).rejects.toMatchObject({ reason: 'issued_future_invoice_requires_credit' });
  });
});

it('cannot switch to buyout after the customer has submitted a physical return request', async () => {
  const db = database.db;
  const lease = await db.engineLease.findUniqueOrThrow({ where: { id: leaseId } });
  const end = '2029-11-05';
  await completeLease(db, ctx('complete-before-return'), leaseId, end, 1);
  await requestReturn(db, ctx('request-before-buyout'), {
    leaseId,
    customerId: lease.customerId,
    usageValue: 18400,
    requestedOn: end,
  });
  await expect(
    selectEndOption(db, ctx('buyout-after-return'), { leaseId, option: 'BUYOUT' })
  ).rejects.toMatchObject({ reason: 'return_workflow_already_started' });
  expect(await db.circularOffer.count()).toBe(0);
});
