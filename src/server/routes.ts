// The route table: one row per API route, with the Zod schemas of its params, query, body and
// success response (the `data` inside the `ok()` envelope). Route files import their schemas
// from here, `src/server/openapi.ts` turns the table into docs/openapi.json
// (`npm run openapi`), and routes.test.ts fails when a route.ts has no row or a row no file.
//
// Contract first (AGENTS.md, team rule 2): a slice's first commit adds its row here.
import { z } from 'zod';
import { answerSchema, answersSchema } from '@/domain/rows/application';
import {
  assetCategorySchema,
  assetSchema,
  assetStatusSchema,
  centsSchema,
  isoDateSchema,
} from '@/data/schemas';
import {
  applicationDecisionSchema,
  assetEventKindSchema,
  invoiceKindSchema,
  invoiceStatusSchema,
} from '@/domain/statuses';
import { auditChainVerdictSchema } from './audit-schemas';
import { demoCardParamsSchema, demoCardRunSchema } from './demo-cards-schemas';
import {
  addSignatoryBodySchema,
  customerIdParamsSchema,
  signByTokenBodySchema,
  signatoryListSchema,
  signatoryParamsSchema,
  signatorySchema,
  signingLinkSchema,
  signingTokenParamsSchema,
} from './signatory-schemas';
import {
  contractIdParamsSchema,
  contractResponseSchema,
  signContractBodySchema,
} from './contract-schemas';
import {
  exitBodySchema,
  exitParamsSchema,
  exitPreviewQuerySchema,
  exitPreviewResponseSchema,
  exitResponseSchema,
} from './exit-schemas';
import {
  createQuoteBodySchema,
  previewQuoteQuerySchema,
  previewQuoteResponseSchema,
  quoteIdParamsSchema,
  storedQuoteResponseSchema,
} from './quote-schemas';
import {
  assessmentBodySchema,
  assessmentParamsSchema,
  assessmentResponseSchema,
} from './second-life-schemas';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type RouteDefinition = {
  method: HttpMethod;
  /** The Next.js pattern, e.g. `/api/assets/[id]/status`. */
  path: string;
  summary: string;
  /** Groups the route in the OpenAPI document; one tag per slice. */
  tag: string;
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  /** The `data` of the success envelope. */
  response: z.ZodType;
  /** The success status; 200 when not set. */
  status?: number;
};

// ---------- assets ----------

export const listAssetsQuerySchema = z.object({ category: assetCategorySchema.optional() });

export const assetIdParamsSchema = z.object({ id: z.string().min(1) });

/** Body of `PATCH /api/assets/[id]/status`. The actor is the cookie's, never the body's (D17). */
export const changeAssetStatusBodySchema = z.strictObject({
  status: assetStatusSchema,
});

// ---------- actor ----------

/** Body of `POST /api/actor`. Whether the actor exists is checked against the database. */
export const actorBodySchema = z.strictObject({
  actor: z.string().min(1).max(100),
});

/** A customer id, `admin` or `anonymous`. */
export const actorResponseSchema = z.object({ actor: z.string().min(1) });

// ---------- demo clock ----------

/** Body of `POST /api/demo/clock`: a real day to travel to, or `null` to go back to today. */
export const demoClockBodySchema = z.strictObject({
  asOf: isoDateSchema.nullable(),
});

export const demoClockResponseSchema = z.object({
  asOf: isoDateSchema.nullable(),
  today: isoDateSchema,
});

// ---------- audit log ----------

export const auditLogEntrySchema = z.object({
  id: z.number().int(),
  created_at: z.iso.datetime(),
  actor: z.string(),
  action: z.string(),
  entity_type: z.string(),
  entity_id: z.string(),
  details: z.unknown(),
});

// ---------- invoices ----------

export const listInvoicesQuerySchema = z.object({ contractId: z.string().min(1) });

export const invoiceIdParamsSchema = z.object({ id: z.string().min(1) });

/** One invoice: money in cents, the VAT rate in basis points (2550 = 25.5 %). */
export const invoiceViewSchema = z.object({
  id: z.string(),
  contractId: z.string(),
  sequence: z.number().int().nonnegative(),
  kind: invoiceKindSchema,
  periodStart: isoDateSchema.nullable(),
  periodEnd: isoDateSchema.nullable(),
  issueDate: isoDateSchema,
  dueDate: isoDateSchema,
  netCents: centsSchema,
  vatRateBasisPoints: z.number().int().nonnegative(),
  vatCents: centsSchema,
  grossCents: centsSchema,
  status: invoiceStatusSchema,
  paidOn: isoDateSchema.nullable(),
});

