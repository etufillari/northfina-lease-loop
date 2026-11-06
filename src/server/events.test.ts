// The in-transaction event bus (docs/kickoff-brief.md section 7), against a real, migrated
// SQLite database: a handler's write commits with the change, a throwing handler rolls the
// whole change back.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../tests/helpers/test-db';
import { resetDb } from '../../tests/helpers/reset-db';
import type { EventOf } from '@/domain/events';
import { withAudit, type AuditEntry } from './audit';
import { clearHandlers, emit, onEvent } from './events';
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
  clearHandlers();
  await resetDb(db);
});

const paid: EventOf<'INVOICE_PAID'> = {
  type: 'INVOICE_PAID',
  invoiceId: 'invoice-001',
  contractId: 'contract-001',
  amountCents: 13466,
  date: '2026-12-01',
};

const entry: AuditEntry = {
  actor: 'team-test',
  action: 'invoice.paid',
  entityType: 'invoice',
  entityId: 'invoice-001',
};

/** A handler's write: one audit row naming the handler. */
const writeRow = (tx: Parameters<Parameters<typeof onEvent>[1]>[0], actor: string) =>
  tx.auditLog.create({
    data: { actor, action: 'test.handled', entity_type: 'test', entity_id: 'x' },
  });

describe('emit', () => {
  it('a handler that writes inside withAudit commits with the change', async () => {
    onEvent('INVOICE_PAID', async (tx, event) => {
      await writeRow(tx, `handler:${event.invoiceId}`);
    });
    await withAudit(db, entry, (tx) => emit(tx, paid));

    const actors = (await db.auditLog.findMany()).map((row) => row.actor).sort();
    expect(actors).toEqual(['handler:invoice-001', 'team-test']);
  });

  it('a handler that throws rolls the whole change back', async () => {
    onEvent('INVOICE_PAID', (tx) => writeRow(tx, 'first'));
    onEvent('INVOICE_PAID', async () => {
      throw new Error('invoices refused');
    });

    await expect(withAudit(db, entry, (tx) => emit(tx, paid))).rejects.toThrow('invoices refused');
    expect(await db.auditLog.count()).toBe(0);
  });

  it('runs handlers in registration order, each awaited before the next', async () => {
    const order: string[] = [];
    onEvent('INVOICE_PAID', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push('first');
    });
    onEvent('INVOICE_PAID', async () => {
      order.push('second');
    });
    await withAudit(db, entry, (tx) => emit(tx, paid));
    expect(order).toEqual(['first', 'second']);
  });

  it('calls only the handlers of the emitted type', async () => {
    const seen: string[] = [];
    onEvent('CONTRACT_BOUGHT_OUT', async () => {
      seen.push('bought out');
    });
    onEvent('INVOICE_PAID', async (_tx, event) => {
      seen.push(event.type);
    });
    await withAudit(db, entry, (tx) => emit(tx, paid));
    expect(seen).toEqual(['INVOICE_PAID']);
  });

  it('rejects an invalid payload before any handler runs', async () => {
    let called = false;
    onEvent('INVOICE_PAID', async () => {
      called = true;
    });
    const bad = { ...paid, amountCents: 134.66 };
    await expect(withAudit(db, entry, (tx) => emit(tx, bad))).rejects.toThrow();
    expect(called).toBe(false);
    expect(await db.auditLog.count()).toBe(0);
  });

  it('with no handler registered, emits nothing and the change still commits', async () => {
    await withAudit(db, entry, (tx) => emit(tx, paid));
    expect(await db.auditLog.count()).toBe(1);
  });

  it('clearHandlers removes every handler', async () => {
    let called = false;
    onEvent('INVOICE_PAID', async () => {
      called = true;
    });
    clearHandlers();
    await withAudit(db, entry, (tx) => emit(tx, paid));
    expect(called).toBe(false);
  });

  it('onEvent returns a function that removes that handler', async () => {
    let calls = 0;
    const off = onEvent('INVOICE_PAID', async () => {
      calls += 1;
    });
    await withAudit(db, entry, (tx) => emit(tx, paid));
    off();
    await withAudit(db, entry, (tx) => emit(tx, paid));
    expect(calls).toBe(1);
  });
});
