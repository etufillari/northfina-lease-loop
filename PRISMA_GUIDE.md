# Prisma guide for the Lease Loop team

A shared reference for working on this repository's database. This replaces the
installed Prisma skill packages and their Claude/Windsurf links; it is ordinary
project documentation, not an automatically installed agent skill.

Follow [AGENTS.md](AGENTS.md) and [RULES.md](RULES.md) first. For the data pack, read
[data/DATA.md](data/DATA.md). Authentication and customer ownership are described in
[AUTHENTICATION.md](AUTHENTICATION.md).

## Current setup

- Prisma ORM 7 with SQLite and `@prisma/adapter-better-sqlite3`.
- `prisma/schema.prisma` defines models and the generated-client output.
- `prisma.config.ts` defines the connection, migrations and seed command, and loads
  the local environment file.
- Generated client code lives in `src/generated/prisma/`; do not edit or commit it.
- Reuse the database client from `src/server/db.ts` rather than creating clients
  throughout the app. Keep database access on the server.

## Everyday commands

| Task                                                | Command                                        |
| --------------------------------------------------- | ---------------------------------------------- |
| Set up a fresh local database and seed data         | `npm run db:setup`                             |
| Generate a migration after a schema change          | `npm run db:migrate -- --name describe_change` |
| Regenerate the client without changing the database | `npx prisma generate`                          |
| Apply existing migrations in deployment             | `npx prisma migrate deploy`                    |
| Check migration status                              | `npx prisma migrate status`                    |
| Validate the schema                                 | `npx prisma validate`                          |
| Browse the local database                           | `npm run db:studio`                            |
| Run the project's full checks                       | `npm run check:all`                            |

`npm run db:reset` deletes local database data and reseeds it. Use it only when
that data is disposable. Inspect the configured target before any reset or other
operation that removes data.

## Schema changes

1. Edit `prisma/schema.prisma`.
2. Run `npm run db:migrate -- --name describe_change` against your development database.
3. Review the generated migration and regenerate the client if needed.
4. Update affected server code and tests, then run `npm run check:all`.
5. Commit the schema and generated migration together.

Never hand-write migration SQL. Do not replace this migration workflow with
`db push`, which does not create migration history. Prisma 7 does not automatically
run client generation or seeding after every migration command.

## Queries and transactions

- Use Prisma's typed model methods for reads and writes. Select only the fields
  the caller needs; use explicit ordering when order matters.
- Validate request inputs before using them in queries. Prefer parameterized
  Prisma queries over SQL string concatenation.
- Every application data change goes through `withAudit()` in
  `src/server/audit.ts`. Use its `tx` client for every write in that change.
- The business change and audit entry must succeed or roll back together. Keep
  transactions short; avoid network calls inside them.
- Keep business decisions in pure, tested `src/domain/` functions. Pass their
  results to the server code that performs the database operation.
- Store money as integer euro cents and document where calculations round.
- API routes use `ok()`, `fail()` and `handleRoute()`; never expose database errors.

For customer-owned data, obtain the customer ID from the verified server session.
Filter records by that ID; a customer ID supplied by the browser is not proof of
ownership. See `src/server/auth-session.ts` and `AUTHENTICATION.md`.

## Troubleshooting

- Use the Node 22 version selected by `.nvmrc` (`nvm install` then `nvm use`).
  Run `npm ci` under that same runtime: SQLite includes a native module that must
  match Node. A `NODE_MODULE_VERSION` mismatch means installation and execution
  used different Node versions.
- Check that dependencies are installed, the generated client matches the schema,
  and the intended database has all migrations applied.
- Check the database URL and environment loading without printing secrets. Keep
  local database files and `.env` out of Git.
- Inspect migration status before trying to repair a failed migration. Do not
  reset a shared database to resolve a local setup issue.
- Tests create a separate temporary SQLite database; do not point them at a
  teammate's database or use the development database as a test fixture.

## Topics outside the current app

The removed skill packages also covered database provisioning, Prisma Compute,
SQL adapter internals, and major-version upgrades. None is required for the
current SQLite app. Consult the version-specific upstream documentation before
adding one of these workflows; do not upgrade Prisma or change database providers
as a side effect of an unrelated feature.

Source packages: [prisma/skills](https://github.com/prisma/skills).
Further references: [Prisma documentation](https://www.prisma.io/docs),
[Prisma Client](https://www.prisma.io/docs/orm/prisma-client),
[Prisma Migrate](https://www.prisma.io/docs/orm/prisma-migrate).

## Test database engine workaround

The test setup in `tests/global-setup.ts` sets `RUST_LOG=info` for its Prisma
migration subprocess. On affected Prisma versions, SQLite database creation can
fail with a generic schema-engine error when engine logging is suppressed.
See [upstream issue 29355](https://github.com/prisma/prisma/issues/29355).

This setting applies only to test database initialization. It does not change app
logging, skip migrations or reset the development database. To check that an
inherited logging level cannot break setup, run `RUST_LOG=error npm run test:coverage`
in a POSIX shell; the test setup explicitly overrides it for the migration command.
