# The tamper-evident audit chain

## What it does

Every `AuditLog` row carries the hash of the row before it and its own SHA-256 hash over that plus its canonical content, signed with an Ed25519 key kept outside the database, and every new head is copied to an anchor file outside it (the seal, D81). A pure verifier checks the chain, the signatures and the anchors and names the first broken row; the audit page shows "Chain intact · N entries · head ab12…ef", "Signed", "Anchored … up to entry N" and the public key, or "Chain broken at entry #n (reason)", and `GET /api/audit-log/verify` returns the same verdict.

Tamper-evident, not tamper-proof: someone with write access to the database can still edit a row, but the edit shows. Someone who rewrites both audit tables with fresh hashes (the hole D36 left) now also needs the signing key and the anchor file, and still disagrees with any receipt `npm run audit:anchor` got from an outside timestamp authority once that receipt is kept off the machine.

**What the default setup protects against (review of #69, finding 4).** By default the key (`.env`), the anchor file (`dev.db.anchors.jsonl`) and the receipts (`audit-tsa/`) all sit beside `dev.db` on one disk. Whoever can copy or edit `dev.db` there can usually read the key, rewrite the anchors and swap the cached certificate too. So on one machine the seal stops someone with **SQL access only** (a database tool, a leaked database login, a script with raw SQL); it does not stop someone with the disk. Against them only a receipt copied elsewhere counts. In production the key would sit in a key store the database host cannot read, `AUDIT_ANCHOR_FILE` on another host, and the receipts with someone else.

## The rule

```
hash = SHA-256 hex( prevHash + "\n" + canonicalJson({ actor, action, entityType, entityId, details, createdAt }) )
```

- `prevHash` is the previous row's `hash` (by id); `GENESIS_HASH` (64 zeros) for the first row.
- `canonicalJson`: object keys sorted recursively, arrays in order, no whitespace, `undefined` dropped, numbers and strings as `JSON.stringify` prints them. `details` is hashed as stored, i.e. `JSON.parse(details_json)` (or `null`).
- `createdAt` is the row's ISO instant to the millisecond. `withAudit` sets `created_at` from a `now` it receives (or reads the server clock once, outside the domain), so the time is in the hash and cannot be edited either.

**Worked example (the three rows pinned in `chain.test.ts`):**

| id  | canonical entry (abridged)                                                              | prev_hash   | hash        |
| --- | --------------------------------------------------------------------------------------- | ----------- | ----------- |
| 1   | `{"action":"quote.created","actor":"admin",…,"details":{"monthlyCents":4990}…}`         | `00000000…` | `d8f1fbbe…` |
| 2   | `{"action":"application.submitted","actor":"cust-aino",…,"details":{"quoteId":"Q-1"}…}` | `d8f1fbbe…` | `ef606347…` |
| 3   | `{"action":"contract.signed","actor":"admin",…,"details":null…}`                        | `ef606347…` | `53a1ed15…` |

Head hash: `53a1ed1503f5ee6d6c874237774939b025193a0bb8badbc9df98b9682ffa06d0`.

### The seal (D81)

```
row signature  = Ed25519( key, "lease-loop/audit-row\n" + hash )                      base64, AuditLog.signature
head signature = Ed25519( key, "lease-loop/audit-head\n" + length + "\n" + hash )      base64, AuditHead.signature
anchor line    = {"length":n,"hash":"<hash of row n>","at":"<its instant>"}           appended after the commit
```

- **The key** is `AUDIT_SIGNING_KEY` in `.env` (beside the database by default: see "What the default setup protects against"): an Ed25519 private key, base64 PKCS#8 DER. `scripts/ensure-env.mjs` generates it (run by `db:setup`, `db:reset` and `predev`) and never replaces one that is there; it is never in the database or the repository; the tests make a fresh one per run (`vitest.config.ts`). `withAudit` refuses to write without it, before the change runs: an unsigned row would read as a break. The audit page shows the **public key** (base64 SPKI), which checks the signatures but cannot make them. The prefixes keep a row signature from passing as a head signature.
- **The anchor file** is `dev.db.anchors.jsonl` beside the SQLite file, or `AUDIT_ANCHOR_FILE`. One line per committed row, appended **after** the commit: the file may lag behind the log (a crash between the two; the page shows "Anchored up to entry n of N" in amber), never lead it. An anchor whose hash differs from the row at its length, an anchor longer than the log, or a line that is not an anchor is a break. `npm run db:reset` removes the old database's file (`scripts/clear-audit-anchors.mjs`); the app never does.
- **The outside receipt.** `npm run audit:anchor` writes `audit-tsa/head-<n>-<instant>.txt` (the length, the head hash, the public key), asks an RFC 3161 timestamp authority (`AUDIT_TSA_URL`, default `https://freetsa.org/tsr`) through `openssl ts` and `curl` with a 30-second deadline, and keeps the `.tsq` and the signed `.tsr` beside it. `npm run audit:anchor -- --verify audit-tsa/head-<n>.txt` checks the receipt against the authority's certificates (`AUDIT_TSA_CA_FILE` and `AUDIT_TSA_CERT_FILE`, else freetsa's, fetched once) and that the log still has that head at that length and passes the sealed verifier. Each stamp's files are named by length and instant (`head-<n>-<yyyymmddThhmmssZ>.*`), so a later stamp never replaces a receipt. A receipt counts against someone with the disk only once it is copied off the machine. A terminal tool: the app itself makes no outside call.
- **Order of the checks:** the D36 walk (prev hash, hash, stored head), then each row's signature and the head's, then the anchors from the shortest up. The first failure is the verdict. With no key set the signatures are skipped and the page says "Signatures not checked" (amber).

