import type { z } from 'zod';
import { readApiResponse, RequestFailure } from './response-reader';
export { RequestFailure } from './response-reader';

export type DemoRole = 'customer' | 'operator';
export type DemoSelection = {
  customerId: string;
  businessDate: string;
  role?: DemoRole;
};

/** The role is explicit. An operator-only call cannot elevate a customer selection. */
export async function requestJson<S extends z.ZodType>(
  path: string,
  selection: DemoSelection,
  schema: S,
  body?: unknown,
  requiresOperator = false,
  signal?: AbortSignal
): Promise<z.output<S>> {
  const role = selection.role ?? 'customer';
  if (requiresOperator && role !== 'operator') {
    throw new RequestFailure('OPERATOR_MODE_REQUIRED');
  }
  const headers: Record<string, string> = { 'x-demo-role': role };
  if (role === 'customer' && selection.customerId) {
    headers['x-demo-customer'] = selection.customerId;
  }
  if (selection.businessDate) headers['x-demo-date'] = selection.businessDate;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch('/api/spine/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  return readApiResponse(response, schema);
}