// ---------- applications ----------

// The answers' shape is the domain's (src/domain/rows/application.ts); re-exported for the routes.
export { answerSchema, answersSchema };

/** Body of `POST /api/applications`. The server prunes, validates and evaluates. */
export const createApplicationBodySchema = z.strictObject({
  // Spaces around an id are not part of it; the trimmed customer id must be the actor (D40).
  quoteId: z.string().trim().min(1).max(100),
  customerId: z.string().trim().min(1).max(100),
  answers: answersSchema,
  /** The admin applying for a customer names them here (D47); equal to `customerId`. */
  onBehalfOf: z.string().min(1).max(100).optional(),
});

export const applicationIdParamsSchema = z.object({ id: z.string().min(1).max(100) });

/** Body of `POST /api/applications/[id]/decision` (D10): the admin's review only (D46). */
export const decideApplicationBodySchema = z.strictObject({
  decision: z.enum(['approved', 'rejected']),
  /** Accepted for older clients and ignored: the reviewer is the cookie's actor (finding 13). */
  reviewedBy: z.string().trim().min(1).max(200).optional(),
});

export const applicationReasonSchema = z.object({
  code: z.string(),
  params: z.record(z.string(), z.union([z.string(), z.number()])),
});

export const applicationSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  quoteId: z.string(),
  answers: answersSchema,
  decision: applicationDecisionSchema,
  reasons: z.array(applicationReasonSchema),
  decidedOn: isoDateSchema,
  reviewedBy: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

// ---------- passport and impact ----------

const passportEventSchema = z.object({
  id: z.number().int(),
  kind: assetEventKindSchema,
  on_date: isoDateSchema,
  contract_id: z.string().nullable(),
  details: z.unknown(),
});

const lifeSchema = z.object({
  index: z.number().int().nonnegative(),
  start: isoDateSchema.nullable(),
  end: isoDateSchema.nullable(),
  contractId: z.string().nullable(),
  months: z.number().int().nonnegative().nullable(),
  endKind: z.enum(['returned', 'bought', 'passed_on']).nullable(),
  estimated: z.boolean(),
  between: z.array(passportEventSchema),
});

/** `GET /api/assets/[id]/passport`: the asset, its lives as of today and the CO2 and money they saved. */
export const passportResponseSchema = z.object({
  asset: assetSchema,
  asOf: isoDateSchema,
  before: z.array(passportEventSchema),
  lives: z.array(lifeSchema),
  co2: z.object({
    /** Per life, whole kg; the first life is always 0. */
    perLifeKg: z.array(z.number().int().nonnegative()),
    /** Rounded once from the unrounded grams, so not always the sum of `perLifeKg`. */
    totalKg: z.number().int().nonnegative(),
  }),
  money: z.object({
    /** Per life, cents at the list price as new on `asOf` (D80); the first life is always 0. */
    perLifeCents: z.array(z.number().int().nonnegative()),
    /** Rounded once from the exact sum, so not always the sum of `perLifeCents`. */
    totalCents: z.number().int().nonnegative(),
  }),
});

// ---------- the table ----------

