// CONTRACT_SIGNED → the schedule, inside the signing transaction, on a real migrated SQLite
// database: the invoices commit with the signing and roll back with it.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CARD_1, insertContract, seedPack } from '../../tests/helpers/invoice-fixture';
import { createTestDb } from '../../tests/helpers/test-db';
import { resetDb } from '../../tests/helpers/reset-db';
import { withProductionHandlers } from '../../tests/helpers/with-handlers';
import { withAudit, type AuditEntry } from './audit';
import { emit, onEvent } from './events';
import { listInvoices } from './invoices';
import type { PrismaClient } from './prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetDb(db);
  await seedPack(db);
});
withProductionHandlers();

const signing = (contractId: string): AuditEntry => ({
  actor: 'cust-aino',
  action: 'contract.signed',
  entityType: 'contract',
  entityId: contractId,
});

describe('the CONTRACT_SIGNED handler', () => {
  it('writes card 1’s 36 invoices, the January 2027 one at 13 520 and 26 %', async () => {
    const event = await insertContract(db);
    await withAudit(db, signing(event.contractId), (tx) => emit(tx, event));

    const invoices = await listInvoices(db, event.contractId);
    expect(invoices).toHaveLength(36);
    expect(invoices.every((i) => i.status === 'issued' && i.paidOn === null)).toBe(true);
    expect(invoices[0]).toMatchObject({ sequence: 1, dueDate: '2026-11-05', grossCents: 13_466 });
    expect(invoices[2]).toMatchObject({
      sequence: 3,
      issueDate: '2027-01-05',
      vatRateBasisPoints: 2_600,
      grossCents: 13_520,
    });
  });

  it('issues the down payment as invoice 0 on the signing day (D5)', async () => {
    const event = await insertContract(db, {
      ...CARD_1,
      signedOn: '2026-11-01',
      downPaymentCents: 50_000,
    });
    await withAudit(db, signing(event.contractId), (tx) => emit(tx, event));

    const [first] = await listInvoices(db, event.contractId);
    expect(first).toMatchObject({
      sequence: 0,
      kind: 'down_payment',
      issueDate: '2026-11-01',
      periodStart: null,
      grossCents: 62_750,
    });
  });

  it('rolls the schedule back when a later write in the signing fails', async () => {
    const event = await insertContract(db);
    const remove = onEvent('CONTRACT_SIGNED', async () => {
      throw new Error('the catalogue handler failed');
    });
    try {
      await expect(
        withAudit(db, signing(event.contractId), (tx) => emit(tx, event))
      ).rejects.toThrow('the catalogue handler failed');
    } finally {
      remove();
    }
    expect(await listInvoices(db, event.contractId)).toEqual([]);
    expect(await db.auditLog.count({ where: { entity_id: event.contractId } })).toBe(0);
  });

  it('rolls back a signing whose contract row is missing', async () => {
    const event = await insertContract(db);
    await expect(
      withAudit(db, signing('nope'), (tx) => emit(tx, { ...event, contractId: 'nope' }))
    ).rejects.toThrow();
    expect(await db.invoice.count({ where: { contract_id: 'nope' } })).toBe(0);
  });
});
