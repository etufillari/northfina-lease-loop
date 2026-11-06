// The API reference: an OpenAPI 3.1 document of every row of the route table (routes.ts), its
// params, query, body and response as JSON Schema from the rows' own Zod schemas, wrapped in
// the envelope of api-response.ts. Pure: it builds the document and writes nothing;
// `npm run openapi` (scripts/openapi.mjs) writes it to docs/openapi.json and openapi.test.ts
// compares the committed file with it. Ported from the practice repo's contracts package.
import { z } from 'zod';
import { ROUTES, type RouteDefinition } from './routes';

export const OPENAPI_VERSION = '3.1.0';

const JSON_CONTENT_TYPE = 'application/json';
const DEFAULT_STATUS = 200;

export type OpenApiInfo = { title: string; version: string; description: string };

type JsonSchema = Record<string, unknown>;

/** The info block from package.json's name, version and description. */
export function openApiInfo(pkg: Record<string, unknown>): OpenApiInfo {
  return {
    title: String(pkg.name),
    version: String(pkg.version),
    description: String(pkg.description),
  };
}

/** `/api/assets/[id]/status` → `/api/assets/{id}/status` (a catch-all `[...slug]` → `{slug}`). */
export function openApiPath(nextPath: string): string {
  return nextPath.replace(/\[(?:\.\.\.)?([^\]]+)\]/g, '{$1}');
}

const metaSchema = z.object({ timestamp: z.iso.datetime() });

/** `ok()`: `{ success: true, data, meta }`. */
const successEnvelope = (data: z.ZodType) =>
  z.object({ success: z.literal(true), data, meta: metaSchema });

/** `fail()`: `{ success: false, error: { code, message, details? }, meta }`. */
const failureEnvelope = z.object({
  success: z.literal(false),
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
  meta: metaSchema,
});

/** A schema as JSON Schema: what a client sends (`input`) or what it reads (`output`). */
function jsonSchema(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
  const { $schema: _dialect, ...rest } = z.toJSONSchema(schema, { io, unrepresentable: 'any' });
  return rest;
}

/** The parameters of an object schema of params or query, one per key. */
function parameters(schema: z.ZodType | undefined, location: 'path' | 'query') {
  if (!schema) return [];
  const object = jsonSchema(schema, 'input');
  const properties = (object.properties ?? {}) as Record<string, JsonSchema>;
  const required = new Set((object.required ?? []) as string[]);
  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: location,
    required: location === 'path' || required.has(name),
    schema: property,
  }));
}

const jsonContent = (schema: JsonSchema) => ({ [JSON_CONTENT_TYPE]: { schema } });

function operation(route: RouteDefinition) {
  return {
    summary: route.summary,
    tags: [route.tag],
    parameters: [...parameters(route.params, 'path'), ...parameters(route.query, 'query')],
    ...(route.body
      ? { requestBody: { required: true, content: jsonContent(jsonSchema(route.body, 'input')) } }
      : {}),
    responses: {
      [String(route.status ?? DEFAULT_STATUS)]: {
        description: 'Success',
        content: jsonContent(jsonSchema(successEnvelope(route.response), 'output')),
      },
      default: {
        description: 'An error: 400 VALIDATION_ERROR or INVALID_JSON, 404, 409, 500 INTERNAL_ERROR',
        content: jsonContent(jsonSchema(failureEnvelope, 'output')),
      },
    },
  };
}

/** The whole document: one path per route pattern, one operation per method, sorted. */
export function buildOpenApiDocument(info: OpenApiInfo, routes = ROUTES) {
  const paths: Record<string, Record<string, ReturnType<typeof operation>>> = {};
  for (const route of routes) {
    const key = openApiPath(route.path);
    paths[key] = { ...paths[key], [route.method.toLowerCase()]: operation(route) };
  }
  const sorted = Object.fromEntries(Object.entries(paths).sort(([a], [b]) => a.localeCompare(b)));
  return {
    openapi: OPENAPI_VERSION,
    info,
    tags: [...new Set(routes.map((route) => route.tag))].sort().map((name) => ({ name })),
    paths: sorted,
  };
}
