// resetDb empties every table, whatever rows reference each other, and RESET_ORDER names every
// model in prisma/schema.prisma.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appendAssetEvent } from '@/server/asset-events';
import { withAudit } from '@/server/audit';
import { createContractFixture } from './contract-fixture';
import { insertContract, seedPack } from './invoice-fixture';
import { RESET_ORDER, resetDb } from './reset-db';
import { createTestDb } from './test-db';
import type { PrismaClient } from '@/server/prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});

const countAll = async () => ({
  signatureRequest: await db.signatureRequest.count(),
  companySignatory: await db.companySignatory.count(),
  returnAssessment: await db.returnAssessment.count(),
  invoice: await db.invoice.count(),
  assetEvent: await db.assetEvent.count(),
  contract: await db.contract.count(),
  application: await db.application.count(),
  quote: await db.quote.count(),
  customer: await db.customer.count(),
  asset: await db.asset.count(),
  auditLog: await db.auditLog.count(),
  auditHead: await db.auditHead.count(),
});

describe('resetDb', () => {
  it('names every model of the schema, once', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8');
    const models = [...schema.matchAll(/^model (\w+) \{/gm)].map(
      ([, name]) => name!.charAt(0).toLowerCase() + name!.slice(1)
    );
    expect([...RESET_ORDER].sort()).toEqual(models.sort());
  });

  it('empties a database where every kind of row points at another', async () => {
    await seedPack(db);
    await createContractFixture(db, { assetId: 'ebike-008', contractId: 'c-reset' });
    const signed = await insertContract(db);
    await withAudit(
      db,
      { actor: 'test', action: 'asset.event_logged', entityType: 'asset', entityId: 'ebike-003' },
      (tx) =>
        appendAssetEvent(tx, {
          assetId: 'ebike-003',
          contractId: signed.contractId,
          kind: 'leased',
          onDate: '2026-11-05',
          details: {},
        })
    );
    const before = await countAll();
    expect(before.contract).toBe(2);
    expect(before.auditLog).toBeGreaterThan(0);

    await resetDb(db);

    expect(Object.values(await countAll())).toEqual(RESET_ORDER.map(() => 0));
  });

  it('is harmless on an empty database', async () => {
    await resetDb(db);
    await resetDb(db);
    expect(Object.values(await countAll())).toEqual(RESET_ORDER.map(() => 0));
  });
});
