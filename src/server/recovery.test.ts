import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { toAssetRowData } from './assets';
import { withAudit } from './audit';
import { createDemoLease } from './demo-lease';
import { cancelLeaseRequest } from './cancel-lease-request';
import { leaseActionContext, payBuyout } from './lease-actions';
import { requestLeaseChange } from './leases';
import { acceptReturn, assessReturn, progressReturn } from './recovery';
import { recoveryCalculationSchema } from './recovery-input';
import { publishRelisting } from './relisting';
import { settlementQuote } from '@/domain/lease-settlement';
import { returnPreview } from '@/domain/return-preview';

let fixture: Awaited<ReturnType<typeof createTestDb>>;
let contractId: string;
let requestId: string;
const today = '2026-11-06';
const inspection = {
  condition: 'fair' as const,
  targetCondition: 'good' as const,
  usageValue: 20000,
  ageMonths: 12,
  additionalRepairCents: 5000,
  notes: 'Brake pads and frame checked; listed faults included in repair quote.',
};
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
          { id: 'other', name: 'Other', email: 'other@example.com' },
        ],
      });
      await tx.customer.createMany({
        data: [
          { id: 'owner-customer', ownerUserId: 'owner' },
          { id: 'other-customer', ownerUserId: 'other' },
        ],
      });
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
      report: {
        condition: 'fair',
        usageValue: 20000,
        issues: ['brakes_fault'],
        notes: 'Brake feels weak.',
      },
    })
  ).id;
});
afterEach(async () => {
  await fixture.cleanup();
});

