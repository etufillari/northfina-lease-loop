// The passport's handlers on the in-transaction bus: each event writes its log entry with the
// change, and a failing handler rolls the entry back with the audit row.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DomainEvent, EventOf } from '@/domain/events';
import { createContractFixture } from '../../tests/helpers/contract-fixture';
import { createTestDb } from '../../tests/helpers/test-db';
import { resetDb } from '../../tests/helpers/reset-db';
import { dropAllHandlers, withHandlers } from '../../tests/helpers/with-handlers';
import { listAssetEvents } from './asset-events';
import { withAudit, type AuditEntry } from './audit';
import { emit, onEvent } from './events';
import { registerPassportHandlers } from './passport-handlers';
import type { PrismaClient } from './prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
withHandlers(registerPassportHandlers);
beforeEach(async () => {
  await resetDb(db);
  await createContractFixture(db, { assetId: 'ebike-008', contractId: 'c-1', previousLives: 2 });
});

const signed: EventOf<'CONTRACT_SIGNED'> = {
  type: 'CONTRACT_SIGNED',
  contractId: 'c-1',
  customerId: 'cust-c-1',
  assetId: 'ebike-008',
  quantity: 1,
  signedOn: '2026-11-06',
  startDate: '2026-11-06',
  endDate: '2028-11-05',
  termMonths: 24,
  downPaymentCents: 0,
  netRentCents: 11250,
  buyoutCents: 25000,
  vatRateBasisPoints: 2550,
};

const back = {
  contractId: 'c-1',
  assetId: 'ebike-008',
  date: '2028-11-05',
  reason: 'end_of_term',
  condition: 'good',
  usage: { unit: 'km', value: 14000 },
} as const;

const entry: AuditEntry = {
  actor: 'team-test',
  action: 'contract.signed',
  entityType: 'contract',
  entityId: 'c-1',
};

const emitInAudit = (event: DomainEvent) => withAudit(db, entry, (tx) => emit(tx, event));

describe('passport handlers', () => {
  it('CONTRACT_SIGNED writes `leased` on the start day with the contract id', async () => {
    await emitInAudit(signed);
    const events = await listAssetEvents(db, 'ebike-008');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'leased',
      on_date: '2026-11-06',
      contract_id: 'c-1',
      details: { customerId: 'cust-c-1', termMonths: 24, endDate: '2028-11-05' },
    });
  });

  it.each([
    [{ type: 'UNIT_RETURNED', ...back } as DomainEvent, 'returned'],
    [{ type: 'UNIT_PASSED_ON', ...back, nextCustomerId: 'cust-next' } as DomainEvent, 'passed_on'],
    [
      {
        type: 'CONTRACT_BOUGHT_OUT',
        contractId: 'c-1',
        assetId: 'ebike-008',
        date: '2028-11-05',
        amountCents: 25000,
      } as DomainEvent,
      'bought',
    ],
  ])('%o writes `%s` on its day', async (event, kind) => {
    await emitInAudit(event);
    const [logged] = await listAssetEvents(db, 'ebike-008');
    expect(logged).toMatchObject({ kind, on_date: '2028-11-05', contract_id: 'c-1' });
  });

  it('a handler failure later in the change rolls the log entry back with the audit row', async () => {
    onEvent('CONTRACT_SIGNED', async () => {
      throw new Error('invoices refused');
    });
    await expect(emitInAudit(signed)).rejects.toThrow('invoices refused');
    expect(await listAssetEvents(db, 'ebike-008')).toEqual([]);
    expect(await db.auditLog.count()).toBe(0);
  });

  it('an event for an asset that does not exist fails the whole change', async () => {
    await expect(emitInAudit({ ...signed, assetId: 'ghost' })).rejects.toThrow();
    expect(await db.auditLog.count()).toBe(0);
  });

  it('the remover unregisters every passport handler', async () => {
    dropAllHandlers();
    const off = registerPassportHandlers();
    off();
    await emitInAudit(signed);
    expect(await listAssetEvents(db, 'ebike-008')).toEqual([]);
  });
});
