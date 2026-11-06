// docs/openapi.json is exactly what buildOpenApiDocument makes of the route table, so a route
// change without `npm run openapi` fails here. Ported from the practice repo's contracts test.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument, OPENAPI_VERSION, openApiInfo, openApiPath } from './openapi';
import { ROUTES } from './routes';

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const pkg = JSON.parse(read('../../package.json')) as Record<string, string>;
const info = openApiInfo(pkg);

type Operation = {
  tags: string[];
  summary: string;
  parameters: { name: string; in: string; required: boolean }[];
  requestBody?: { content: Record<string, { schema: Record<string, unknown> }> };
  responses: Record<string, { content: Record<string, { schema: Record<string, unknown> }> }>;
};
const document = buildOpenApiDocument(info) as unknown as {
  openapi: string;
  info: typeof info;
  paths: Record<string, Record<string, Operation>>;
};
const operation = (path: string, method: string) =>
  document.paths[openApiPath(path)]?.[method.toLowerCase()];
const JSON_TYPE = 'application/json';

describe('docs/openapi.json', () => {
  it('is what the generator makes of the route table (run `npm run openapi` after a change)', () => {
    expect(JSON.parse(read('../../docs/openapi.json'))).toEqual(document);
  });

  it("is OpenAPI 3.1 with the package's name, version and description", () => {
    expect(document.openapi).toBe(OPENAPI_VERSION);
    expect(info).toEqual({ title: pkg.name, version: pkg.version, description: pkg.description });
  });

  it('has one operation per row of the route table, with its summary and tag', () => {
    for (const route of ROUTES) {
      const op = operation(route.path, route.method);
      expect(op?.summary).toBe(route.summary);
      expect(op?.tags).toEqual([route.tag]);
    }
    const count = Object.values(document.paths).flatMap((methods) => Object.keys(methods)).length;
    expect(count).toBe(ROUTES.length);
  });

  it('writes Next [segments] as OpenAPI {segments}', () => {
    expect(openApiPath('/api/assets/[id]/status')).toBe('/api/assets/{id}/status');
    expect(openApiPath('/api/files/[...slug]')).toBe('/api/files/{slug}');
  });

  it('writes path and query parameters and the body as JSON Schema', () => {
    const patch = operation('/api/assets/[id]/status', 'PATCH');
    expect(patch?.parameters).toEqual([
      expect.objectContaining({ name: 'id', in: 'path', required: true }),
    ]);
    expect(patch?.requestBody?.content[JSON_TYPE]?.schema).toMatchObject({
      type: 'object',
      required: ['status'],
    });
    const list = operation('/api/assets', 'GET');
    expect(list?.parameters).toEqual([
      expect.objectContaining({ name: 'category', in: 'query', required: false }),
    ]);
    expect(list?.requestBody).toBeUndefined();
  });

  it('wraps the success data in the ok() envelope and answers errors with the fail() one', () => {
    const list = operation('/api/assets', 'GET');
    expect(list?.responses['200']?.content[JSON_TYPE]?.schema).toMatchObject({
      type: 'object',
      required: ['success', 'data', 'meta'],
      properties: { success: { const: true }, data: { type: 'array' } },
    });
    expect(list?.responses.default?.content[JSON_TYPE]?.schema).toMatchObject({
      required: ['success', 'error', 'meta'],
      properties: { success: { const: false } },
    });
  });
});