describe('audited return lifecycle', () => {
  it('guards staff assessment, owner acceptance, quote changes and state transitions', async () => {
    await expect(
      assessReturn(fixture.db, { requestId, staffId: 'owner', today, inspection })
    ).rejects.toMatchObject({ status: 403 });
    const assessment = await assessReturn(fixture.db, {
      requestId,
      staffId: 'staff',
      today,
      inspection,
    });
    const initialQuote = recoveryCalculationSchema.parse(JSON.parse(assessment.calculationJson));
    const contract = await fixture.db.contract.findUniqueOrThrow({ where: { id: contractId } });
    // The first demo invoice was issued and paid: discount only the other 35 rents.
    expect(initialQuote.outstandingInvoiceCents).toBe(0);
    expect(initialQuote.accruedUnissuedCents).toBe(0);
    expect(initialQuote.settlement.buyoutNetCents).toBe(
      settlementQuote({
        monthlyNetCents: contract.monthlyNetCents,
        buyoutCents: contract.buyoutCents,
        remainingMonths: 35,
        annualRateBasisPoints: initialQuote.annualRateBasisPoints,
        recoveryCents: initialQuote.recovery.netRecoveryCents,
        vatBasisPoints: initialQuote.vatBasisPoints,
        outstandingCents: 0,
      }).buyoutNetCents
    );
    const publish = (expectedPriceCents: number) =>
      publishRelisting(fixture.db, { requestId, staffId: 'staff', today, expectedPriceCents });
    await expect(publish(initialQuote.recovery.postRepairValueCents)).rejects.toMatchObject({
      status: 409,
    });
    const accept = {
      requestId,
      contractId,
      customerId: 'owner-customer',
      userId: 'owner',
      today,
      action: 'accept' as const,
      expectedAssessmentUpdatedAt: assessment.updatedAt.toISOString(),
      paymentMethod: 'card',
    };
    await expect(
      acceptReturn(fixture.db, { ...accept, customerId: 'other-customer', userId: 'other' })
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      acceptReturn(fixture.db, {
        ...accept,
        expectedAssessmentUpdatedAt: '2000-01-01T00:00:00.000Z',
      })
    ).rejects.toMatchObject({ status: 409 });
    await acceptReturn(fixture.db, accept);
    await progressReturn(fixture.db, { requestId, staffId: 'staff', today, action: 'receive' });
    await expect(
      progressReturn(fixture.db, { requestId, staffId: 'staff', today, action: 'receive' })
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await fixture.db.contract.findUniqueOrThrow({ where: { id: contractId } })).status
    ).toBe('returned');
    expect((await fixture.db.asset.findUniqueOrThrow({ where: { id: 'ebike-005' } })).status).toBe(
      'returned'
    );
    const result = await publish(initialQuote.recovery.postRepairValueCents);
    const snapshot = recoveryCalculationSchema.parse(JSON.parse(result.calculationJson));
    const asset = await fixture.db.asset.findUniqueOrThrow({ where: { id: 'ebike-005' } });
    expect(asset).toMatchObject({
      status: 'available',
      condition: 'good',
      usage_value: 20000,
      maintenanceUsageValue: 20000,
      priceRevision: 2,
      secondLifePriceCents: snapshot.recovery.postRepairValueCents,
    });
    expect(asset.originalPriceCents).toBeGreaterThan(0);
    expect(asset.firstLeaseDate).toBe('2025-11-06');
    expect(result).toMatchObject({
      status: 'published',
      publishedPriceCents: snapshot.recovery.postRepairValueCents,
    });
    expect(
      (await fixture.db.contract.findUniqueOrThrow({ where: { id: contractId } })).endedOn
    ).toBe(today);
    expect(await fixture.db.auditLog.count({ where: { action: 'return.publish' } })).toBe(1);
  });
  it('preserves the accepted quote and can retire instead of publishing', async () => {
    const assessment = await assessReturn(fixture.db, {
      requestId,
      staffId: 'staff',
      today,
      inspection,
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
    await expect(
      assessReturn(fixture.db, { requestId, staffId: 'staff', today, inspection })
    ).rejects.toMatchObject({ status: 409 });
    await progressReturn(fixture.db, { requestId, staffId: 'staff', today, action: 'receive' });
    await progressReturn(fixture.db, { requestId, staffId: 'staff', today, action: 'retire' });
    await expect(
      publishRelisting(fixture.db, { requestId, staffId: 'staff', today, expectedPriceCents: 1 })
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await fixture.db.asset.findUniqueOrThrow({ where: { id: 'ebike-005' } }))
        .secondLifePriceCents
    ).toBeNull();
  });

  it('moves straight to ready to relist on receipt', async () => {
    const assessment = await assessReturn(fixture.db, {
      requestId,
      staffId: 'staff',
      today,
      inspection,
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
    expect(
      await progressReturn(fixture.db, { requestId, staffId: 'staff', today, action: 'receive' })
    ).toMatchObject({ status: 'ready' });
  });
});

describe('the price from the return form', () => {
  const answers = {
    power: 'working' as const,
    batteryKnown: false,
    batteryHealth: null,
    functions: { brakes_fault: 'minor' as const, tyres_worn: 'working', drive_fault: 'working' },
    cosmetic: 'same' as const,
    accessories: 'complete' as const,
  } as const;

  async function submitForm(report: Record<string, unknown> = {}) {
    await fixture.db.leaseRequest.update({
      where: { id: requestId },
      data: { status: 'cancelled' },
    });
    const created = await requestLeaseChange(fixture.db, {
      customerId: 'owner-customer',
      userId: 'owner',
      contractId,
      kind: 'return',
      today,
      report: {
        condition: 'good',
        usageValue: 20000,
        issues: [],
        notes: '',
        answers: { ...answers, functions: { ...answers.functions } },
        ...report,
      },
    });
    const context = await leaseActionContext(fixture.db, 'owner-customer', contractId, today);
    return {
      id: created.id,
      preview: returnPreview(context, { ...answers, functions: { ...answers.functions } }, 20000),
    };
  }

  it('keeps the form price whatever the inspection finds, and shows the same repair lines', async () => {
    const { id, preview } = await submitForm();
    expect(preview.returnTotalCents).toBeGreaterThan(0);
    const assessment = await assessReturn(fixture.db, {
      requestId: id,
      staffId: 'staff',
      today,
      inspection: { ...inspection, additionalRepairCents: 90000, notes: '' },
    });
    const quote = recoveryCalculationSchema.parse(JSON.parse(assessment.calculationJson));
    expect(quote.settlement.returnTotalCents).toBe(preview.returnTotalCents);
    expect(quote.settlement.customerRepairNetCents).toBe(
      preview.agreedPrice.customerRepairNetCents
    );
    expect(quote.agreedLines).toEqual(
      preview.lines.map(({ id: lineId, netCents }) => ({ id: lineId, netCents }))
    );
    expect(quote.chargeableDamage).toEqual([]);
    // Our own cost still follows the inspection.
    expect(quote.recovery.refurbishmentCostCents).toBeGreaterThanOrEqual(90000);
  });

  it('ignores a price sent by the client', async () => {
    const { id, preview } = await submitForm({
      agreedPrice: {
        vatBasisPoints: 0,
        earlyReturnNetCents: 0,
        customerRepairNetCents: 1,
        repairShareBasisPoints: 1,
        lines: [],
      },
    });
    const request = await fixture.db.leaseRequest.findUniqueOrThrow({ where: { id } });
    expect(JSON.parse(request.customerReportJson!).agreedPrice.customerRepairNetCents).toBe(
      preview.agreedPrice.customerRepairNetCents
    );
  });

  it('stores no agreed price for a report without answers', async () => {
    const request = await fixture.db.leaseRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(JSON.parse(request.customerReportJson!).agreedPrice).toBeUndefined();
  });

  it('adds current unpaid rent, so rent paid in the meantime is not charged again', async () => {
    const { id, preview } = await submitForm();
    const invoice = await fixture.db.invoice.findFirstOrThrow({ where: { contractId } });
    await withAudit(
      fixture.db,
      { actor: 'test', action: 'test.unpaid', entityType: 'invoice', entityId: invoice.id },
      (tx) => tx.payment.deleteMany({ where: { invoiceId: invoice.id } })
    );
    const unpaid = invoice.netCents + invoice.vatCents;
    const assessment = await assessReturn(fixture.db, {
      requestId: id,
      staffId: 'staff',
      today,
      inspection,
    });
    const quote = recoveryCalculationSchema.parse(JSON.parse(assessment.calculationJson));
    expect(quote.settlement.returnTotalCents).toBe(preview.returnTotalCents + unpaid);
  });
});

describe('paying a return', () => {
  async function quoted() {
    const assessment = await assessReturn(fixture.db, {
      requestId,
      staffId: 'staff',
      today,
      inspection,
    });
    return {
      requestId,
      contractId,
      customerId: 'owner-customer',
      userId: 'owner',
      today,
      action: 'accept' as const,
      expectedAssessmentUpdatedAt: assessment.updatedAt.toISOString(),
      amountCents: recoveryCalculationSchema.parse(JSON.parse(assessment.calculationJson))
        .settlement.returnTotalCents,
    };
  }

  it('records one simulated payment for exactly the quoted amount', async () => {
    const { amountCents, ...pay } = await quoted();
    expect(amountCents).toBeGreaterThan(0);
    await acceptReturn(fixture.db, { ...pay, paymentMethod: 'invoice' });
    expect(await fixture.db.leaseActionPayment.findMany({ where: { contractId } })).toMatchObject([
      { kind: 'return', amountCents, paymentMethod: 'invoice', isSimulated: true },
    ]);
    await expect(
      acceptReturn(fixture.db, { ...pay, paymentMethod: 'invoice' })
    ).rejects.toMatchObject({ status: 409 });
    expect(await fixture.db.leaseActionPayment.count({ where: { contractId } })).toBe(1);
  });

  it('needs a payment method when there is something to pay', async () => {
    const { amountCents: _amount, ...pay } = await quoted();
    await expect(acceptReturn(fixture.db, pay)).rejects.toMatchObject({
      code: 'PAYMENT_METHOD_REQUIRED',
    });
  });

  it('settles unpaid rent with the payment', async () => {
    const invoice = await fixture.db.invoice.findFirstOrThrow({ where: { contractId } });
    await withAudit(
      fixture.db,
      { actor: 'test', action: 'test.unpaid', entityType: 'invoice', entityId: invoice.id },
      (tx) => tx.payment.deleteMany({ where: { invoiceId: invoice.id } })
    );
    const { amountCents: _amount, ...pay } = await quoted();
    await acceptReturn(fixture.db, { ...pay, paymentMethod: 'card' });
    expect(await fixture.db.payment.findMany({ where: { invoiceId: invoice.id } })).toMatchObject([
      { amountCents: invoice.netCents + invoice.vatCents, isSimulated: true },
    ]);
  });

  it('takes no payment on a lease that cannot use a simulated one', async () => {
    await withAudit(
      fixture.db,
      { actor: 'test', action: 'test.real', entityType: 'contract', entityId: contractId },
      (tx) => tx.contract.update({ where: { id: contractId }, data: { isDemo: false } })
    );
    const { amountCents: _amount, ...pay } = await quoted();
    expect(await acceptReturn(fixture.db, pay)).toMatchObject({ status: 'accepted' });
    expect(await fixture.db.leaseActionPayment.count({ where: { contractId } })).toBe(0);
  });

  it('cannot also be bought out once paid', async () => {
    const { amountCents: _amount, ...pay } = await quoted();
    await acceptReturn(fixture.db, { ...pay, paymentMethod: 'card' });
    const context = await leaseActionContext(fixture.db, 'owner-customer', contractId, today);
    await expect(
      payBuyout(fixture.db, {
        customerId: 'owner-customer',
        userId: 'owner',
        contractId,
        today,
        quoteDate: today,
        expectedTotalCents: context.quote.buyoutTotalCents,
        token: 'buyout-after-return',
        paymentMethod: 'card',
      })
    ).rejects.toMatchObject({ code: 'RETURN_PAID' });
  });

  it('cannot be cancelled once paid', async () => {
    const { amountCents: _amount, ...pay } = await quoted();
    await acceptReturn(fixture.db, { ...pay, paymentMethod: 'card' });
    await expect(
      cancelLeaseRequest(fixture.db, {
        requestId,
        contractId,
        customerId: 'owner-customer',
        userId: 'owner',
      })
    ).rejects.toMatchObject({ code: 'CANNOT_CANCEL' });
  });
});
