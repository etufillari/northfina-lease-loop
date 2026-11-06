// Empties a test database between tests (docs/features/test-isolation.md, D37). Every table,
// children before parents, in one transaction: a test starts from an empty database and seeds
// what it needs, so no test reads another test's rows. The only `deleteMany` in the repo.
// The audit log's anchor file beside the database goes too (D81): anchors of rows that no
// longer exist would read as a rewritten log.
import { rm } from 'node:fs/promises';
import { anchorFileFor } from '@/server/audit-anchors';
import type { PrismaClient } from '@/server/prisma-client';

/** Every model, children first, so no foreign key is ever left pointing at a deleted row. */
export const RESET_ORDER = [
  'signatureRequest',
  'companySignatory',
  'returnAssessment',
  'invoice',
  'assetEvent',
  'contract',
  'application',
  'quote',
  'customer',
  'asset',
  'auditLog',
  'auditHead',
] as const;

export type ResetTable = (typeof RESET_ORDER)[number];

/** Deletes every row of every table in `RESET_ORDER`, all or nothing. */
export async function resetDb(db: PrismaClient): Promise<void> {
  await db.$transaction(RESET_ORDER.map((table) => deleteAll(db, table)));
  const anchors = anchorFileFor(db);
  if (anchors) await rm(anchors, { force: true });
}

function deleteAll(db: PrismaClient, table: ResetTable) {
  switch (table) {
    case 'signatureRequest':
      return db.signatureRequest.deleteMany();
    case 'companySignatory':
      return db.companySignatory.deleteMany();
    case 'returnAssessment':
      return db.returnAssessment.deleteMany();
    case 'invoice':
      return db.invoice.deleteMany();
    case 'assetEvent':
      return db.assetEvent.deleteMany();
    case 'contract':
      return db.contract.deleteMany();
    case 'application':
      return db.application.deleteMany();
    case 'quote':
      return db.quote.deleteMany();
    case 'customer':
      return db.customer.deleteMany();
    case 'asset':
      return db.asset.deleteMany();
    case 'auditHead':
      return db.auditHead.deleteMany();
    case 'auditLog':
      return db.auditLog.deleteMany();
  }
}
