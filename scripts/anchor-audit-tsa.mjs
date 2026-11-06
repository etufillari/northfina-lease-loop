// The outside anchor (docs/features/audit-chain.md, D81): `npm run audit:anchor` has a public
// RFC 3161 timestamp authority sign the audit log's current head, so a rewrite of the database
// and the anchor file together still disagrees with a receipt held by someone else.
//
//   npm run audit:anchor                       stamp the head now
//   npm run audit:anchor -- --verify <file>    check a receipt and that the log still has that head
//
// A terminal tool a person runs, never the app: the app makes no outside call. It writes a
// statement (`head-<n>-<instant>.txt`: the length, the head hash and the public key), asks the authority
// (AUDIT_TSA_URL, default https://freetsa.org/tsr) through openssl and curl, and keeps the
// request and the signed reply beside it in AUDIT_TSA_DIR (default `audit-tsa/` beside the
// database). Verifying uses the authority's certificates (AUDIT_TSA_CA_FILE and
// AUDIT_TSA_CERT_FILE, else freetsa's, fetched once). Every outside call has a deadline.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const USAGE = 'usage: npm run audit:anchor [-- --verify <head-n.txt>]';
const DEFAULT_TSA = 'https://freetsa.org/tsr';
const FREETSA_CA = 'https://freetsa.org/files/cacert.pem';
const FREETSA_CERT = 'https://freetsa.org/files/tsa.crt';
/** Each openssl or curl call ends by then (AGENTS.md rule 11). */
const CALL_TIMEOUT_MS = 45_000;
const CURL_MAX_SECONDS = '30';

/** Nothing → stamp; `--verify <file>` → verify that statement. Throws on anything else. */
export function parseAnchorArgs(argv) {
  if (argv.length === 0) return { mode: 'stamp' };
  if (argv[0] === '--verify' && argv.length === 2 && argv[1]) {
    return { mode: 'verify', statement: argv[1] };
  }
  throw new Error(USAGE);
}

/** The text the authority timestamps: what the log looked like, in a form a person can read. */
export function statementText({ length, hash, publicKey }) {
  return [
    'Lease Loop audit log head (docs/features/audit-chain.md)',
    `length: ${length}`,
    `hash: ${hash}`,
    `public key: ${publicKey ?? 'none'}`,
    '',
  ].join('\n');
}

/** Reads a statement back; throws when it is not one. */
export function parseStatement(text) {
  const length = Number(/^length: (\d+)$/m.exec(text)?.[1]);
  const hash = /^hash: ([0-9a-f]{64})$/m.exec(text)?.[1];
  if (!Number.isInteger(length) || length < 1 || !hash) {
    throw new Error('not an audit head statement');
  }
  return { length, hash };
}

/** `20261106T084002Z` from an ISO instant: the stamp's part of the file names. */
export function stampName(iso) {
  return iso.replace(/[-:]/g, '').replace(/\.\d+/, '');
}

/**
 * The statement, request and reply of one stamp, named after the head's length and the
 * instant, so stamping the same length again (after `db:reset`, say) never replaces a receipt.
 */
export function stampFiles(dir, length, stamp) {
  const base = path.join(dir, `head-${length}-${stamp}`);
  return { statement: `${base}.txt`, query: `${base}.tsq`, reply: `${base}.tsr` };
}

/** The files beside a statement path. */
export function filesOfStatement(statement) {
  const base = statement.replace(/\.txt$/, '');
  return { statement, query: `${base}.tsq`, reply: `${base}.tsr` };
}

export function queryArgs(files) {
  // -cert asks the authority to put its certificate in the reply.
  return ['ts', '-query', '-data', files.statement, '-sha256', '-cert', '-out', files.query];
}

export function postArgs(url, files) {
  return [
    '--fail',
    '--silent',
    '--show-error',
    '--max-time',
    CURL_MAX_SECONDS,
    '-H',
    'Content-Type: application/timestamp-query',
    '--data-binary',
    `@${files.query}`,
    '-o',
    files.reply,
    url,
  ];
}

export function verifyArgs(files, caFile, certFile) {
  const args = ['ts', '-verify', '-data', files.statement, '-in', files.reply, '-CAfile', caFile];
  return certFile ? [...args, '-untrusted', certFile] : args;
}

/** "Time stamp: Nov  6 07:59:30 2026 GMT" from `openssl ts -reply -text`; null when missing. */
export function timeOfReply(replyText) {
  return /^Time stamp: (.+)$/m.exec(replyText)?.[1]?.trim() ?? null;
}

