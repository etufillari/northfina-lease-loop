import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as data from '@/data/load';
import type { Prisma } from '@/generated/prisma/client';
import { createTestDb } from '../../tests/helpers/test-db';
import { toAssetRowData } from './assets';
import { withAudit, type TransactionClient } from './audit';
import { leaseActionContext, payBuyout } from './lease-actions';

let fixture: Awaited<ReturnType<typeof createTestDb>>;
// Fixed locked terms and a zero-rate snapshot make expected settlement cents independently
// checkable. Current coefficient-table rates must not replace the agreed zero rate.
const terms = {
  id: 'lease',
  customerId: 'owner-customer',
  assetId: 'ebike-005',
  startDate: '2026-11-15',
  termMonths: 12,
  listPriceCents: 100000,
  downPaymentCents: 0,
  monthlyNetCents: 10000,
  buyoutCents: 20000,
  priceListVersion: 1,
  annualRateBasisPoints: 0,
  isDemo: true,
};
const input = (overrides: Partial<Parameters<typeof payBuyout>[1]> = {}) => ({
  customerId: terms.customerId,
  userId: 'owner',
  contractId: terms.id,
  today: '2027-01-16',
  quoteDate: '2027-01-16',
  // 9 future rents + buyout = 110000 net, 138600 gross at 26%;
  // unissued Nov/Dec/Jan rents = 12550 + 12550 + 12600 = 37700 gross.
  expectedTotalCents: 176300,
  token: 'buyout-test-reference',
  paymentMethod: 'card',
  ...overrides,
});

async function arrange(work: (tx: TransactionClient) => Promise<unknown>) {
  await withAudit(
    fixture.db,
    { actor: 'test', action: 'test.setup', entityType: 'contract', entityId: terms.id },
    work
  );
}

