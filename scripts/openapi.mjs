// Writes docs/openapi.json, the generated API reference, from the route table in
// src/server/routes.ts: `npm run openapi` (through tsx, like the seed). The document is
// buildOpenApiDocument in src/server/openapi.ts; src/server/openapi.test.ts checks the
// committed file equals what it builds, so run this after any change to the route table.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { buildOpenApiDocument, openApiInfo } from '../src/server/openapi.ts';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OPENAPI_FILE = path.join(repoRoot, 'docs', 'openapi.json');
const JSON_INDENT = 2;

const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const document = buildOpenApiDocument(openApiInfo(pkg));
writeFileSync(OPENAPI_FILE, `${JSON.stringify(document, null, JSON_INDENT)}\n`);
const paths = Object.keys(document.paths).length;
process.stdout.write(`wrote ${path.relative(process.cwd(), OPENAPI_FILE)}: ${paths} paths\n`);
