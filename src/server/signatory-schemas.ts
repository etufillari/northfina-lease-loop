// The contract of the signatory routes (D46): params, bodies and responses, for the route
// table in routes.ts and the route files.
import { z } from 'zod';
import { isoDateSchema } from '@/data/schemas';
import { signatoryEmailSchema, signatoryNameSchema } from '@/domain/rows/signatory';

/** What the signatory does with the link. */
export const signingActionSchema = z.enum(['sign', 'decline']);
export type SigningAction = z.infer<typeof signingActionSchema>;

export const customerIdParamsSchema = z.object({ id: z.string().min(1).max(100) });

export const signatoryParamsSchema = z.object({
  id: z.string().min(1).max(100),
  signatoryId: z.string().min(1).max(100),
});

export const signingTokenParamsSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{32,64}$/),
});

/** Body of `POST /api/customers/[id]/signatories`: valid from `validFrom` up to, not including, `validTo`. */
export const addSignatoryBodySchema = z.strictObject({
  name: signatoryNameSchema,
  email: signatoryEmailSchema,
  validFrom: isoDateSchema,
  validTo: isoDateSchema.nullable().default(null),
});

/** Body of `POST /api/sign/[token]`. */
export const signByTokenBodySchema = z.strictObject({ action: signingActionSchema });

export const signatorySchema = z.object({
  id: z.string(),
  customerId: z.string(),
  name: z.string(),
  email: z.string(),
  grantedBy: z.string(),
  grantedOn: isoDateSchema,
  validFrom: isoDateSchema.nullable(),
  validTo: isoDateSchema.nullable(),
  state: z.enum(['active', 'waiting_for_link', 'not_yet_valid', 'ended']),
});

export const signatoryListSchema = z.array(signatorySchema);

export const signingLinkSchema = z.object({
  applicationId: z.string(),
  customerId: z.string(),
  signatoryName: z.string(),
  signatoryEmail: z.string(),
  sentOn: isoDateSchema,
  expiresOn: isoDateSchema,
  outcome: z.object({
    code: z.enum(['pending', 'expired', 'already_used']),
    params: z.record(z.string(), z.string()),
  }),
});