beforeEach(async () => {
  fixture = await createTestDb();
  const asset = (await data.loadAssets()).find((item) => item.id === terms.assetId);
  if (!asset) throw new Error('Missing fixture asset');
  await arrange(async (tx) => {
    await tx.asset.create({ data: toAssetRowData(asset) });
    for (const id of ['owner', 'other']) {
      await tx.user.create({
        data: {
          id,
          name: id,
          email: `${id}@example.com`,
          customer: { create: { id: `${id}-customer` } },
        },
      });
    }
    await tx.contract.create({ data: terms });
    await tx.leaseRequest.createMany({
      data: ['pending', 'approved', 'rejected', 'cancelled'].map((status) => ({
        id: status,
        contractId: terms.id,
        kind: 'return',
        status,
      })),
    });
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fixture.cleanup();
});

const invoices = () =>
  fixture.db.invoice.findMany({
    orderBy: { dueDate: 'asc' },
    include: { payments: { orderBy: { id: 'asc' } } },
  });

async function state() {
  const [contracts, auditLog] = await Promise.all([
    fixture.db.contract.findMany({
      orderBy: { id: 'asc' },
      include: {
        asset: true,
        invoices: {
          orderBy: { dueDate: 'asc' },
          include: { payments: { orderBy: { id: 'asc' } } },
        },
        requests: { orderBy: { id: 'asc' }, include: { assessment: true } },
        actionPayments: { orderBy: { id: 'asc' } },
        events: { orderBy: { id: 'asc' } },
      },
    }),
    fixture.db.auditLog.findMany({ orderBy: { id: 'asc' } }),
  ]);
  return { contracts, auditLog };
}

async function expectRejected(
  code: string,
  overrides: Partial<Parameters<typeof payBuyout>[1]> = {}
) {
  const before = await state();
  await expect(payBuyout(fixture.db, input(overrides))).rejects.toMatchObject({
    status: code === 'NOT_FOUND' ? 404 : 409,
    code,
  });
  expect(await state()).toEqual(before);
}

async function updateContract(changes: Prisma.ContractUpdateInput) {
  await arrange((tx) => tx.contract.update({ where: { id: terms.id }, data: changes }));
}

async function issuedInvoices(paidCents: number) {
  await arrange(async (tx) => {
    for (const [id, dueDate, paid] of [
      ['nov', '2026-11-15', paidCents],
      ['dec', '2026-12-15', 12550],
    ] as const) {
      await tx.invoice.create({
        data: {
          id,
          contractId: terms.id,
          dueDate,
          issuedDate: dueDate,
          netCents: 10000,
          vatBasisPoints: 2550,
          vatCents: 2550,
          payments: paid
            ? { create: { amountCents: paid, paidDate: dueDate, isSimulated: true } }
            : undefined,
        },
      });
    }
  });
}

async function expectSuccessfulBuyout(receiptId: string, amountCents: number) {
  const receipt = await fixture.db.leaseActionPayment.findUniqueOrThrow({
    where: { id: receiptId },
  });
  expect(receipt).toMatchObject({
    contractId: terms.id,
    reference: input().token,
    kind: 'buyout',
    amountCents,
    paymentMethod: 'card',
    isSimulated: true,
  });
  expect(await fixture.db.contract.findUniqueOrThrow({ where: { id: terms.id } })).toMatchObject({
    ...terms,
    status: 'bought',
    endedOn: '2027-01-16',
  });
  // Bought: the item has left the fleet for good, so it can't be relisted or leased again.
  expect(await fixture.db.asset.findUniqueOrThrow({ where: { id: terms.assetId } })).toMatchObject({
    status: 'sold',
  });
  const requests = await fixture.db.leaseRequest.findMany({ orderBy: { id: 'asc' } });
  expect(requests.map(({ id, status }) => ({ id, status }))).toEqual([
    { id: 'approved', status: 'cancelled' },
    { id: 'cancelled', status: 'cancelled' },
    { id: 'pending', status: 'cancelled' },
    { id: 'rejected', status: 'rejected' },
  ]);
  const audit = await fixture.db.auditLog.findMany({ where: { action: 'lease.buyout_paid' } });
  expect(audit).toHaveLength(1);
  expect(audit[0]).toMatchObject({
    actor: 'owner',
    entity_type: 'contract',
    entity_id: terms.id,
    details_json: null,
  });
  return JSON.parse(receipt.quoteJson);
}

describe('buyout settlement', () => {
  it.each([
    { paidCents: 0, balanceCents: 12550, expectedTotalCents: 163750 },
    { paidCents: 4000, balanceCents: 8550, expectedTotalCents: 159750 },
    { paidCents: 12550, balanceCents: 0, expectedTotalCents: 151200 },
    { paidCents: 13000, balanceCents: 0, expectedTotalCents: 151200 },
  ])(
    'settles only the remaining balance after $paidCents cents paid, without duplicating arrears on retry',
    async ({ paidCents, balanceCents, expectedTotalCents }) => {
      await issuedInvoices(paidCents);
      const before = await invoices();
      const receiptId = await payBuyout(fixture.db, input({ expectedTotalCents }));
      const snapshot = await expectSuccessfulBuyout(receiptId, expectedTotalCents);
      expect(snapshot).toMatchObject({
        quoteDate: '2027-01-16',
        monthlyNetCents: 10000,
        buyoutCents: 20000,
        remainingMonths: 9,
        annualRateBasisPoints: 0,
        vatBasisPoints: 2600,
        outstandingCents: balanceCents + 12600,
        buyoutNetCents: 110000,
        buyoutTotalCents: 138600 + balanceCents + 12600,
      });
      const rows = await invoices();
      expect(rows).toHaveLength(3);
      for (const original of before) {
        const current = rows.find((row) => row.id === original.id)!;
        expect(current).toMatchObject({ ...original, payments: expect.any(Array) });
        expect(current.payments).toEqual(expect.arrayContaining(original.payments));
        const added = current.payments.filter(
          (payment) => !original.payments.some((p) => p.id === payment.id)
        );
        const balance = original.id === 'nov' ? balanceCents : 0;
        expect(
          added.map(({ amountCents, paidDate, isSimulated }) => ({
            amountCents,
            paidDate,
            isSimulated,
          }))
        ).toEqual(
          balance ? [{ amountCents: balance, paidDate: '2027-01-16', isSimulated: true }] : []
        );
      }
      expect(rows[2]).toMatchObject({
        dueDate: '2027-01-15',
        issuedDate: '2027-01-16',
        netCents: 10000,
        vatBasisPoints: 2600,
        vatCents: 2600,
        status: 'issued',
        payments: [
          expect.objectContaining({
            amountCents: 12600,
            paidDate: '2027-01-16',
            isSimulated: true,
          }),
        ],
      });

      const settled = await state();
      expect(await payBuyout(fixture.db, input({ expectedTotalCents }))).toBe(receiptId);
      const retry = await state();
      expect(retry.contracts).toEqual(settled.contracts);
      expect(retry.auditLog).toEqual([
        ...settled.auditLog,
        expect.objectContaining({
          action: 'lease.buyout_paid',
          actor: 'owner',
          entity_id: terms.id,
        }),
      ]);
    }
  );

  it('issues all accrued invoices at their due-date VAT, while the buyout uses current VAT', async () => {
    const receiptId = await payBuyout(fixture.db, input());
    await expectSuccessfulBuyout(receiptId, 176300);
    const rows = await invoices();
    expect(
      rows.map(({ dueDate, issuedDate, netCents, vatBasisPoints, vatCents, payments }) => ({
        dueDate,
        issuedDate,
        netCents,
        vatBasisPoints,
        vatCents,
        payments: payments.map(({ amountCents, isSimulated }) => ({ amountCents, isSimulated })),
      }))
    ).toEqual([
      {
        dueDate: '2026-11-15',
        issuedDate: '2027-01-16',
        netCents: 10000,
        vatBasisPoints: 2550,
        vatCents: 2550,
        payments: [{ amountCents: 12550, isSimulated: true }],
      },
      {
        dueDate: '2026-12-15',
        issuedDate: '2027-01-16',
        netCents: 10000,
        vatBasisPoints: 2550,
        vatCents: 2550,
        payments: [{ amountCents: 12550, isSimulated: true }],
      },
      {
        dueDate: '2027-01-15',
        issuedDate: '2027-01-16',
        netCents: 10000,
        vatBasisPoints: 2600,
        vatCents: 2600,
        payments: [{ amountCents: 12600, isSimulated: true }],
      },
    ]);
  });

  it('keeps the invoice due today in the remaining rent rather than charging it twice', async () => {
    const context = await leaseActionContext(fixture.db, terms.customerId, terms.id, '2027-01-15');
    expect(context.accrued.map((invoice) => invoice.dueDate)).toEqual(['2026-11-15', '2026-12-15']);
    expect(context.finance).toMatchObject({ remainingMonths: 10, outstandingCents: 25100 });
    expect(context.quote.buyoutTotalCents).toBe(176300);
    await payBuyout(fixture.db, input({ today: '2027-01-15', quoteDate: '2027-01-15' }));
    expect((await invoices()).map((invoice) => invoice.dueDate)).toEqual([
      '2026-11-15',
      '2026-12-15',
    ]);
  });

  it('preserves issued VAT snapshots even if the tax table is later revised', async () => {
    await issuedInvoices(4000);
    const vat = await data.loadVatRates();
    vi.spyOn(data, 'loadVatRates').mockResolvedValue({
      ...vat,
      rates: [{ valid_from: '2024-09-01', valid_to: null, rate_percent: 26 }],
    });
    const receiptId = await payBuyout(fixture.db, input({ expectedTotalCents: 159750 }));
    const snapshot = await expectSuccessfulBuyout(receiptId, 159750);
    // November's balance stays 12550 - 4000, not a recalculated 12600 - 4000.
    expect(snapshot.outstandingCents).toBe(8550 + 12600);
    expect((await invoices()).map((invoice) => invoice.vatCents)).toEqual([2550, 2550, 2600]);
  });

  it('rolls back the receipt, payments, accrued invoice and closing changes when auditing fails', async () => {
    await issuedInvoices(4000);
    const before = await state();
    await expect(
      payBuyout(
        fixture.db,
        input({ expectedTotalCents: 159750, userId: undefined as unknown as string })
      )
    ).rejects.toMatchObject({
      name: 'PrismaClientValidationError',
      message: expect.stringContaining('actor'),
    });
    expect(await state()).toEqual(before);
    const receiptId = await payBuyout(fixture.db, input({ expectedTotalCents: 159750 }));
    await expectSuccessfulBuyout(receiptId, 159750);
    expect(await invoices()).toHaveLength(3);
  });

  it.each(['awaiting_signature', 'completed', 'returned', 'bought'])(
    'rejects an inactive %s contract without any writes',
    async (status) => {
      await updateContract({ status });
      await expectRejected('LEASE_INACTIVE');
    }
  );
  it('refuses simulated payment for a real contract', async () => {
    await updateContract({ isDemo: false });
    await expectRejected('REAL_PAYMENT_REQUIRED');
  });
  it.each([{ quoteDate: '2027-01-15' }, { expectedTotalCents: 176301 }])(
    'rejects a changed quote: %j',
    async (changes) => {
      await expectRejected('QUOTE_CHANGED', changes);
    }
  );
  it.each([{ contractId: 'missing' }, { customerId: 'other-customer', userId: 'other' }])(
    'does not expose a missing or unowned contract: %j',
    async (changes) => {
      await expectRejected('NOT_FOUND', changes);
    }
  );

  it('rejects a reference used by another contract owned by the same customer', async () => {
    await arrange(async (tx) => {
      await tx.contract.create({ data: { ...terms, id: 'another-lease' } });
      await tx.leaseActionPayment.create({
        data: {
          contractId: 'another-lease',
          reference: input().token,
          kind: 'buyout',
          amountCents: 12345,
          paymentMethod: 'card',
          quoteJson: '{}',
          isSimulated: true,
        },
      });
    });
    await expectRejected('CONFLICT');
  });
  it('rejects another customer replaying a known reference for the same contract', async () => {
    await payBuyout(fixture.db, input());
    await expectRejected('CONFLICT', { customerId: 'other-customer', userId: 'other' });
  });

  it('rejects an unavailable forecast rather than guessing VAT', async () => {
    const vat = await data.loadVatRates();
    vi.spyOn(data, 'loadVatRates').mockResolvedValue({ ...vat, rates: [] });
    await expectRejected('QUOTE_UNAVAILABLE');
  });
  it('rejects missing settlement-date VAT even when the entire invoice forecast has rates', async () => {
    const vat = await data.loadVatRates();
    vi.spyOn(data, 'loadVatRates').mockResolvedValue({
      ...vat,
      rates: [{ valid_from: '2026-01-01', valid_to: '2027-10-15', rate_percent: 25.5 }],
    });
    await expectRejected('QUOTE_UNAVAILABLE', { today: '2027-10-16', quoteDate: '2027-10-16' });
  });
  it('rejects an unsupported coefficient term even when invoices can be forecast', async () => {
    await updateContract({ termMonths: 13 });
    await expectRejected('QUOTE_UNAVAILABLE');
  });

  it('uses the legacy coefficient rate only when the contract has no rate snapshot', async () => {
    await updateContract({ annualRateBasisPoints: null });
    const context = await leaseActionContext(fixture.db, terms.customerId, terms.id, input().today);
    expect(context.finance.annualRateBasisPoints).toBe(990);
    expect(context.baselineCondition).toBe(context.contract.asset.condition);
    expect(context.baselineUsage).toBe(context.contract.asset.usage_value);
  });
  it('keeps the snapshotted condition, usage and rate while using recorded asset recovery facts', async () => {
    await updateContract({ startCondition: 'fair', startUsageValue: 123 });
    await arrange((tx) =>
      tx.asset.update({
        where: { id: terms.assetId },
        data: {
          originalPriceCents: 200000,
          firstLeaseDate: '2025-01-16',
          maintenanceUsageValue: 100,
        },
      })
    );
    const context = await leaseActionContext(fixture.db, terms.customerId, terms.id, input().today);
    expect(context).toMatchObject({
      baselineCondition: 'fair',
      baselineUsage: 123,
      finance: { annualRateBasisPoints: 0, monthlyNetCents: 10000, buyoutCents: 20000 },
      recoveryFacts: { originalPriceCents: 200000, ageMonths: 24, maintenanceUsageValue: 100 },
    });
  });
});
