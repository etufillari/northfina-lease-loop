// The invoices rows on a real migrated SQLite database: write a schedule, list it, pay one
// (audited, INVOICE_PAID emitted in the same transaction), and a failing handler rolls back.
import { forbidden } from '../../tests/helpers/authz';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadVatRates } from '@/data/load';
import { buildSchedule } from '@/domain/invoicing';
import { insertContract, seedPack } from '../../tests/helpers/invoice-fixture';
import { createTestDb } from '../../tests/helpers/test-db';
import { resetDb } from '../../tests/helpers/reset-db';
import { withHandlers } from '../../tests/helpers/with-handlers';
import { withAudit } from './audit';
import { contractCustomerId as ownerContractCustomerId } from './contracts';
import { onEvent } from './events';
import {
  contractCustomerId,
  invoiceCustomerId,
  listCustomerInvoices,
  listInvoices,
  payInvoice,
  writeSchedule,
} from './invoices';
import type { PrismaClient } from './prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let contractId: string;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
withHandlers();
beforeEach(async () => {
  await resetDb(db);
  await seedPack(db);
  ({ contractId } = await insertContract(db));
  const schedule = buildSchedule({
    signedOn: '2026-11-05',
    startDate: '2026-11-05',
    termMonths: 36,
    downPaymentCents: 0,
    monthlyNetCents: 10_730,
    vatRates: await loadVatRates(),
  });
  if (!schedule.ok) throw new Error('no schedule');
  await withAudit(
    db,
    { actor: 'test', action: 'contract.signed', entityType: 'contract', entityId: contractId },
    (tx) => writeSchedule(tx, contractId, schedule.invoices)
  );
});

