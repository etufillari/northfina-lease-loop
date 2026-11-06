// Validate the actual JSON returned by each endpoint, not only its outer envelope.
import { z } from 'zod';
import { dealerNextActionsSchema } from './dealer-next-actions-schema';
import { valuationBaselineSchema } from './valuation-baseline-schemas';
import {
  assetSchema,
  coefficientTableSchema,
  customerSchema,
  isoDateSchema,
  questionSchema,
  refurbishmentCostsSchema,
  vatRatesSchema,
} from './schemas';
import { priceTermsSchema, storageCentsSchema as cents } from './spine-value-schemas';

const id = z.uuid();
const meter = z.number().int().nonnegative();
const decision = z.enum(['approved', 'declined', 'manual_review', 'incomplete']);
const status = z.enum(['active', 'bought', 'returned', 'passed_on']);
const kind = z.enum(['rent', 'down_payment', 'buyout']);
const answers = z.record(z.string(), z.union([z.string(), cents, z.array(z.string())]));
const maintenance = z.object({
  batteryReplacementAtUsage: meter.optional(),
  lastServiceAtUsage: meter.optional(),
});
const offer = z.object({
  priceCents: cents,
  source: z.string(),
  releaseRevision: meter,
});
const readiness = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    tasks: z.array(
      z.object({
        id: z.string(),
        netCostCents: meter,
        units: meter,
        resetsUsage: z.boolean(),
      })
    ),
    totalNetCents: meter,
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum([
      'condition_too_low',
      'unsupported_upgrade',
      'missing_service_history',
      'unsupported_service_rule',
    ]),
  }),
]);

export const quoteViewSchema = z.object({
  id,
  customerId: z.string(),
  assetId: z.string(),
  pricedOn: isoDateSchema,
  startDate: isoDateSchema,
  validThrough: isoDateSchema,
  priceSource: z.string(),
  terms: priceTermsSchema,
});
export const applicationViewSchema = z.object({
  id,
  quoteId: id,
  decision,
  reasons: z.array(z.string()),
  missingQuestionIds: z.array(z.string()),
  invalidQuestionIds: z.array(z.string()),
  answers,
});
const taxed = {
  netCents: cents,
  vatBasisPoints: cents,
  vatCents: cents,
  grossCents: cents,
};
const invoice = z.object({
  ...taxed,
  id: z.string(), // Issued ids are deterministic contract:kind:period strings, not UUIDs.
  kind,
  period: meter,
  scheduledFor: isoDateSchema,
  invoiceDate: isoDateSchema,
  dueDate: isoDateSchema,
});
const forecast = z.object({
  ...taxed,
  period: meter.positive(),
  invoiceDate: isoDateSchema,
  dueDate: isoDateSchema,
});
export const contractViewSchema = z.object({
  id,
  assetId: z.string(),
  lifeNumber: meter.positive(),
  signedOn: isoDateSchema,
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  status,
  closedOn: isoDateSchema.nullable(),
  nextCustomerId: z.string().nullable(),
  priceSource: z.string(),
  pricedOn: isoDateSchema,
  validThrough: isoDateSchema,
  terms: priceTermsSchema,
  invoices: z.array(invoice),
  forecast: z.array(forecast),
  forecastAvailable: z.boolean(),
  nextScheduledDate: isoDateSchema.nullable(),
});
export const contractListSchema = z.array(
  z.object({
    id,
    asset_id: z.string(),
    status,
    life_number: meter.positive(),
    start_date: isoDateSchema,
    end_date: isoDateSchema,
  })
);
export const bootstrapSchema = z.object({
  businessDate: isoDateSchema,
  simulated: z.boolean(),
  customer: customerSchema,
  customers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.enum(['consumer', 'sole_trader', 'company']),
    })
  ),
  asset: assetSchema,
  offer: offer.nullable(),
  releaseRevision: meter,
  refurbishmentCosts: refurbishmentCostsSchema,
  maintenance,
  reservedForSelectedCustomer: z.boolean(),
  availableForSelectedCustomer: z.boolean(),
  coefficientTable: coefficientTableSchema,
  vatRates: vatRatesSchema,
  questions: z.array(questionSchema),
  readiness: readiness.nullable(),
});
export const dealerWorkspaceSchema = bootstrapSchema
  .pick({
    businessDate: true,
    asset: true,
    offer: true,
    releaseRevision: true,
    refurbishmentCosts: true,
    maintenance: true,
  })
  .extend({
    returnedItems: z.array(z.object({ id: z.string(), make: z.string(), model: z.string() })),
    valuationReason: z.string().nullable(),
    valuationBaseline: valuationBaselineSchema.nullable(),
    nextActions: dealerNextActionsSchema,
    reservation: z.object({ reserved: z.boolean(), customerName: z.string().nullable() }),
  });
export const relistViewSchema = z.object({
  assetId: z.string(),
  readyOn: isoDateSchema,
  offer,
});
export const passportSchema = z.object({
  asset: assetSchema,
  lives: z.array(
    z.object({
      life_number: meter.positive(),
      start_date: isoDateSchema,
      end_date: isoDateSchema,
      closed_on: isoDateSchema.nullable(),
      status,
    })
  ),
  earlierLivesWithoutRecords: meter,
});
export const auditSchema = z.array(
  z.object({
    id: meter.positive(),
    at: z.iso.datetime({ offset: true }),
    actor: z.string(),
    action: z.string(),
    entityType: z.string(),
    entityId: z.string(),
  })
);
