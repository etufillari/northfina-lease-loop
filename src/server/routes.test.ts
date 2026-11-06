// The route table is complete: every route.ts under src/app/api has a row with the method it
// exports, and every row has a route.ts, so the OpenAPI document cannot drift from the app.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ROUTES, routeKey } from './routes';

const apiDir = fileURLToPath(new URL('../app/api', import.meta.url));

/** `METHOD /api/…` for every handler exported by a route.ts under src/app/api. */
function routesInApp(): string[] {
  return readdirSync(apiDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name === 'route.ts')
    .flatMap((entry) => {
      const file = path.join(entry.parentPath, entry.name);
      const dir = path.relative(apiDir, entry.parentPath).split(path.sep).filter(Boolean);
      const routePath = ['/api', ...dir].join('/');
      const methods = [
        ...readFileSync(file, 'utf8').matchAll(
          /^export\s+(?:const|async\s+function|function)\s+(GET|POST|PUT|PATCH|DELETE)\b/gm
        ),
      ].map((match) => match[1] as string);
      return methods.map((method) => `${method} ${routePath}`);
    })
    .sort();
}

describe('the route table', () => {
  it('has one row per handler under src/app/api, and no row without one', () => {
    expect(ROUTES.map(routeKey).sort()).toEqual(routesInApp());
  });

  it('has no duplicate rows', () => {
    const keys = ROUTES.map(routeKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('declares a params schema exactly when the path has a [segment]', () => {
    for (const route of ROUTES) {
      expect(Boolean(route.params), routeKey(route)).toBe(route.path.includes('['));
    }
  });

  it('declares a body only for methods that take one', () => {
    for (const route of ROUTES.filter((row) => row.method === 'GET' || row.method === 'DELETE')) {
      expect(route.body, routeKey(route)).toBeUndefined();
    }
  });
});