**Worked example, the rewrite D36 could not see** (run on 2026-11-06 against a scratch database, `src/server/audit.test.ts` "the seal"):

1. Three rows written; the anchor file holds three lines; `npm run audit:anchor` gets "Time stamp: Nov 6 08:00:46 2026 GMT" for head #3 `7680e633…`.
2. `npm run demo:tamper -- --id 2 --rewrite` edits row 2's details and recomputes the hashes of rows 2 and 3 and the head (`3433…`). The D36 walk alone now says intact.
3. The verdict: `signature_mismatch` at #2 (the old signature covers the old hash). With the key removed from the environment: `anchor_mismatch` at #2 (the file kept `30aab301…` for length 2). `audit:anchor --verify head-3.txt`: "receipt valid … the log no longer has that head at #3".

**What breaks when:**

| Tamper                                                 | Verdict                                                                                               |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Row 2's details become `{"quoteId":"Q-2"}`             | broken at 2, `hash_mismatch` (it would now hash to `94b76012…`)                                       |
| Row 1 re-timed, or its actor changed                   | broken at 1, `hash_mismatch`                                                                          |
| Row 2 deleted                                          | broken at 3, `prev_hash_mismatch` (3 points at `ef606347…`, sees `d8f1fbbe…`)                         |
| Rows 2 and 3 swapped                                   | broken at 3, `prev_hash_mismatch`                                                                     |
| Row 2's `prev_hash` edited                             | broken at 2, `prev_hash_mismatch`                                                                     |
| Row 3's hash set to null                               | broken at 3, `unhashed_in_chain`                                                                      |
| Every `hash` and `prev_hash` set to null               | broken at 1, `unhashed_in_chain`                                                                      |
| A second row written with row 1's `prev_hash` (a fork) | refused by the database: `prev_hash` is `@unique`                                                     |
| The newest row deleted (review finding 11)             | broken at the deleted id, `head_mismatch`: the `AuditHead` row (count, newest hash) no longer matches |
| Both tables rewritten with fresh hashes (D81)          | broken at the first rewritten row, `signature_mismatch`; with no key set, `anchor_mismatch`           |
| A row's or the head's signature removed (D81)          | broken at that row (the last row for the head), `unsigned_in_chain`                                   |
| The newest row deleted and a shorter head written      | broken at the new last row, `signature_mismatch` (the head is signed); else `anchor_mismatch`         |
| The anchor file cut back                               | not a break: "Anchored up to entry n of N" (amber); the TSA receipt still holds the later head        |
| A line of the anchor file damaged                      | broken, `anchor_unreadable` ("the anchor file outside the database has a damaged line")               |
| Rewrite with the key **and** the anchor file rewritten | **not detected inside the machine**: only a TSA receipt from before the rewrite reveals it            |