describe('writeSchedule and listInvoices', () => {
  it('reads card 1’s schedule back in sequence order', async () => {
    const invoices = await listInvoices(db, contractId);
    expect(invoices.map((i) => i.sequence)).toEqual(Array.from({ length: 36 }, (_, i) => i + 1));
    expect(invoices[35]).toMatchObject({ periodEnd: '2029-11-04', kind: 'rent' });
  });

  it('is empty for an unknown contract', async () => {
    expect(await listInvoices(db, 'nope')).toEqual([]);
  });

  it('refuses a second schedule for the same contract (unique sequence)', async () => {
    const [first] = await listInvoices(db, contractId);
    await expect(
      withAudit(
        db,
        {
          actor: 'test',
          action: 'invoice.rescheduled',
          entityType: 'contract',
          entityId: contractId,
        },
        (tx) =>
          writeSchedule(tx, contractId, [
            { ...first!, kind: 'rent', vatRateBasisPoints: first!.vatRateBasisPoints },
          ])
      )
      // P2002: Prisma's unique-constraint violation on (contract_id, sequence).
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('listCustomerInvoices', () => {
  it('gives Aino every invoice of her contracts, newest due first, and nobody else any', async () => {
    const invoices = await listCustomerInvoices(db, { customerId: 'cust-aino' });
    expect(invoices).toHaveLength(36);
    expect(invoices.every((i) => i.contractId === contractId)).toBe(true);
    expect(invoices[0]).toMatchObject({ sequence: 36, dueDate: '2029-10-05' });
    expect(invoices.at(-1)).toMatchObject({ sequence: 1, dueDate: '2026-11-05' });
    expect(await listCustomerInvoices(db, { customerId: 'cust-nobody' })).toEqual([]);
  });

  it('spans every contract of the customer', async () => {
    const second = await insertContract(db);
    expect(second.contractId).not.toBe(contractId);
    const [first] = await listInvoices(db, contractId);
    await withAudit(
      db,
      {
        actor: 'test',
        action: 'contract.signed',
        entityType: 'contract',
        entityId: second.contractId,
      },
      (tx) =>
        writeSchedule(tx, second.contractId, [
          {
            sequence: 1,
            kind: 'rent',
            periodStart: first!.periodStart,
            periodEnd: first!.periodEnd,
            issueDate: first!.issueDate,
            dueDate: first!.dueDate,
            netCents: first!.netCents,
            vatRateBasisPoints: first!.vatRateBasisPoints,
            vatCents: first!.vatCents,
            grossCents: first!.grossCents,
          },
        ])
    );
    const invoices = await listCustomerInvoices(db, { customerId: 'cust-aino' });
    expect(new Set(invoices.map((i) => i.contractId))).toEqual(
      new Set([contractId, second.contractId])
    );
    expect(invoices).toHaveLength(37);
  });
});

describe('the access lookups', () => {
  it('names the customer of an invoice and of a contract', async () => {
    const [first] = await listInvoices(db, contractId);
    expect(await invoiceCustomerId(db, first!.id)).toBe('cust-aino');
    expect(await contractCustomerId(db, contractId)).toBe('cust-aino');
    expect(await invoiceCustomerId(db, 'nope')).toBeNull();
    expect(await contractCustomerId(db, 'nope')).toBeNull();
  });

  it('reads the contract through the contract slice, not its own query (wave 1 finding 3)', () => {
    expect(contractCustomerId).toBe(ownerContractCustomerId);
  });
});

describe('payInvoice', () => {
  it('marks it paid, audits it and emits INVOICE_PAID with the gross', async () => {
    const seen: unknown[] = [];
    onEvent('INVOICE_PAID', async (_tx, event) => seen.push(event));
    const [first] = await listInvoices(db, contractId);

    const result = await payInvoice(db, {
      id: first!.id,
      paidOn: '2026-11-06',
      actor: 'cust-aino',
    });

    expect(result).toMatchObject({ ok: true, invoice: { status: 'paid', paidOn: '2026-11-06' } });
    expect(seen).toEqual([
      {
        type: 'INVOICE_PAID',
        invoiceId: first!.id,
        contractId,
        amountCents: 13_466,
        date: '2026-11-06',
      },
    ]);
    const audit = await db.auditLog.findFirst({ where: { entity_id: first!.id } });
    expect(audit).toMatchObject({ action: 'invoice.paid', actor: 'cust-aino' });
  });

  it('answers already_paid the second time and not_found for an unknown id', async () => {
    const [first] = await listInvoices(db, contractId);
    await payInvoice(db, { id: first!.id, paidOn: '2026-11-06', actor: 'cust-aino' });
    expect(await payInvoice(db, { id: first!.id, paidOn: '2026-11-07', actor: 'admin' })).toEqual({
      ok: false,
      reason: 'already_paid',
    });
    expect(await payInvoice(db, { id: 'nope', paidOn: '2026-11-07', actor: 'admin' })).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('answers cancelled for a cancelled rent, not already_paid, and writes nothing (product review 9)', async () => {
    const [, second] = await listInvoices(db, contractId);
    await db.invoice.update({ where: { id: second!.id }, data: { status: 'cancelled' } });
    const before = await db.auditLog.count();
    expect(await payInvoice(db, { id: second!.id, paidOn: '2026-11-06', actor: 'admin' })).toEqual({
      ok: false,
      reason: 'cancelled',
    });
    expect(await db.auditLog.count()).toBe(before);
    expect((await listInvoices(db, contractId))[1]).toMatchObject({
      status: 'cancelled',
      paidOn: null,
    });
  });

  it('refuses a payment dated before the contract was signed (the demo clock moved back, product review 9)', async () => {
    const [first] = await listInvoices(db, contractId);
    const before = await db.auditLog.count();
    expect(
      await payInvoice(db, { id: first!.id, paidOn: '2026-11-04', actor: 'cust-aino' })
    ).toEqual({
      ok: false,
      reason: 'paid_before_signing',
    });
    expect(await db.auditLog.count()).toBe(before);
    // The signing day itself is fine.
    expect(
      await payInvoice(db, { id: first!.id, paidOn: '2026-11-05', actor: 'cust-aino' })
    ).toMatchObject({ ok: true, invoice: { status: 'paid', paidOn: '2026-11-05' } });
  });

  it('throws on a payment day that is not a real ISO day, before any write (D23)', async () => {
    const [first] = await listInvoices(db, contractId);
    await expect(
      payInvoice(db, { id: first!.id, paidOn: '2026-02-30', actor: 'cust-aino' })
    ).rejects.toThrow();
    expect((await listInvoices(db, contractId))[0]?.status).toBe('issued');
  });

  it('D73: anonymous and another customer are refused before anything is read or written', async () => {
    const [first] = await listInvoices(db, contractId);
    const before = await db.auditLog.count();
    expect(
      await payInvoice(db, { id: first!.id, paidOn: '2026-11-06', actor: 'anonymous' })
    ).toEqual(forbidden('not_signed_in', 'pay_invoice'));
    expect(
      await payInvoice(db, { id: first!.id, paidOn: '2026-11-06', actor: 'cust-mikko' })
    ).toEqual(forbidden('not_owner', 'pay_invoice'));
    expect(await db.auditLog.count()).toBe(before);
    expect((await listInvoices(db, contractId))[0]?.status).toBe('issued');
  });

  it('rolls the payment and its audit row back when an INVOICE_PAID handler throws', async () => {
    onEvent('INVOICE_PAID', async () => {
      throw new Error('handler failed');
    });
    const [first] = await listInvoices(db, contractId);

    await expect(
      payInvoice(db, { id: first!.id, paidOn: '2026-11-06', actor: 'cust-aino' })
    ).rejects.toThrow('handler failed');

    const [after] = await listInvoices(db, contractId);
    expect(after).toMatchObject({ status: 'issued', paidOn: null });
    expect(await db.auditLog.count({ where: { entity_id: first!.id } })).toBe(0);
  });
});
