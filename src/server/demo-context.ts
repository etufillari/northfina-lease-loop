import type { Customer } from '@/data/schemas';
import { isoDateSchema } from '@/data/schemas';
import { loadCustomers } from '@/data/load';
import { isIsoDate } from '@/domain/calendar';
import { ApiError } from './api-response';
import { todayIso } from './today';

export type DemoContext = {
  customer: Customer;
  businessDate: string;
  simulated: boolean;
  operator: boolean;
  actor: string;
};

// Deliberately a synthetic-persona demo, not authentication or production authorization.
// The role switch must be labelled in the UI; all private objects are still scoped below.
export async function readDemoContext(request: Request): Promise<DemoContext> {
  const customers = await loadCustomers();
  const customerId = request.headers.get('x-demo-customer') ?? customers[0]?.id;
  const customer = customers.find((item) => item.id === customerId);
  if (!customer) throw new ApiError(400, 'DEMO_CUSTOMER_UNKNOWN', 'Select a demo customer');

  const dateHeader = request.headers.get('x-demo-date');
  const businessDate = isoDateSchema.refine(isIsoDate).parse(dateHeader ?? todayIso());
  const role = request.headers.get('x-demo-role') ?? 'customer';
  if (role !== 'customer' && role !== 'operator') {
    throw new ApiError(400, 'DEMO_ROLE_UNKNOWN', 'Select a demo role');
  }
  return {
    customer,
    businessDate,
    simulated: dateHeader !== null,
    operator: role === 'operator',
    actor: role === 'operator' ? 'demo:operator:dealer' : `demo:customer:${customer.id}`,
  };
}

export function requireOperator(context: DemoContext): void {
  if (!context.operator) {
    throw new ApiError(403, 'OPERATOR_MODE_REQUIRED', 'Select the demonstration operator mode');
  }
}

export function requireCustomer(context: DemoContext): void {
  if (context.operator) {
    throw new ApiError(403, 'CUSTOMER_MODE_REQUIRED', 'Select the demonstration customer mode');
  }
}

// A same-origin browser write is expected. This is CSRF hygiene, not login.
export function checkRequestOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (origin === null) return;
  const url = new URL(request.url);
  // NextRequest can normalize loopback addresses or expose the server's bind hostname.
  // Host retains the browser's actual authority. Do not trust X-Forwarded-Host here.
  const host = (request.headers.get('host') ?? url.host).toLowerCase();
  let matches = false;
  try {
    const supplied = new URL(origin);
    matches =
      origin === supplied.origin && supplied.protocol === url.protocol && supplied.host === host;
  } catch {
    // An opaque or malformed Origin is not a same-origin browser request.
  }
  if (!matches) {
    throw new ApiError(403, 'ORIGIN_REJECTED', 'Use this application to make the request');
  }
}
