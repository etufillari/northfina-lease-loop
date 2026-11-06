import { z } from 'zod';
import type { PrismaClient } from '@/generated/prisma/client';
import type { VatRate } from '@/data/schemas';
import { ApiError, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { EngineServiceError, type LeaseDTO } from './contracts';
import { getLease } from './leases';
import { issueInvoice, listLeaseInvoices } from './invoices';
import { getInvoice, getLeaseSchedule } from './queries';

export type EnginePrincipal =
  { actorId: string; role: 'operator' } | { actorId: string; role: 'customer'; customerId: string };
export type EngineHttpDependencies = {
  db: PrismaClient;
  /** Must verify server authentication and mutation CSRF/origin policy; never trust body/cookie IDs alone. */
  resolvePrincipal(request: Request): Promise<EnginePrincipal | null>;
  loadTaxRules(): Promise<readonly VatRate[]>;
};
type LeaseContext = { params: Promise<{ leaseId: string }> };
type InvoiceContext = { params: Promise<{ invoiceId: string }> };
const idSchema = z.string().trim().min(1).max(100);
const bodySchema = z.strictObject({ periodIndex: z.number().int().min(1).max(48) });
const principalSchema = z.discriminatedUnion('role', [
  z.object({ actorId: idSchema, role: z.literal('operator') }),
  z.object({ actorId: idSchema, role: z.literal('customer'), customerId: idSchema }),
]);
const errors: Record<EngineServiceError['code'], { status: number; message: string }> = {
  NOT_FOUND: { status: 404, message: 'Lease or invoice not found' },
  INVALID_TRANSITION: { status: 409, message: 'Operation is not permitted in this state' },
  IDEMPOTENCY_CONFLICT: {
    status: 409,
    message: 'Request key has already been used for another request',
  },
  LEASE_EXISTS: { status: 409, message: 'A lease already exists for this contract' },
  INVOICE_EXISTS: { status: 409, message: 'An invoice already exists for this period' },
  VERSION_CONFLICT: { status: 409, message: 'Lease changed; reload before retrying' },
  INVALID_CALCULATION: { status: 422, message: 'Invoice cannot be calculated for this request' },
};

export async function respondEngineOperation(work: () => Promise<unknown>): Promise<Response> {
  try {
    return ok(await work());
  } catch (error) {
    if (!(error instanceof EngineServiceError)) throw error;
    if (
      error.code === 'INVALID_CALCULATION' &&
      ['tax_rule_missing', 'tax_rule_overlap', 'invalid_tax_rule'].includes(error.reason ?? '')
    ) {
      throw new ApiError(503, 'TAX_CONFIGURATION_ERROR', 'Tax configuration is unavailable');
    }
    const mapped = errors[error.code];
    throw new ApiError(mapped.status, error.code, mapped.message);
  }
}

/** Handler factory only. Register routes after connecting a trusted principal resolver. */
export function createEngineHttpHandlers(deps: EngineHttpDependencies) {
  async function principal(request: Request): Promise<EnginePrincipal> {
    const resolved = await deps.resolvePrincipal(request);
    if (!resolved) throw new ApiError(401, 'UNAUTHORIZED', 'Sign in to access lease records');
    const result = principalSchema.safeParse(resolved);
    if (!result.success) throw new Error('Invalid server principal');
    return result.data;
  }
  function authorizeRead(actor: EnginePrincipal, lease: LeaseDTO) {
    if (actor.role === 'customer' && actor.customerId !== lease.customerId) {
      throw new ApiError(403, 'FORBIDDEN', 'Access to this lease is not permitted');
    }
  }
  async function leaseForRead(request: Request, context: LeaseContext) {
    const actor = await principal(request);
    const leaseId = idSchema.parse((await context.params).leaseId);
    const lease = await getLease(deps.db, leaseId);
    authorizeRead(actor, lease);
    return lease;
  }
  return {
    lease: handleRoute<LeaseContext>((request, context) =>
      respondEngineOperation(() => leaseForRead(request, context))
    ),
    schedule: handleRoute<LeaseContext>((request, context) =>
      respondEngineOperation(async () => {
        const lease = await leaseForRead(request, context);
        return getLeaseSchedule(deps.db, lease.leaseId);
      })
    ),
    invoices: handleRoute<LeaseContext>((request, context) =>
      respondEngineOperation(async () => {
        const lease = await leaseForRead(request, context);
        return listLeaseInvoices(deps.db, lease.leaseId);
      })
    ),
    invoice: handleRoute<InvoiceContext>((request, context) =>
      respondEngineOperation(async () => {
        const actor = await principal(request);
        const invoiceId = idSchema.parse((await context.params).invoiceId);
        const invoice = await getInvoice(deps.db, invoiceId);
        authorizeRead(actor, await getLease(deps.db, invoice.leaseId));
        return invoice;
      })
    ),
    issue: handleRoute<LeaseContext>((request, context) =>
      respondEngineOperation(async () => {
        const actor = await principal(request);
        if (actor.role !== 'operator')
          throw new ApiError(403, 'FORBIDDEN', 'Only operators can issue invoices');
        const leaseId = idSchema.parse((await context.params).leaseId);
        const input = await readJsonBody(request, bodySchema);
        const idempotencyKey = idSchema.parse(request.headers.get('Idempotency-Key'));
        return issueInvoice(
          deps.db,
          { actor: actor.actorId, idempotencyKey },
          { leaseId, periodIndex: input.periodIndex },
          await deps.loadTaxRules()
        );
      })
    ),
  };
}
