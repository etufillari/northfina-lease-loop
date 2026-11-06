// The handler helpers: the production wiring matches src/server/event-handlers.ts and its
// modules, each test starts with exactly the named set, and nothing leaks into the next test.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { withAudit } from '@/server/audit';
import { emit, onEvent } from '@/server/events';
import { listInvoices } from '@/server/invoices';
import type { PrismaClient } from '@/server/prisma-client';
import { insertContract, seedPack } from './invoice-fixture';
import { resetDb } from './reset-db';
import { createTestDb } from './test-db';
import {
  dropAllHandlers,
  PRODUCTION_WIRING,
  withHandlers,
  withProductionHandlers,
} from './with-handlers';

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

const source = (file: string) => readFileSync(`src/server/${file}.ts`, 'utf8');

async function signOnce() {
  const event = await insertContract(db);
  await withAudit(
    db,
    {
      actor: 'test',
      action: 'contract.signed',
      entityType: 'contract',
      entityId: event.contractId,
    },
    (tx) => emit(tx, event)
  );
  return event.contractId;
}

describe('PRODUCTION_WIRING', () => {
  it('lists every onEvent line of the modules event-handlers.ts imports, in import order', () => {
    const imported = [...source('event-handlers').matchAll(/^import '\.\/([\w-]+)';/gm)].map(
      ([, module]) => module!
    );
    expect(imported).toEqual(['invoice-handlers', 'catalogue-handlers']);
    const fromSource = imported.flatMap((module) =>
      [...source(module).matchAll(/^onEvent\('(\w+)', \(tx, event\) => (\w+)\(/gm)].map(
        ([, type, handler]) => ({ type, module, handler })
      )
    );
    expect(fromSource).toEqual(PRODUCTION_WIRING.map((wire) => ({ ...wire })));
  });

  it('ends with the passport handlers, as event-handlers.ts does', () => {
    expect(source('event-handlers')).toMatch(/\nregisterPassportHandlers\(\);\n$/);
  });
});

describe('withProductionHandlers', () => {
  withProductionHandlers();

  it('signing writes the schedule and one passport entry, each exactly once', async () => {
    const contractId = await signOnce();
    expect(await listInvoices(db, contractId)).toHaveLength(36);
    expect(await db.assetEvent.count({ where: { contract_id: contractId } })).toBe(1);
  });

  it('a handler a test adds is gone in the next test', async () => {
    onEvent('CONTRACT_SIGNED', async () => {
      throw new Error('left behind');
    });
    await expect(signOnce()).rejects.toThrow('left behind');
  });

  it('…so this test signs normally', async () => {
    const contractId = await signOnce();
    expect(await listInvoices(db, contractId)).toHaveLength(36);
  });
});

describe('withHandlers with nothing named', () => {
  withHandlers();

  it('signing writes no invoices and no passport entry', async () => {
    const contractId = await signOnce();
    expect(await listInvoices(db, contractId)).toEqual([]);
    expect(await db.assetEvent.count()).toBe(0);
  });

  it('dropAllHandlers empties what a test registered', async () => {
    onEvent('CONTRACT_SIGNED', async () => {
      throw new Error('should be dropped');
    });
    dropAllHandlers();
    await expect(signOnce()).resolves.toBeTruthy();
  });
});
