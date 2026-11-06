import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { answersFromCustomer } from '@/domain/question-flow';
import { createTestDb } from '../../tests/helpers/test-db';
import {
  createLease,
  demoContext,
  prepareApplication,
  resetSpine,
} from '../../tests/helpers/spine';
import type { DemoContext } from './demo-context';
import type { PrismaClient } from './prisma-client';
import { submitApplication } from './spine-applications';
import { issueInvoices } from './spine-invoices';
import { createQuote } from './spine-quotes';
import { signContract } from './spine-signing';
import { getContract, listContracts } from './spine-views';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let aino: DemoContext;
beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetSpine(db);
  aino = await demoContext();
});

describe('saved offers and applications', () => {
  it('honours the saved v1 offer at signature after v2 becomes live', async () => {
    const { quote, application } = await prepareApplication(db, aino, {
      assetId: 'laptop-004',
      startDate: '2026-11-06',
    });
    expect(quote).toMatchObject({
      priceSource: 'list:1',
      validThrough: '2026-11-06',
      terms: { listPriceCents: 349000 },
    });
    const later = { ...aino, businessDate: '2026-11-06' };
    const newQuote = await createQuote(db, later, {
      requestId: randomUUID(),
      assetId: 'laptop-004',
      termMonths: 36,
      downPaymentCents: 0,
      startDate: '2026-11-06',
    });
    expect(newQuote.terms.listPriceCents).toBe(321100);
    const contract = await signContract(db, later, application.id);
    expect(contract.terms).toEqual(quote.terms);
    expect(
      await signContract(db, { ...later, businessDate: '2027-01-01' }, application.id)
    ).toEqual(contract);
    expect(await db.contract.count()).toBe(1);
    expect(await db.auditLog.count({ where: { action: 'contract.signed' } })).toBe(1);
  });

  it('returns the same offer for a retry and rejects a reused key with different money', async () => {
    const input = {
      requestId: randomUUID(),
      assetId: 'ebike-003',
      termMonths: 36,
      downPaymentCents: 0,
      startDate: '2026-11-06',
    };
    const quote = await createQuote(db, aino, input);
    expect(await createQuote(db, { ...aino, businessDate: '2026-11-06' }, input)).toEqual(quote);
    await expect(createQuote(db, aino, { ...input, downPaymentCents: 1 })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    expect(await db.quote.count()).toBe(1);
    expect(await db.auditLog.count()).toBe(1);
  });

  it('rejects unavailable assets and expired offers without creating a contract', async () => {
    const input = {
      requestId: randomUUID(),
      assetId: 'ebike-007',
      termMonths: 36,
      downPaymentCents: 0,
      startDate: '2026-11-05',
    };
    await expect(createQuote(db, aino, input)).rejects.toMatchObject({ code: 'ASSET_UNAVAILABLE' });
    const { application } = await prepareApplication(db, aino, { startDate: '2026-11-15' });
    await expect(
      signContract(db, { ...aino, businessDate: '2026-11-13' }, application.id)
    ).rejects.toMatchObject({ code: 'QUOTE_EXPIRED' });
    expect(await db.contract.count()).toBe(0);
  });

  it('prunes inactive answers yet recognizes the same raw request on retry', async () => {
    const quote = await createQuote(db, aino, {
      requestId: randomUUID(),
      assetId: 'ebike-003',
      termMonths: 36,
      downPaymentCents: 0,
      startDate: '2026-11-05',
    });
    const input = {
      requestId: randomUUID(),
      quoteId: quote.id,
      answers: {
        ...answersFromCustomer(aino.customer),
        q_usage_purpose: 'commuting',
        q_farm_registry: 'inactive-private-note',
      },
    };
    const application = await submitApplication(db, aino, input);
    expect(application.decision).toBe('approved');
    expect(application.answers).not.toHaveProperty('q_farm_registry');
    expect(await submitApplication(db, { ...aino, businessDate: '2026-12-01' }, input)).toEqual(
      application
    );
    await expect(
      submitApplication(db, aino, {
        ...input,
        answers: { ...input.answers, q_usage_purpose: 'delivery' },
      })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(await db.application.count()).toBe(1);
    const audit = await db.auditLog.findMany();
    expect(JSON.stringify(audit)).not.toContain('inactive-private-note');
    expect(JSON.stringify(audit)).not.toContain(aino.customer.email);
  });
});

describe('atomic, exclusive signing', () => {
  it('allows only one overlapping request to lease the physical item', async () => {
    const lena = await demoContext('cust-lena');
    const first = await prepareApplication(db, aino);
    const second = await prepareApplication(db, lena);
    const outcomes = await Promise.allSettled([
      signContract(db, aino, first.application.id),
      signContract(db, lena, second.application.id),
    ]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await db.contract.count()).toBe(1);
    expect(await db.assetLease.count()).toBe(1);
    expect((await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } })).status).toBe(
      'reserved'
    );
    expect(await db.auditLog.count({ where: { action: 'contract.signed' } })).toBe(1);
  });

  it('rolls back the agreement, asset claim and down-payment invoice if audit insertion fails', async () => {
    const { application } = await prepareApplication(db, aino, { downPaymentCents: 50000 });
    await expect(
      signContract(db, { ...aino, actor: undefined as unknown as string }, application.id)
    ).rejects.toThrow();
    expect(await db.contract.count()).toBe(0);
    expect(await db.assetLease.count()).toBe(0);
    expect(await db.invoice.count()).toBe(0);
    expect((await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } })).status).toBe(
      'available'
    );
  });

  it('refuses a minor and never permits one persona to read or sign another application', async () => {
    const mikko = await demoContext('cust-mikko');
    const minor = await prepareApplication(db, mikko, { assetId: 'laptop-008' });
    expect(minor.application.decision).toBe('declined');
    await expect(signContract(db, mikko, minor.application.id)).rejects.toMatchObject({
      code: 'APPLICATION_NOT_APPROVED',
    });
    const own = await createLease(db, aino);
    await expect(getContract(db, mikko, own.id)).rejects.toMatchObject({
      code: 'CONTRACT_NOT_FOUND',
    });
    await expect(signContract(db, aino, minor.application.id)).rejects.toMatchObject({
      code: 'APPLICATION_NOT_FOUND',
    });
    expect(await listContracts(db, mikko)).toEqual([]);
  });
});