export const ROUTES: readonly RouteDefinition[] = [
  {
    method: 'POST',
    path: '/api/actor',
    summary: 'Act as a customer or admin: sets the actor cookie (no login, D17)',
    tag: 'actor',
    body: actorBodySchema,
    response: actorResponseSchema,
  },
  {
    method: 'DELETE',
    path: '/api/actor',
    summary: 'Stop acting: clears the actor cookie, so the visitor is anonymous',
    tag: 'actor',
    response: actorResponseSchema,
  },
  {
    method: 'GET',
    path: '/api/assets',
    summary: 'List the assets in the catalogue, optionally of one category',
    tag: 'assets',
    query: listAssetsQuerySchema,
    response: z.array(assetSchema),
  },
  {
    method: 'PATCH',
    path: '/api/assets/[id]/status',
    summary:
      "Admin only: change an asset's status along D22's transitions, audited; 401 not signed in, 403 FORBIDDEN (D73, D74)",
    tag: 'assets',
    params: assetIdParamsSchema,
    body: changeAssetStatusBodySchema,
    response: assetSchema,
  },
  {
    method: 'GET',
    path: '/api/assets/[id]/passport',
    summary:
      "An asset's passport: its lives across leases and the CO2 and money its later lives saved (D15, D80)",
    tag: 'passport',
    params: assetIdParamsSchema,
    response: passportResponseSchema,
  },
  {
    method: 'POST',
    path: '/api/demo/clock',
    summary:
      'Set the demo clock to a day, or clear it with null (the one date the browser may send)',
    tag: 'demo',
    body: demoClockBodySchema,
    response: demoClockResponseSchema,
  },
  {
    method: 'POST',
    path: '/api/demo/cards/[id]/run',
    summary:
      "Run scenario card 1 to 10 through the real services on the card's days, set the demo clock and actor, answer the steps and the landing page (409 card_already_run links the earlier records); 404 while DEMO_TOOLS is off (D74)",
    tag: 'demo',
    params: demoCardParamsSchema,
    response: demoCardRunSchema,
  },
  {
    method: 'GET',
    path: '/api/audit-log',
    summary: 'The 50 newest audit rows, newest first',
    tag: 'audit',
    response: z.array(auditLogEntrySchema),
  },
  {
    method: 'GET',
    path: '/api/audit-log/verify',
    summary:
      'Walk the audit hash chain: intact with its length and head hash, or the first broken row (read-only, every actor)',
    tag: 'audit',
    response: auditChainVerdictSchema,
  },
  {
    method: 'GET',
    path: '/api/invoices',
    summary:
      "A contract's invoices in sequence order (the contract's customer or admin); 401 not signed in, 403 FORBIDDEN (D73, D74)",
    tag: 'invoices',
    query: listInvoicesQuerySchema,
    response: z.array(invoiceViewSchema),
  },
  {
    method: 'POST',
    path: '/api/invoices/[id]/pay',
    summary:
      "Pay an invoice on the request's day: audited, emits INVOICE_PAID (the contract's customer or admin); 401 not signed in, 403 FORBIDDEN (D73, D74)",
    tag: 'invoices',
    params: invoiceIdParamsSchema,
    response: invoiceViewSchema,
  },
  {
    method: 'POST',
    path: '/api/quotes',
    summary: "Price on today's date and store the quote, valid 14 days (D7), with its audit row",
    tag: 'pricing',
    body: createQuoteBodySchema,
    response: storedQuoteResponseSchema,
    status: 201,
  },
  {
    method: 'GET',
    path: '/api/quotes/preview',
    summary: 'Price on today without storing: the breakdown and the term comparison (the sliders)',
    tag: 'pricing',
    query: previewQuoteQuerySchema,
    response: previewQuoteResponseSchema,
  },
  {
    method: 'GET',
    path: '/api/quotes/[id]',
    summary: 'A stored quote from its frozen numbers (never re-priced) and its status today',
    tag: 'pricing',
    params: quoteIdParamsSchema,
    response: storedQuoteResponseSchema,
  },
  {
    method: 'POST',
    path: '/api/applications',
    summary:
      'Submit the answers for a quote: prunes, validates, evaluates the eligibility rules (D9); the admin only with onBehalfOf (D47); 409 QUOTE_IN_USE while another application holds the quote (D56); 401 not signed in, 403 FORBIDDEN (D73, D74)',
    tag: 'applications',
    body: createApplicationBodySchema,
    response: applicationSchema,
    status: 201,
  },
  {
    method: 'GET',
    path: '/api/applications/[id]',
    summary:
      'An application with its decision and reasons as codes with params (the applicant or admin; 404 for another customer, D57); 401 not signed in, 403 FORBIDDEN (D73, D74)',
    tag: 'applications',
    params: applicationIdParamsSchema,
    response: applicationSchema,
  },
  {
    method: 'POST',
    path: '/api/applications/[id]/decision',
    summary:
      'An admin decides a manual review (D10); an awaiting_signatory case is refused (signatory_required): it is signed through the link (D46); 401 not signed in, 403 FORBIDDEN (D73, D74)',
    tag: 'applications',
    params: applicationIdParamsSchema,
    body: decideApplicationBodySchema,
    response: applicationSchema,
  },
  {
    method: 'POST',
    path: '/api/applications/[id]/withdraw',
    summary:
      'The applicant (or the admin for them) withdraws an application not signed yet: approved, in manual review or awaiting the signatory (D87); 409 APPLICATION_NOT_WITHDRAWABLE when signed or final; 401 not signed in, 403 FORBIDDEN (D73)',
    tag: 'applications',
    params: applicationIdParamsSchema,
    response: applicationSchema,
  },
  {
    method: 'GET',
    path: '/api/customers/[id]/signatories',
    summary:
      "The company's signatory list with each entry's state today (the company or admin, D46); 401 not signed in, 403 FORBIDDEN (D73, D74)",
    tag: 'signatories',
    params: customerIdParamsSchema,
    response: signatoryListSchema,
  },
  {
    method: 'POST',
    path: '/api/customers/[id]/signatories',
    summary:
      "Add a signatory, valid from validFrom up to validTo (the company's own signatory or admin, D46); 401 not signed in, 403 FORBIDDEN (D73, D74)",
    tag: 'signatories',
    params: customerIdParamsSchema,
    body: addSignatoryBodySchema,
    response: signatorySchema,
    status: 201,
  },
  {
    method: 'POST',
    path: '/api/customers/[id]/signatories/[signatoryId]/revoke',
    summary:
      "End a signatory's right today; the last active one cannot be revoked (D46); 401 not signed in, 403 FORBIDDEN (D73, D74)",
    tag: 'signatories',
    params: signatoryParamsSchema,
    response: signatorySchema,
  },
  {
    method: 'GET',
    path: '/api/sign/[token]',
    summary: 'The signing link: who signs for which application, and whether it is pending (D46)',
    tag: 'signatories',
    params: signingTokenParamsSchema,
    response: signingLinkSchema,
  },
  {
    method: 'POST',
    path: '/api/sign/[token]',
    summary:
      'The signatory signs (approved) or declines (rejected) through the link; registers them (D46)',
    tag: 'signatories',
    params: signingTokenParamsSchema,
    body: signByTokenBodySchema,
    response: applicationSchema,
  },
  {
    method: 'POST',
    path: '/api/contracts',
    summary:
      "Sign an approved application on the request's day: copies the quote, emits CONTRACT_SIGNED (the applicant or admin); 401 not signed in, 403 FORBIDDEN (D73, D74)",
    tag: 'contracts',
    body: signContractBodySchema,
    response: contractResponseSchema,
    status: 201,
  },
  {
    method: 'GET',
    path: '/api/contracts/[id]',
    summary:
      "A contract with its frozen price and why it holds (the contract's customer or admin); 401 not signed in, 403 FORBIDDEN (D73, D74)",
    tag: 'contracts',
    params: contractIdParamsSchema,
    response: contractResponseSchema,
  },
  {
    method: 'GET',
    path: '/api/contracts/[id]/exit-preview',
    summary:
      "What buying, returning or passing on would cost on the request's day, line by line (D14), without writing; 401 not signed in, 403 FORBIDDEN (D73, D74)",
    tag: 'exits',
    params: exitParamsSchema,
    query: exitPreviewQuerySchema,
    response: exitPreviewResponseSchema,
  },
  {
    method: 'POST',
    path: '/api/contracts/[id]/exit',
    summary:
      "Buy out, return or pass on on the request's day: sets the status, emits the event, bills the exit (the customer or admin); 401 not signed in, 403 FORBIDDEN (D73, D74)",
    tag: 'exits',
    params: exitParamsSchema,
    body: exitBodySchema,
    response: exitResponseSchema,
  },
  {
    method: 'POST',
    path: '/api/assets/[id]/assessments',
    summary:
      "Assess a returned asset on the request's day and relist it: the plan, the second-life price (D86: the market value), the waiting-list match (D13), the asset available (admin); an optional body is the inspection (D77); 401 not signed in, 403 FORBIDDEN (D73, D74), 422 relist_unpriced (no condition can be leased)",
    tag: 'second-life',
    params: assessmentParamsSchema,
    body: assessmentBodySchema,
    response: assessmentResponseSchema,
    status: 201,
  },
];

/** `METHOD /api/…`, the key of a row. */
export function routeKey(route: Pick<RouteDefinition, 'method' | 'path'>): string {
  return `${route.method} ${route.path}`;
}
