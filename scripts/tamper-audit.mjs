// The tamper demo (docs/features/audit-chain.md): `npm run demo:tamper [-- --id <n>] [--rewrite]`.
// Rewrites details_json of the newest audit row (or row <n>) straight in the SQLite file named
// by DATABASE_URL, the way someone with database access could, and prints the row and the
// chain's verdict before and after. Reload /en/audit to see the badge turn to "broken".
// A script a person runs in a terminal, never a route: the app itself never edits audit rows
// (tests/meta-rules.test.ts). `npm run db:reset` gives a clean chain again.
//
// `--rewrite` is the attack the hash chain alone cannot see (D81): after the edit it recomputes
// every hash from that row on and the stored head, so the chain is consistent again. It cannot
// re-sign them, because the key is not in the database, and the anchor file outside the
// database still holds the old hashes: the verdict is signature_mismatch at the edited row.
import { existsSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const USAGE = 'usage: npm run demo:tamper [-- --id <n>] [--rewrite]';

/** `--id <n>` (else the newest row, null) and `--rewrite`, in any order. Throws on anything else. */
export function parseTamperArgs(argv) {
  let id = null;
  let rewrite = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--rewrite' && !rewrite) {
      rewrite = true;
    } else if (argv[i] === '--id' && id === null) {
      id = Number(argv[++i]);
      if (!Number.isInteger(id) || id < 1) throw new Error(USAGE);
    } else {
      throw new Error(USAGE);
    }
  }
  return { id, rewrite };
}

/**
 * The forger's rewrite: `rows` in id order, the target's details replaced by `detailsJson`,
 * and the prev hash and hash of the target and every row after it recomputed with `hash`
 * (hashAuditEntry). Returns the row updates and the new head hash. Signatures are untouched:
 * whoever runs this has the database, not the key.
 */
export function rewriteChain(rows, targetId, detailsJson, hash) {
  const start = rows.findIndex((row) => row.id === targetId);
  if (start < 0) throw new Error(`no audit row #${targetId}`);
  let prevHash = rows[start].prev_hash;
  const updates = rows.slice(start).map((row) => {
    const details_json = row.id === targetId ? detailsJson : row.details_json;
    const next = hash(prevHash, {
      actor: row.actor,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      details: details_json === null ? null : JSON.parse(details_json),
      createdAt: row.created_at.toISOString(),
    });
    const update = { id: row.id, details_json, prev_hash: prevHash, hash: next };
    prevHash = next;
    return update;
  });
  return { updates, headHash: prevHash };
}

/** The stored details with `tampered: true` added, as JSON text (null or non-JSON details too). */
export function tamperedDetails(detailsJson) {
  let details;
  try {
    details = detailsJson === null ? null : JSON.parse(detailsJson);
  } catch {
    details = { original: detailsJson };
  }
  const base = details !== null && typeof details === 'object' && !Array.isArray(details);
  return JSON.stringify(base ? { ...details, tampered: true } : { value: details, tampered: true });
}

async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const { id, rewrite } = parseTamperArgs(process.argv.slice(2));
  const { createPrismaClient } = await import('../src/server/prisma-client.ts');
  const { verifyAuditChain } = await import('../src/server/audit.ts');
  const db = createPrismaClient();
  try {
    const row = await db.auditLog.findFirst(
      id === null ? { orderBy: { id: 'desc' } } : { where: { id } }
    );
    if (!row) throw new Error(id === null ? 'the audit log is empty' : `no audit row #${id}`);
    const print = (label, value) => process.stdout.write(`${label} ${JSON.stringify(value)}\n`);

    print('row before:  ', { id: row.id, action: row.action, details_json: row.details_json });
    print('chain before:', await verifyAuditChain(db));
    const changed = tamperedDetails(row.details_json);
    // Raw SQL on purpose: this is the edit from outside the app that the chain must reveal.
    if (rewrite) {
      const { hashAuditEntry } = await import('../src/domain/audit/index.ts');
      const rows = await db.auditLog.findMany({ orderBy: { id: 'asc' } });
      const { updates, headHash } = rewriteChain(rows, row.id, changed, hashAuditEntry);
      // Newest first, so no prev_hash is ever written twice (the column is unique).
      for (const u of [...updates].reverse()) {
        await db.$executeRaw`UPDATE "AuditLog" SET details_json = ${u.details_json}, prev_hash = ${u.prev_hash}, hash = ${u.hash} WHERE id = ${u.id}`;
      }
      await db.$executeRaw`UPDATE "AuditHead" SET hash = ${headHash}`;
      print('rewritten:   ', { rows: updates.length, head: headHash });
    } else {
      await db.$executeRaw`UPDATE "AuditLog" SET details_json = ${changed} WHERE id = ${row.id}`;
    }
    print('row after:   ', { id: row.id, action: row.action, details_json: changed });
    print('chain after: ', await verifyAuditChain(db));
  } finally {
    await db.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