/**
 * What `--verify` concludes once the receipt itself is valid (review of #69, finding 5): the log
 * must still have the stamped head at its length *and* pass the sealed verifier, since rows
 * edited without recomputing their hashes leave row n's hash as it was.
 */
export function verifyConclusion(stillHasHead, verdict, head) {
  if (!stillHasHead) {
    return {
      ok: false,
      message: `the log no longer has that head at #${head.length}: it was rewritten or cut after the stamp`,
    };
  }
  if (!verdict.ok) {
    return {
      ok: false,
      message: `the log still has that head at #${head.length}, but it is broken now: ${verdict.reason} at #${verdict.brokenAt}`,
    };
  }
  return { ok: true, message: `the log still has that head at #${head.length}, and it is intact` };
}

/** Whether the log, as rows in id order, still has `head` at that length. */
export function logStillHas(rowHashes, head) {
  return rowHashes.length >= head.length && rowHashes[head.length - 1] === head.hash;
}

function run(command, args) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    timeout: CALL_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function fetchOnce(url, file) {
  if (!existsSync(file))
    run('curl', ['--fail', '-sS', '--max-time', CURL_MAX_SECONDS, '-o', file, url]);
  return file;
}

async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const args = parseAnchorArgs(process.argv.slice(2));
  const { createPrismaClient } = await import('../src/server/prisma-client.ts');
  const { anchorFileFor } = await import('../src/server/audit-anchors.ts');
  const { verifyAuditChain } = await import('../src/server/audit.ts');
  const db = createPrismaClient();
  const say = (line) => process.stdout.write(`${line}\n`);
  try {
    const anchorFile = anchorFileFor(db);
    const dir =
      process.env.AUDIT_TSA_DIR?.trim() || path.join(path.dirname(anchorFile ?? '.'), 'audit-tsa');
    mkdirSync(dir, { recursive: true });

    if (args.mode === 'stamp') {
      const verdict = await verifyAuditChain(db);
      if (!verdict.ok)
        throw new Error(
          `the log is broken (${verdict.reason} at #${verdict.brokenAt}); not stamping it`
        );
      if (verdict.length === 0) throw new Error('the audit log is empty; nothing to stamp');
      const files = stampFiles(dir, verdict.length, stampName(new Date().toISOString()));
      writeFileSync(
        files.statement,
        statementText({
          length: verdict.length,
          hash: verdict.headHash,
          publicKey: verdict.publicKey,
        })
      );
      run('openssl', queryArgs(files));
      run('curl', postArgs(process.env.AUDIT_TSA_URL?.trim() || DEFAULT_TSA, files));
      const time = timeOfReply(run('openssl', ['ts', '-reply', '-in', files.reply, '-text']));
      say(`stamped head #${verdict.length} ${verdict.headHash}`);
      say(`authority time: ${time ?? 'not in the reply'}`);
      say(`receipt: ${files.reply}`);
      say(`check it later: npm run audit:anchor -- --verify ${files.statement}`);
      return;
    }

    const files = filesOfStatement(args.statement);
    const head = parseStatement(readFileSync(files.statement, 'utf8'));
    const caFile =
      process.env.AUDIT_TSA_CA_FILE?.trim() ||
      fetchOnce(FREETSA_CA, path.join(dir, 'freetsa-cacert.pem'));
    const certFile =
      process.env.AUDIT_TSA_CERT_FILE?.trim() ||
      (process.env.AUDIT_TSA_CA_FILE
        ? null
        : fetchOnce(FREETSA_CERT, path.join(dir, 'freetsa-tsa.crt')));
    run('openssl', verifyArgs(files, caFile, certFile));
    const time = timeOfReply(run('openssl', ['ts', '-reply', '-in', files.reply, '-text']));
    say(`receipt valid: the authority saw head #${head.length} ${head.hash} at ${time ?? '?'}`);
    const rows = await db.auditLog.findMany({ orderBy: { id: 'asc' }, select: { hash: true } });
    const stillHas = logStillHas(
      rows.map((row) => row.hash),
      head
    );
    const conclusion = verifyConclusion(stillHas, await verifyAuditChain(db), head);
    if (!conclusion.ok) throw new Error(conclusion.message);
    say(conclusion.message);
  } finally {
    await db.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    const stderr = error?.stderr ? `\n${String(error.stderr).trim()}` : '';
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}${stderr}\n`);
    process.exit(1);
  });
}