describe('issued documents', () => {
  it('keeps future forecasts separate and freezes the VAT on each actual issue date', async () => {
    const contract = await createLease(db, aino);
    expect(contract.invoices).toEqual([]);
    expect(contract.forecast).toHaveLength(36);
    expect(contract.nextScheduledDate).toBe('2026-11-05');
    await issueInvoices(db, aino, contract.id);
    await issueInvoices(db, { ...aino, businessDate: '2026-12-05' }, contract.id);
    const january = await issueInvoices(db, { ...aino, businessDate: '2027-01-05' }, contract.id);
    expect(
      january.invoices.map((invoice) => [
        invoice.period,
        invoice.netCents,
        invoice.vatCents,
        invoice.grossCents,
      ])
    ).toEqual([
      [1, 10730, 2736, 13466],
      [2, 10730, 2736, 13466],
      [3, 10730, 2790, 13520],
    ]);
    expect(await issueInvoices(db, { ...aino, businessDate: '2027-01-05' }, contract.id)).toEqual(
      january
    );
    expect(await db.invoice.count()).toBe(3);
    expect(january.nextScheduledDate).toBe('2027-02-05');
  });

  it('issues overdue periods today with today VAT instead of inventing old issuance', async () => {
    const contract = await createLease(db, aino);
    const late = await issueInvoices(db, { ...aino, businessDate: '2027-01-05' }, contract.id);
    expect(late.invoices).toHaveLength(3);
    expect(late.invoices[0]).toMatchObject({
      scheduledFor: '2026-11-05',
      invoiceDate: '2027-01-05',
      dueDate: '2027-01-05',
      vatBasisPoints: 2600,
    });
    expect(late.invoices.every((invoice) => invoice.grossCents === 13520)).toBe(true);
  });

  it('stores a down payment separately and reconciles every rent to the locked net total', async () => {
    const contract = await createLease(db, aino, { downPaymentCents: 50000, termMonths: 12 });
    expect(contract.invoices).toHaveLength(1);
    expect(contract.invoices[0]).toMatchObject({
      kind: 'down_payment',
      netCents: 50000,
      vatCents: 12750,
      grossCents: 62750,
    });
    const full = await issueInvoices(db, { ...aino, businessDate: contract.endDate }, contract.id);
    const rent = full.invoices.filter((invoice) => invoice.kind === 'rent');
    expect(rent).toHaveLength(12);
    expect(rent.reduce((sum, invoice) => sum + invoice.netCents, 0)).toBe(
      contract.terms.totalRentNetCents
    );
  });
});