Every row must be hashed. The columns are nullable only so the migration applies to a table with rows; no demo database has rows from before the chain (the seed writes none and `db:reset` reruns every migration), so a null hash anywhere is a break, and nulling every hash cannot pass as an intact log (review on #21).

**Concurrency.** The previous row is read inside the transaction with `orderBy: { id: 'desc' }`. SQLite serialises writers, so two concurrent `withAudit` calls cannot both chain to the same row; the `@unique` on `prev_hash` is the second guard: a fork is two rows with the same `prev_hash`, and the database refuses the second (SQLite allows many nulls under a unique index). `hash` is `@unique` as well. **On Postgres this read needs `SELECT … FOR UPDATE` on the head row or an advisory lock**; without it the unique `prev_hash` turns a fork into a failed transaction to retry.

**Append-only.** `tests/meta-rules.test.ts` fails on any `auditLog.update`, `updateMany`, `upsert`, `delete` or `deleteMany` under `src/` outside tests; the database itself does not forbid it (a trigger would be the next step on Postgres).

### Demo: tamper with the log (not part of the organiser's 15-minute tour)

1. Make a few changes in the app (sign a quote, pay an invoice), open `/en/audit`: the badge says "Chain intact" with the head hash.
2. In a terminal: `npm run demo:tamper` (or `npm run demo:tamper -- --id 3`). It rewrites `details_json` of the newest row (or row 3) straight in the SQLite file with raw SQL, the way someone with database access could, and prints the row and the verdict before and after.
3. Reload `/en/audit`: "Chain broken at entry #3 (its content changed after it was written)". `GET /api/audit-log/verify` says the same.
4. `npm run demo:tamper -- --rewrite` is the stronger attack (D81): after the edit it recomputes every hash after it and the head, so the D36 walk alone would pass. The badge says "its signature does not match: it was rewritten without the key".
5. Optional, with network: `npm run audit:anchor` before step 2 and the `--verify` command it prints after it: the receipt is valid and the log no longer has the stamped head.
6. `npm run db:reset` gives a clean chain again (and a fresh anchor file).

The script is a terminal tool, never a route, so the app's own write rule holds.

## Decisions

- **D36 (`docs/decisions.md`): a SHA-256 hash chain over canonical JSON, computed in `withAudit` inside the change's transaction, verified by a pure domain function; the head hash shown for a person to anchor.** Reason: the judges score the audit log with money and the envelope; a hash chain is the industry pattern for a tamper-evident trail (certificate transparency, ledger databases), it needs no key management and no outside service, and it fits the existing one-transaction rule. Chosen against:
  - **Signing each row with an application key (HMAC or Ed25519):** stops someone with database access but not the key from recomputing the chain, but needs a secret kept outside the database and rotated; the hackathon has no secret store and a key in `.env` beside `dev.db` would not stop someone with the disk. Left as the first next step at the time; D81 built it, for the attacker with SQL access only.
  - **Anchoring the head outside the database (an RFC 3161 timestamp authority or a public ledger):** the only answer to a full rewrite or a truncated tail, but it is an outside call and a running cost; here the head hash is shown for a person to copy. Left as the second next step.
  - **A Merkle tree** instead of a linear chain: cheaper inclusion proofs for one row, not needed at this size; the linear chain is simpler to explain on the page.
  - **Hashing in the server instead of the domain:** the hash is deterministic, so it lives in `src/domain/audit/` with the verifier; the domain may import only `createHash` from `node:crypto` (`eslint.config.mjs` with `allowImportNames`, and the same check in `tests/meta-rules.test.ts`), so `randomUUID` and `randomBytes` stay out.
  - **A legacy prefix of unhashed rows** (rows from before the migration allowed at the start): dropped after review, because nulling every hash would then show as intact.
- RULES.md section 7 (the change and its audit row in one transaction) is kept: the hash is computed in that same transaction.
- **D81 (`docs/decisions.md`): the seal.** The two next steps D36 left (sign each row; anchor the head outside the database) are built: Ed25519 signatures over every row hash and the head, a local anchor file appended after each commit, and an RFC 3161 receipt on demand. Reason: a rewrite of both tables was the one attack the chain could not see. RULES.md §10 says the challenge needs no secrets; the signing key is the one exception and is kept where §10 asks (`.env`, git-ignored, an empty line in `.env.example`), generated per machine. Chosen against:
  - **HMAC** instead of Ed25519: whoever can verify could also forge; with Ed25519 the page publishes the public key.
  - **Calling the authority from the app** on every write: an outside call in the request, a flaky live demo, and a test that must mock it. The script stamps when a person asks.
  - **A public ledger** instead of a timestamp authority: a cost and an account, for no more than a receipt gives.
  - **A lagging anchor file as a break**: the append follows the commit, so a crash between the two would read as tampering.
  - **Signing in the domain**: the key is a secret read from the environment, so signing lives in `src/server/audit-signing.ts`; the domain verifier takes the check as a function and stays pure.

## Pure functions

`src/domain/audit/` (re-exported from `index.ts`):

- `canonicalJson(value: unknown): string`: the canonical JSON text; throws on a bigint.
- `GENESIS_HASH: string`: 64 zeros.
- `hashAuditEntry(prevHash: string, entry: AuditChainEntry): string`: 64 hex characters. `AuditChainEntry = { actor, action, entityType, entityId, details: unknown, createdAt: string }`.
- `auditDetailLines(details: unknown): { path, value }[]`: the lines of an entry's details card, one per leaf field instead of a printed object. On the audit page each row has a "View details" button that opens the entry as a card in a dock fixed to the bottom of the screen; several cards sit side by side (newest on the right) to compare entries, the open rows are highlighted, and a spacer as tall as the dock keeps every row's button above it (`src/app/[locale]/audit/audit-table.tsx`). Paths join keys with dots and count array items from 1 (`reasons.1.code`); a string is shown without quotes, a boolean or `null` as its word, an empty object or array as `—`; no details give no lines. Example, an `application.created` row: `decision approved`, `reasons.1.code all_checks_passed`, `reasons.1.params —`.
- `verifyAuditChain(rows: AuditChainRow[], storedHead?: { length, hash } | null): AuditChainVerdict`: `storedHead` (the `AuditHead` row `withAudit` writes in the same transaction) must match the walked chain, else `head_mismatch` (null with rows: the head row was deleted). `rows` in id order, each `{ id, prevHash, hash, ...entry }` (the columns are nullable; a null hash is a break); returns `{ ok: true, length, headHash }` or `{ ok: false, brokenAt: id, reason: 'prev_hash_mismatch' | 'hash_mismatch' | 'unhashed_in_chain' }` for the first broken row.

`src/domain/audit/seal.ts` (D81):

- `rowSigningMessage(hash): string` and `headSigningMessage({ length, hash }): string`: what the signatures cover.
- `verifySealedChain(rows: SealedRow[], storedHead: SealedHead | null, { checkSignature: ((message, signature) => boolean) | null, anchors: (AuditAnchor | null)[] }): AuditSealVerdict`: `{ ok: true, length, headHash, signaturesChecked, anchoredLength }` or `{ ok: false, brokenAt, reason }` with the D36 reasons plus `unsigned_in_chain`, `signature_mismatch`, `anchor_mismatch`, `anchor_unreadable` (`brokenAt` 0).
- `formatAnchorLine({ length, hash, at }): string` and `parseAnchorLines(text): (AuditAnchor | null)[]`: the anchor file, one JSON line each, a damaged line as null.

Server reads in `src/server/audit.ts`: `verifyAuditChain(db)` (all rows in id order, the head and the anchor file through `verifySealedChain`, plus the `publicKey`), `auditChainHead(db)` (the newest row's hash, or the genesis hash). `withAudit(db, entry, work, now?)` gained the optional `now` (an ISO instant).

## Files

- `prisma/schema.prisma` (`AuditLog.prev_hash String? @unique`, `AuditLog.hash String? @unique`), `prisma/migrations/20261105193302_audit_chain/` (SQL generated by `prisma migrate diff`: `migrate dev` refuses a non-interactive shell when it warns about the unique indexes).
- `src/domain/audit/canonical.ts`, `chain.ts`, `details.ts`, `index.ts` and their tests.
- `src/server/audit.ts`, `src/server/audit-schemas.ts`, the row in `src/server/routes.ts`, `docs/openapi.json`.
- `src/app/api/audit-log/verify/route.ts` and `route.test.ts`: read-only, open to every actor like `GET /api/audit-log`.
- `src/components/audit-chain-badge.tsx`, `src/app/[locale]/audit/page.tsx`, `audit-table.tsx` (the table and the details dock), the `audit.details.*` keys, the `audit.chain.*` keys in the four message files.
- `scripts/tamper-audit.mjs` (+ test), the `demo:tamper` script in `package.json`.
- `tests/meta-rules.test.ts` (the append-only rule; only `createHash` from `node:crypto` in the domain), `eslint.config.mjs` (the same exception); D36 in `docs/decisions.md`.
- D81: `src/domain/audit/seal.ts` (+ test); `src/server/audit-signing.ts` (the key, + test), `src/server/audit-anchors.ts` (the file, + test), `src/server/prisma-client.ts` (which file a client opened); `AuditLog.signature`, `AuditHead.signature` (`prisma/migrations/20261106074835_audit_seal/`); `scripts/ensure-env.mjs` (the key), `scripts/clear-audit-anchors.mjs`, `scripts/anchor-audit-tsa.mjs` (+ test), `scripts/tamper-audit.mjs` (`--rewrite`); `vitest.config.ts` (a key per run), `tests/helpers/reset-db.ts` (clears the anchor file); `.env.example`, `.gitignore`; the `audit.chain.*` keys in the four message files.

## Tests that pin the numbers

- `src/domain/audit/details.test.ts`: a `quote.created` entry's fields in stored order, nested reasons as `reasons.1.code`, empty values as a dash, no details as no lines.
- `src/domain/audit/canonical.test.ts`: sorted keys, arrays in order, `undefined` dropped, numbers as JSON prints them, unicode and quotes round-trip, a value and its JSON round trip agree.
- `src/domain/audit/chain.test.ts`: the formula against `createHash` directly; key order does not matter, the time does; the empty log; the three-row chain above; every row of "What breaks when" except the undetectable ones; `unhashed_in_chain` for one nulled row and for a log with every hash nulled; a hashed row without a prev hash.
- `src/server/audit.test.ts` (real migrated SQLite): the first row chains to genesis and the second to the first; `created_at` is the given instant and is in the hash; a failed `work` leaves no row and the next one chains to the last good one; ten writes verify with the head; a raw `UPDATE` of `details_json` or `created_at` is reported at that row; nulling every hash reports row 1; a second row with row 1's `prev_hash` is refused by the unique index.
- `src/app/api/audit-log/verify/route.test.ts`: the empty, intact and broken verdicts through `ok()`, parsed by the contract schema.
- `tests/meta-rules.test.ts`: "no app code updates or deletes audit rows" (checked against a planted `tx.auditLog.deleteMany()` in `src/server/`, then removed); a domain import of anything but `createHash` from `node:crypto` fails the purity rule (checked against a planted `randomUUID` import, then removed).
- `scripts/tamper-audit.test.mjs`: the argument parsing, the rewritten details, and `rewriteChain` leaving a chain the D36 walk alone accepts.
- `src/domain/audit/seal.test.ts` (D81, a fake signature check): intact, signed and anchored; the rewrite with fresh hashes is `signature_mismatch` at row 2, and `anchor_mismatch` at row 2 with no key; an unsigned row or head; a forged shorter head; an anchor longer than the log; a lagging file in any order; a damaged line.
- `src/server/audit-signing.test.ts`: sign and check, deterministic, another key's signature and garbage refused, the public key's form, an unreadable or RSA key named without the key, read once per key.
- `src/server/audit-anchors.test.ts`: beside the database or `AUDIT_ANCHOR_FILE`, append and read back, a damaged line as null.
- `src/server/audit.test.ts` "the seal" (real SQLite, the real key): every row and the head verify; one anchor per committed row and none for a failed change; the rewrite caught by the signature and, with no key, by the anchor file; a lagging and a damaged file; no write without a key.
- Review of #69: `audit.test.ts` "reads an untouched log as intact when a change commits between its reads" (the anchors are read first) and "verifies with the signatures unchecked when the key cannot be read" (no 500); `anchor-audit-tsa.test.mjs` `verifyConclusion` (a log broken below the stamped head fails) and the stamp names.
- `scripts/ensure-env.test.mjs`: the placeholder filled, a key appended to an older `.env`, an existing key never replaced. `scripts/anchor-audit-tsa.test.mjs`: the statement, the openssl and curl arguments (with the deadline), the reply's time, the log still having the stamped head.

## Open questions

- **Someone with the key and the anchor file** can rewrite and re-sign everything on this machine; only a TSA receipt from before the rewrite shows it. In production the key would sit in a key store or HSM the database host cannot read, and the anchor file on another host.
- **Stamping on a schedule**: `npm run audit:anchor` runs when a person asks; a cron job or a CI step would stamp every hour. Not built: an outside call on a timer, and the demo needs none.
- **Key rotation**: a new key makes every row signed with the old one read as forged. A rotation would store a key id per row and keep the old public keys; not built (`npm run db:reset` starts over).
- **Rows from before the seal**: a database migrated with rows already in it reads as `unsigned_in_chain` until `npm run db:reset`, the same stance as D36's unhashed rows.
- **Postgres:** the previous-row read needs `SELECT … FOR UPDATE` or an advisory lock, and a trigger could forbid `UPDATE`/`DELETE` on `AuditLog` at the database level.
- `verifyAuditChain(db)` reads the whole table and checks every signature on every audit-page load; fine for the demo, a checkpoint (verified up to id n with head h) would make it incremental.
